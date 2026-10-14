const SYNC_PREFIX = 'EW1';
const SETTING_KEYS = ['mode', 'avoid', 'anim', 'sort', 'smart'];
const syncView = { incoming: null, text: '' };

const toMin = t => Math.round(t / MINUTE);

function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

function packState() {
  const groups = Data.groups;
  const gIdx = new Map(groups.map((g, k) => [g.id, k]));
  const items = Data.items.map(it => ({ it, gone: false }));
  const iIdx = new Map(Data.items.map((it, k) => [it.id, k]));
  const dishes = [];
  const dIdx = new Map();
  const dish = d => {
    const k = nameKey(d);
    if (!dIdx.has(k)) {
      dIdx.set(k, dishes.length);
      dishes.push(d);
    }
    return dIdx.get(k);
  };
  let prev = 0;
  const hist = Data.history.map(h => {
    if (!iIdx.has(h.item)) {
      iIdx.set(h.item, items.length);
      items.push({ it: { name: h.name, group: h.group || NONE }, gone: true });
    }
    const at = toMin(h.at);
    const row = [iIdx.get(h.item), at - prev, h.r === undefined ? 0 : h.r === 0 ? 9 : h.r];
    prev = at;
    if (h.dishes) {
      row.push(h.dishes.map(dish));
      if (h.dr) row.push(h.dishes.map(d => h.dr[d] || 0));
    }
    while (row.length > 2 && !row[row.length - 1]) row.pop();
    return row;
  });
  const now = Date.now();
  const st = {
    v: 1,
    t: toMin(now),
    g: groups.map(g => g.name),
    i: items.map(({ it, gone }) => {
      const flags = (it.on ? 1 : 0) | (it.canteen ? 2 : 0) | (gone ? 4 : 0);
      const row = [it.name, gIdx.has(it.group) ? gIdx.get(it.group) : -1, flags, it.added ? toMin(it.added) : 0, it.cool && it.cool > now ? toMin(it.cool) : 0];
      while (row.length > 3 && !row[row.length - 1]) row.pop();
      return row;
    }),
    d: dishes,
    h: hist,
    c: store.get('counters', {}),
    a: Object.fromEntries(Object.entries(store.get('achv', {})).map(([k, v]) => [k, toMin(v)])),
    s: Object.fromEntries(SETTING_KEYS.map(k => [k, settings[k]])),
  };
  return st;
}

function unpackState(st) {
  if (!st || st.v !== 1 || !Array.isArray(st.i) || !Array.isArray(st.h)) throw new Error('同步码无法识别');
  const groups = (st.g || []).map(name => ({ id: uid(), name: String(name) }));
  const items = st.i.map(([name, g, flags, added, cool]) => ({
    id: uid(),
    name: String(name),
    group: groups[g]?.id ?? NONE,
    on: !!(flags & 1),
    canteen: !!(flags & 2),
    gone: !!(flags & 4),
    added: added ? added * MINUTE : Date.now(),
    cool: cool ? cool * MINUTE : 0,
  }));
  let at = 0;
  const history = st.h.map(([i, delta, r, ds, drs]) => {
    at += delta;
    const it = items[i];
    if (!it) throw new Error('同步码已损坏');
    const h = { id: uid(), item: it.id, name: it.name, at: at * MINUTE };
    if (it.gone) h.group = it.group;
    if (r) h.r = r === 9 ? 0 : r;
    if (ds?.length) {
      h.dishes = ds.map(k => String(st.d[k]));
      if (drs?.length) {
        const dr = {};
        h.dishes.forEach((d, k) => { if (drs[k]) dr[d] = drs[k]; });
        if (Object.keys(dr).length) h.dr = dr;
      }
    }
    return h;
  });
  const clean = items.filter(it => !it.gone).map(({ gone, cool, ...it }) => (cool > Date.now() ? { ...it, cool } : it));
  return {
    exportedAt: st.t * MINUTE,
    groups,
    items: clean,
    history,
    counters: st.c || {},
    achv: Object.fromEntries(Object.entries(st.a || {}).map(([k, v]) => [k, v * MINUTE])),
    settings: st.s || {},
  };
}

