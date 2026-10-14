const MODES = [
  ['fresh', '偏向很久没吃的'],
  ['uniform', '完全随机'],
  ['fav', '偏向经常吃的'],
];

const MODE_HINTS = {
  fresh: '越久没吃的越容易被抽中，从没吃过的机会最大。',
  uniform: '每一项被抽中的机会都相同。',
  fav: '吃得越多的越容易被抽中，适合只想在心头好里挑。',
};

const SPEEDS = [[0.4, '很快'], [0.7, '快'], [1, '正常'], [1.6, '慢'], [2.5, '很慢']];

const AVOIDS = [[0, '不避开'], [1, '今天吃过的'], [3, '最近 3 天吃过的'], [7, '最近 7 天吃过的'], [14, '最近 14 天吃过的']];

const COOLS = [[1, '1 天'], [3, '3 天'], [7, '1 周'], [14, '2 周'], [30, '1 个月'], [90, '3 个月']];

const fmtCool = until => {
  const days = Math.ceil((until - Date.now()) / DAY);
  return days <= 1 ? '明天之前不会抽到' : `还有 ${days} 天才会抽到`;
};

const picker = { current: null, first: null, rerolls: 0, rolling: false, accepted: false };

function skipToday() {
  const s = store.get('skip', null);
  return s && s.day === dayKey() ? s.ids : [];
}

function poolOf() {
  const skip = new Set(skipToday());
  const on = Data.itemsIn(currentScope()).filter(it => it.on && !skip.has(it.id) && !Data.cooling(it));
  if (!settings.avoid) return { pool: on, relaxed: false };
  const now = Date.now();
  const fresh = on.filter(it => {
    const last = Data.stat(it.id).last;
    return !last || daysBetween(last, now) >= settings.avoid;
  });
  return fresh.length ? { pool: fresh, relaxed: false } : { pool: on, relaxed: on.length > 0 };
}

function hourFactor(s, hour) {
  if (s.count < 2) return 1;
  let near = 0;
  for (let d = -2; d <= 2; d++) near += s.hours[(hour + d + 24) % 24] * [0.25, 0.5, 1, 0.5, 0.25][d + 2];
  const ratio = near / s.count / (2.5 / 24);
  const conf = s.count / (s.count + 4);
  return Math.min(1.5, Math.max(0.75, 1 + 0.25 * conf * (ratio - 1)));
}

function ratingFactor(s) {
  if (!s.rN) return 1;
  const conf = s.rN / (s.rN + 2);
  return 1 + 0.3 * conf * (avgOf(s) - 3) / 2;
}

function baseWeight(s) {
  if (settings.mode === 'uniform') return 1;
  if (settings.mode === 'fav') return s.count + 1;
  return s.last ? Math.min(daysBetween(s.last, Date.now()), 60) + 1 : 75;
}

function weightOf(it, hour = new Date().getHours()) {
  const s = Data.stat(it.id);
  const w = baseWeight(s);
  return settings.smart ? w * hourFactor(s, hour) * ratingFactor(s) : w;
}

function drawFrom(pool) {
  const hour = new Date().getHours();
  const weights = pool.map(it => weightOf(it, hour));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let k = 0; k < pool.length; k++) {
    r -= weights[k];
    if (r < 0) return pool[k];
  }
  return pool[pool.length - 1];
}

function describe(it) {
  const s = Data.stat(it.id);
  if (!s.count) return '还没吃过，试试新口味';
  return `吃过 ${s.count} 次 · 上次是${fmtAgo(s.last)}`;
}

function renderPick() {
  const it = picker.current && Data.get(picker.current);
  const box = $('#pickBox');
  if (!it) {
    picker.current = null;
    $('#pickName').textContent = '吃什么？';
    $('#pickMeta').textContent = '';
    $('#pickHint').textContent = '';
    box.classList.remove('landed');
  } else if (!picker.rolling) {
    $('#pickName').textContent = it.name;
    const cool = Data.cooling(it);
    $('#pickMeta').textContent = picker.accepted ? `已记录，这是第 ${Data.stat(it.id).count} 次吃` : describe(it);
    if (cool) $('#pickMeta').append(` · 冷却中，${fmtCool(cool)}`);
    const s = Data.stat(it.id);
    if (s.rN) $('#pickMeta').append(el('br'), starsEl(avgOf(s), s.rN, true));
    $('#pickHint').textContent = picker.accepted ? '祝你吃得开心' : picker.rerolls ? `已经换了 ${picker.rerolls} 次` : '就决定是你了';
  }
  const shown = !!it && !picker.rolling;
  const pending = shown && !picker.accepted;
  $('#acceptBtn').hidden = !pending;
  $('#skipBtn').hidden = !pending;
  $('#pickShareBtn').hidden = !shown;
  $('#coolWrap').hidden = !shown;
  if (shown) renderCoolSel(it);
  $('#spinLabel').textContent = pending ? '换一个' : '随机一下';
  $('#spinBtn').disabled = picker.rolling;
  $('#acceptBtn').disabled = picker.rolling;
  renderPoolInfo();
}

