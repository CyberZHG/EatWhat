const SORTS = [
  ['stale', '距上次吃最久的在前'],
  ['recent', '最近吃过的在前'],
  ['most', '吃得最多的在前'],
  ['least', '吃得最少的在前'],
  ['first', '最早开吃的在前'],
  ['newest', '最近添加的在前'],
  ['name', '按名称'],
];

const collator = new Intl.Collator('zh-CN', { numeric: true });

const SORTERS = {
  stale: (a, b) => (a.s.last || -Infinity) - (b.s.last || -Infinity),
  recent: (a, b) => (b.s.last || -Infinity) - (a.s.last || -Infinity),
  most: (a, b) => b.s.count - a.s.count || (b.s.last || 0) - (a.s.last || 0),
  least: (a, b) => a.s.count - b.s.count || (a.s.last || 0) - (b.s.last || 0),
  first: (a, b) => (a.s.first || Infinity) - (b.s.first || Infinity),
  newest: (a, b) => b.it.added - a.it.added,
  name: (a, b) => collator.compare(a.it.name, b.it.name),
};

function visibleRows() {
  const q = $('#searchInput').value.trim().toLowerCase();
  const rows = Data.itemsIn(currentScope())
    .filter(it => !q || it.name.toLowerCase().includes(q))
    .map(it => ({ it, s: Data.stat(it.id) }));
  const sorter = SORTERS[settings.sort] || SORTERS.stale;
  return rows.sort((a, b) => sorter(a, b) || collator.compare(a.it.name, b.it.name));
}

function iconBtn(icon, title, act) {
  const b = el('button', 'icon-btn small');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', title);
  b.dataset.act = act;
  b.innerHTML = ICONS[icon];
  return b;
}

function renderList() {
  const rows = visibleRows();
  const list = $('#itemList');
  const scope = currentScope();
  const max = Math.max(1, ...Data.itemsIn(scope).map(it => Data.stat(it.id).count));
  list.replaceChildren(...rows.map(({ it, s }) => {
    const li = el('li', it.on ? 'item' : 'item off');
    li.dataset.id = it.id;
    const chk = el('input');
    chk.type = 'checkbox';
    chk.checked = it.on;
    chk.dataset.act = 'toggle';
    chk.title = '参与随机抽选';
    chk.setAttribute('aria-label', `${it.name} 参与随机抽选`);
    const info = el('div', 'grow');
    const name = el('div', 'name', it.name);
    const parts = [s.count ? `${s.count} 次 · ${fmtAgo(s.last)}` : '从没吃过'];
    if (scope === ALL && it.group) parts.unshift(Data.group(it.group).name);
    const cool = Data.cooling(it);
    if (cool) parts.push(`冷却中，剩 ${Math.ceil((cool - Date.now()) / DAY)} 天`);
    if (it.canteen) {
      const n = Data.dishes().filter(d => d.items.has(it.id)).length;
      parts.push(n ? `${n} 道菜` : '每次记录菜名');
    }
    const meta = el('div', 'meta', parts.join(' · '));
    const track = el('div', 'mini-track');
    const fill = el('div', 'mini-fill');
    fill.style.width = `${s.count / max * 100}%`;
    track.append(fill);
    info.append(name, meta);
    if (s.rN) info.append(starsEl(avgOf(s), s.rN, true));
    info.append(track);
    const log = el('button', 'log-btn', '记一次');
    log.type = 'button';
    log.dataset.act = 'log';
    const del = iconBtn('trash', '删除', 'del');
    if (it.canteen) {
      del.disabled = true;
      del.title = '食堂不能删除';
      del.setAttribute('aria-label', del.title);
    }
    li.append(chk, info, log, iconBtn('edit', '编辑', 'edit'), del);
    return li;
  }));
  const inScope = Data.itemsIn(scope);
  const on = inScope.filter(it => it.on).length;
  const info = $('#listInfo');
  const q = $('#searchInput').value.trim();
  info.replaceChildren(q
    ? `找到 ${rows.length} 项`
    : `${scope === ALL ? '' : Data.scopeName(scope) + '：'}共 ${inScope.length} 项，${on} 项参与抽选`);
  if (!rows.length && q) {
    const b = el('button', 'link', `添加“${normName(q).slice(0, 40)}”`);
    b.type = 'button';
    b.onclick = () => {
      addNames(q);
      $('#searchInput').value = '';
      renderList();
    };
    info.append('，', b);
  } else if (rows.length) {
    const ids = rows.map(r => r.it.id);
    const allOn = rows.every(r => r.it.on);
    const b = el('button', 'link', allOn ? '全部不参与' : '全部参与');
    b.type = 'button';
    b.onclick = () => Data.setOn(ids, !allOn);
    info.append(' ', b);
  }
}

function addNames(text) {
  const scope = currentScope();
  const { added, dup } = Data.add(text, scope === ALL ? NONE : scope);
  if (added.length) Achv.added(added.length);
  if (added.length && dup.length) notify(`已添加 ${added.length} 项，${dup.length} 项已存在`);
  else if (added.length) {
    const to = scope === ALL || scope === NONE ? '' : `到“${Data.scopeName(scope)}”`;
    notify(added.length === 1 ? `已添加“${added[0].name}”${to}` : `已添加 ${added.length} 项${to}`);
  }
  else if (dup.length) notify(`“${dup[0]}”已经在菜单里了`);
  return added.length;
}

function logNow(id) {
  const entry = logMeal(id);
  if (!entry) return;
  notify(`已记录：${entry.name}，第 ${Data.stat(id).count} 次`, '撤销', () => Data.unlog(entry.id));
}

function removeItem(id) {
  const it = Data.get(id);
  if (!it || it.canteen) return false;
  const n = Data.stat(id).count;
  if (!confirm(`从菜单中删除“${it.name}”？${n ? `\n已有的 ${n} 条吃饭记录会保留。` : ''}`)) return false;
  Data.remove(id);
  Achv.removed();
  if (picker.current === id) picker.current = null;
  return true;
}

function bindList() {
  bindSelect('sortSel', 'sort', SORTS, renderList);
  $('#addForm').onsubmit = e => {
    e.preventDefault();
    const input = $('#addInput');
    if (!input.value.trim()) return input.focus();
    if (addNames(input.value)) input.value = '';
  };
  $('#searchInput').oninput = renderList;
  $('#itemList').addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const act = t?.dataset.act;
    if (act === 'toggle') Data.update(id, { on: t.checked });
    else if (act === 'log') logNow(id);
    else if (act === 'edit') openEditor(id);
    else if (act === 'del') {
      if (!t.disabled) removeItem(id);
    }
    else if (!t) openEditor(id);
  });
  Data.onChange(renderList);
  renderList();
}