async function encodeSync() {
  const json = new TextEncoder().encode(JSON.stringify(packState()));
  if ('CompressionStream' in window) {
    try {
      return `${SYNC_PREFIX}z${b64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
    } catch {}
  }
  return `${SYNC_PREFIX}j${b64url(json)}`;
}

async function decodeSync(text) {
  const m = String(text).match(/EW1([zj])([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('没有找到有效的同步码');
  let bytes = unb64url(m[2]);
  if (m[1] === 'z') {
    if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持解压同步码，请升级浏览器');
    bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  }
  return unpackState(JSON.parse(new TextDecoder().decode(bytes)));
}

function mergeState(inc) {
  const groups = store.get('groups', []).map(g => ({ ...g }));
  const items = store.get('items', []).map(it => ({ ...it }));
  const history = store.get('history', []).map(h => ({ ...h }));
  const gMap = new Map();
  inc.groups.forEach(g => {
    let local = groups.find(x => nameKey(x.name) === nameKey(g.name));
    if (!local) groups.push(local = { id: uid(), name: g.name });
    gMap.set(g.id, local.id);
  });
  const iMap = new Map();
  inc.items.forEach(it => {
    let local = items.find(x => nameKey(x.name) === nameKey(it.name));
    if (!local) {
      items.push(local = { ...it, id: uid(), group: gMap.get(it.group) ?? NONE });
    } else {
      if (!local.group && it.group) local.group = gMap.get(it.group) ?? NONE;
      if (it.canteen) local.canteen = true;
      if ((it.cool || 0) > (local.cool || 0)) local.cool = it.cool;
    }
    iMap.set(it.id, local.id);
  });
  const key = (name, at) => `${nameKey(name)}|${toMin(at)}`;
  const seen = new Map(history.map(h => [key(h.name, h.at), h]));
  let added = 0;
  inc.history.forEach(h => {
    const k = key(h.name, h.at);
    const local = seen.get(k);
    if (local) {
      if (local.r === undefined && h.r !== undefined) local.r = h.r;
      if (!local.dishes && h.dishes) {
        local.dishes = h.dishes;
        if (h.dr) local.dr = h.dr;
      }
      return;
    }
    const item = iMap.get(h.item);
    const copy = { ...h, id: uid() };
    if (item) {
      copy.item = item;
      delete copy.group;
    } else if (copy.group) {
      copy.group = gMap.get(copy.group) ?? NONE;
    }
    history.push(copy);
    added++;
  });
  history.sort((a, b) => a.at - b.at);
  const counters = { ...store.get('counters', {}) };
  Object.entries(inc.counters).forEach(([k, v]) => { counters[k] = Math.max(counters[k] || 0, v || 0); });
  const achv = { ...store.get('achv', {}) };
  Object.entries(inc.achv).forEach(([k, v]) => { achv[k] = achv[k] ? Math.min(achv[k], v) : v; });
  return { groups, items, history, counters, achv, added };
}

function applySync(mode) {
  const inc = syncView.incoming;
  if (!inc) return;
  const next = mode === 'merge' ? mergeState(inc) : { ...inc };
  next.counters = { ...next.counters, syncs: (next.counters.syncs || 0) + 1 };
  Achv.freeze();
  store.set('groups', next.groups);
  store.set('items', next.items);
  store.set('history', next.history);
  store.set('counters', next.counters);
  store.set('achv', next.achv);
  store.set('seed.canteen', true);
  store.set('skip', null);
  if (mode === 'replace') SETTING_KEYS.forEach(k => { if (k in inc.settings) store.set(k, inc.settings[k]); });
  store.set('syncDone', mode === 'merge' ? `合并完成，新增 ${next.added} 条记录` : '已用另一台设备的数据覆盖');
  history.replaceState(null, '', location.pathname);
  location.reload();
}

function showIncoming(inc) {
  syncView.incoming = inc;
  const when = new Date(inc.exportedAt).toLocaleString('zh-CN');
  $('#syncInfo').textContent = `来自 ${when} 的数据：${inc.items.length} 项菜单，${inc.groups.length} 个分组，${inc.history.length} 条吃饭记录。`;
  $('#syncInDlg').showModal();
}

async function importSyncText(text, fromLink = false) {
  try {
    showIncoming(await decodeSync(text));
    if (!fromLink) msg('syncMsg', '');
  } catch (e) {
    if (fromLink) notify(`同步链接无效：${e.message}`);
    else msg('syncMsg', e.message, true);
  }
}

async function openSyncOut() {
  msg('syncMsg', '正在生成…');
  try {
    syncView.text = await encodeSync();
  } catch (e) {
    return msg('syncMsg', '生成失败：' + e.message, true);
  }
  msg('syncMsg', '');
  const url = `${location.origin}${location.pathname}#sync=${syncView.text}`;
  syncView.url = url;
  const bytes = new TextEncoder().encode(url);
  const qr = bytes.length <= QR.capacity('L') ? QR.encode(bytes, 'M') : null;
  const cv = $('#syncQr');
  cv.hidden = !qr;
  if (qr) {
    const scale = Math.max(2, Math.floor(720 / (qr.modules.length + 8)));
    QR.draw(cv, qr.modules, scale);
  }
  const kb = (syncView.text.length / 1024).toFixed(1);
  $('#syncOutInfo').textContent = qr
    ? `用另一台设备的相机扫描二维码，会打开本网页并询问合并还是覆盖。数据大小 ${kb} KB。`
    : `数据有 ${kb} KB，超出了一个二维码的容量。请复制同步码，通过聊天软件或邮件发到另一台设备，在那里的“粘贴同步码”中导入。`;
  $('#syncOutDlg').showModal();
}

async function copyText(text, label) {
  try {
    await navigator.clipboard.writeText(text);
    notify(`已复制${label}`);
  } catch {
    const t = el('textarea');
    t.value = text;
    document.body.append(t);
    t.select();
    const ok = document.execCommand('copy');
    t.remove();
    notify(ok ? `已复制${label}` : '复制失败，请手动复制');
  }
}

function bindSync() {
  $('#syncOutBtn').onclick = openSyncOut;
  $('#syncInBtn').onclick = () => {
    const v = $('#syncInput').value.trim();
    if (!v) return msg('syncMsg', '请先粘贴同步码或链接', true);
    importSyncText(v);
  };
  $('#syncCopyCode').onclick = () => copyText(syncView.text, '同步码');
  $('#syncCopyLink').onclick = () => copyText(syncView.url, '同步链接');
  $('#syncOutClose').onclick = () => $('#syncOutDlg').close();
  $('#syncMerge').onclick = () => applySync('merge');
  $('#syncReplace').onclick = () => {
    if (confirm('覆盖会删除当前设备上的菜单、记录、统计和成就，换成导入的数据。确定吗？')) applySync('replace');
  };
  $('#syncCancel').onclick = () => {
    syncView.incoming = null;
    $('#syncInDlg').close();
  };
  const done = store.get('syncDone', null);
  if (done) {
    store.set('syncDone', null);
    setTimeout(() => notify(done), 300);
  }
  checkSyncHash();
  addEventListener('hashchange', checkSyncHash);
}

function checkSyncHash() {
  const m = location.hash.match(/^#sync=(.+)$/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  importSyncText(m[1], true);
}