function renderPoolInfo() {
  const { pool, relaxed } = poolOf();
  const info = $('#poolInfo');
  const skip = skipToday().filter(id => Data.get(id));
  const parts = [];
  const scope = currentScope();
  const where = scope === ALL ? '' : `${Data.scopeName(scope)}：`;
  if (!Data.itemsIn(scope).length) parts.push(scope === ALL ? '菜单是空的，先在下面添加几项吧' : `${where}这个分组还是空的，先在下面添加几项吧`);
  else if (!pool.length) parts.push(`${where}没有可以抽的了，在下面勾选几项参与抽选吧`);
  else parts.push(`${where}${pool.length} 项参与抽选`);
  if (relaxed) parts.push('最近都吃过了，暂时不避开');
  const cooling = Data.itemsIn(scope).filter(it => it.on && Data.cooling(it)).length;
  if (cooling) parts.push(`${cooling} 项冷却中`);
  info.replaceChildren(parts.join('，'));
  if (skip.length) {
    const b = el('button', 'link', `恢复今天排除的 ${skip.length} 项`);
    b.type = 'button';
    b.onclick = () => {
      store.set('skip', null);
      renderPoolInfo();
    };
    info.append(' ', b);
  }
}

function spin() {
  if (picker.rolling) return;
  const { pool } = poolOf();
  if (!pool.length) {
    renderPick();
    $('#poolInfo').classList.add('shake');
    setTimeout(() => $('#poolInfo').classList.remove('shake'), 500);
    return;
  }
  const rerolling = picker.current && !picker.accepted;
  if (!rerolling) {
    picker.first = null;
    picker.rerolls = 0;
  } else {
    picker.rerolls++;
  }
  const candidates = rerolling && pool.length > 1 ? pool.filter(it => it.id !== picker.current) : pool;
  const pick = drawFrom(candidates);
  const echo = picker.rerolls >= 2 && pick.id === picker.first;
  picker.first ||= pick.id;
  picker.current = pick.id;
  picker.accepted = false;
  Achv.spun({ rerolls: picker.rerolls, echo });

  const box = $('#pickBox');
  box.classList.remove('landed');
  if (!settings.anim || REDUCED_MOTION || pool.length < 2) {
    renderPick();
    void box.offsetWidth;
    box.classList.add('landed');
    return;
  }
  picker.rolling = true;
  renderPick();
  $('#pickHint').textContent = '命运的齿轮开始转动';
  $('#pickMeta').textContent = '';
  box.classList.add('rolling');
  const steps = 16;
  let k = 0;
  let last = null;
  const tick = () => {
    if (k >= steps) {
      picker.rolling = false;
      box.classList.remove('rolling');
      renderPick();
      void box.offsetWidth;
      box.classList.add('landed');
      return;
    }
    let it;
    do it = pool[Math.floor(Math.random() * pool.length)]; while (pool.length > 1 && it === last);
    last = it;
    $('#pickName').textContent = it.name;
    k++;
    setTimeout(tick, (40 + 220 * (k / steps) ** 3) * settings.speed);
  };
  tick();
}

function accept() {
  const it = picker.current && Data.get(picker.current);
  if (!it || picker.rolling) return;
  picker.accepted = true;
  logMeal(it.id);
  Achv.accepted(picker.rerolls === 0);
  renderPick();
}

function skipCurrent() {
  const it = picker.current && Data.get(picker.current);
  if (!it || picker.rolling) return;
  const ids = skipToday();
  if (!ids.includes(it.id)) ids.push(it.id);
  store.set('skip', { day: dayKey(), ids });
  Achv.skipped();
  picker.current = null;
  spin();
}

function renderCoolSel(it) {
  const sel = $('#coolSel');
  const cool = Data.cooling(it);
  sel.replaceChildren(
    new Option(cool ? `冷却到 ${dayKey(new Date(cool)).slice(5)}` : '冷却期', ''),
    ...COOLS.map(([d, name]) => new Option(`${name}内不再抽到`, d)),
  );
  if (cool) sel.append(new Option('解除冷却', -1));
  sel.value = '';
}

function coolCurrent() {
  const it = picker.current && Data.get(picker.current);
  const v = Number($('#coolSel').value);
  if (!it || !v) return;
  if (v < 0) {
    Data.setCool(it.id, 0);
    notify(`已解除“${it.name}”的冷却`);
    return;
  }
  const until = Date.now() + v * DAY;
  Data.setCool(it.id, until);
  Achv.cooled();
  notify(`“${it.name}”冷却 ${COOLS.find(c => c[0] === v)[1]}`, '撤销', () => Data.setCool(it.id, 0));
}

function bindPicker() {
  $('#coolSel').onchange = coolCurrent;
  $('#spinBtn').onclick = spin;
  $('#acceptBtn').onclick = accept;
  $('#skipBtn').onclick = skipCurrent;
  $('#pickShareBtn').onclick = () => picker.current && openShare('pick', picker.current);
  Data.onChange(renderPick);
  renderPick();
}
