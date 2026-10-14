const heatLevel = n => Math.min(n, 4);

const statView = { scope: ALL };

function scopedStats() {
  if (!Data.validScope(statView.scope)) statView.scope = ALL;
  const scope = statView.scope;
  const hist = Data.historyIn(scope);
  return { scope, hist, s: computeStats(hist, Data.itemsIn(scope)) };
}

function heatDays(weeks, daily) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (today.getDay() + 6) % 7 - (weeks - 1) * 7);
  const days = [];
  for (let k = 0; k < weeks * 7; k++) {
    const d = new Date(start);
    d.setDate(start.getDate() + k);
    const key = dayKey(d);
    days.push({ key, future: d > today, n: daily[key] || 0 });
  }
  return days;
}

function renderHeatmap(first, daily) {
  if (first) hideHeatTip();
  const wrap = $('#heatmap');
  const prev = wrap.querySelector('.heat-scroll')?.scrollLeft;
  const days = heatDays(53, daily);
  const grid = el('div', 'heat-grid');
  let count = 0, total = 0;
  for (const d of days) {
    const cell = el('div', d.future ? 'heat-cell future' : `heat-cell l${heatLevel(d.n)}`);
    if (!d.future) {
      cell.dataset.tip = `${d.key}：${d.n ? `${d.n} 顿` : '没有记录'}`;
      if (d.n) {
        count++;
        total += d.n;
      }
    }
    grid.append(cell);
  }
  const scroll = el('div', 'heat-scroll');
  scroll.append(grid);
  const legend = el('div', 'heat-legend');
  legend.append(el('span', '', `过去一年 ${count} 天有记录，共 ${total} 顿`), el('span', 'grow'), '少');
  for (let l = 0; l <= 4; l++) legend.append(el('span', `heat-cell l${l}`));
  legend.append('多');
  wrap.replaceChildren(scroll, legend);
  scroll.scrollLeft = first || prev === undefined ? scroll.scrollWidth : prev;
}

function periodCounts(hist) {
  const now = new Date();
  const today = dayKey(now);
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - (now.getDay() + 6) % 7);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let day = 0, week = 0, month = 0;
  for (const h of hist) {
    if (dayKey(new Date(h.at)) === today) day++;
    if (h.at >= weekStart.getTime()) week++;
    if (h.at >= monthStart) month++;
  }
  return { day, week, month };
}

function topItems(n, hist) {
  const per = new Map();
  for (const h of hist) {
    const key = Data.get(h.item) ? h.item : 'name:' + h.name;
    const cur = per.get(key) || { name: Data.entryName(h), count: 0, last: 0 };
    cur.count++;
    cur.last = h.at;
    per.set(key, cur);
  }
  return [...per.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, n);
}

function barList(rows) {
  const ul = el('ul', 'ranks');
  const max = Math.max(1, ...rows.map(r => r.value));
  rows.forEach((r, k) => {
    const li = el('li');
    const head = el('div', 'rank-head');
    head.append(el('span', 'rank-no', r.no ?? String(k + 1)), el('span', 'name grow', r.name));
    if (r.stars) head.append(starsEl(r.stars[0], undefined, true));
    head.append(el('span', 'meta', r.label));
    const track = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.width = `${r.value / max * 100}%`;
    track.append(fill);
    li.append(head, track);
    ul.append(li);
  });
  return ul;
}

function ratingRows(hist) {
  const per = new Map();
  const dishes = new Map();
  const bump = (map, key, name, r) => {
    const cur = map.get(key) || { name, rSum: 0, rN: 0, bad: 0, count: 0 };
    cur.count++;
    if (r) {
      cur.rSum += r;
      cur.rN++;
      if (r === 1) cur.bad++;
    }
    map.set(key, cur);
  };
  for (const h of hist) {
    bump(per, Data.get(h.item) ? h.item : 'name:' + h.name, Data.entryName(h), h.r);
    (h.dishes || []).forEach(d => bump(dishes, nameKey(d), d, h.dr?.[d]));
  }
  return { per: [...per.values()], dishes: [...dishes.values()] };
}

function hourChart(hist) {
  const hours = Array(24).fill(0);
  hist.forEach(h => hours[new Date(h.at).getHours()]++);
  const max = Math.max(1, ...hours);
  const wrap = el('div', 'panel hour-chart');
  const cols = el('div', 'hour-cols');
  hours.forEach((n, k) => {
    const col = el('div', 'hour-col');
    col.title = `${k}:00 - ${k}:59　${n} 顿`;
    col.setAttribute('aria-label', col.title);
    const bar = el('div', 'hour-bar');
    bar.style.height = `${n / max * 100}%`;
    col.append(bar);
    cols.append(col);
  });
  const axis = el('div', 'hour-axis');
  [0, 6, 12, 18, 23].forEach(k => {
    const t = el('span', '', `${k}时`);
    t.style.left = `${(k + 0.5) / 24 * 100}%`;
    axis.append(t);
  });
  const peak = hours.indexOf(Math.max(...hours));
  wrap.append(cols, axis, el('div', 'hint', hist.length ? `最常在 ${peak}:00 - ${peak}:59 吃饭，共 ${hours[peak]} 顿` : ''));
  return wrap;
}

function renderRanks(scope, hist) {
  const box = $('#rankBox');
  box.replaceChildren();
  if (scope === ALL && Data.groups.length) {
    const rows = [...Data.groups.map(g => [g.id, g.name]), [NONE, '未分组']]
      .map(([id, name]) => ({ name, value: hist.filter(h => Data.entryGroup(h) === id).length }))
      .filter(r => r.value)
      .sort((a, b) => b.value - a.value)
      .map(r => ({ ...r, label: `${r.value} 顿 · ${Math.round(r.value / hist.length * 100)}%` }));
    if (rows.length) box.append(el('h2', '', '按分组'), barList(rows));
  }
  if (!hist.length) {
    box.append(el('div', 'panel hint empty-note', scope === ALL ? '还没有吃饭记录' : '这个分组还没有吃饭记录'));
    return;
  }
  box.append(el('h2', '', '最常吃'), barList(topItems(10, hist).map(r => {
    const it = Data.byName(r.name);
    const st = it && Data.stat(it.id);
    return { name: r.name, value: r.count, label: `${r.count} 次`, stars: st?.rN ? [avgOf(st)] : null };
  })));

  const rated = ratingRows(hist);
  if (rated.dishes.length) {
    const rows = [...rated.dishes].sort((a, b) => b.count - a.count).slice(0, 10);
    box.append(el('h2', '', `最常吃的菜 · 共 ${rated.dishes.length} 道`), barList(rows.map(r => ({
      name: r.name, value: r.count, label: `${r.count} 次`, stars: r.rN ? [r.rSum / r.rN] : null,
    }))));
  }

  const scored = [...rated.per, ...rated.dishes].filter(r => r.rN);
  if (scored.length) {
    const best = [...scored].sort((a, b) => b.rSum / b.rN - a.rSum / a.rN || b.rN - a.rN).slice(0, 5);
    box.append(el('h2', '', '评分最高'), barList(best.map(r => ({
      name: r.name, value: r.rSum / r.rN, label: `${fmtAvg(r.rSum / r.rN)} 分 · ${r.rN} 评`, stars: [r.rSum / r.rN],
    }))));
    const bad = scored.filter(r => r.bad).sort((a, b) => b.bad - a.bad || a.rSum / a.rN - b.rSum / b.rN).slice(0, 5);
    if (bad.length) {
      box.append(el('h2', '', '踩雷榜'), barList(bad.map(r => ({
        name: r.name, value: r.bad, label: `踩雷 ${r.bad} 次`, stars: [r.rSum / r.rN],
      }))));
    }
  }

  const now = Date.now();
  const stale = Data.itemsIn(scope)
    .map(it => ({ it, s: Data.stat(it.id) }))
    .filter(r => r.s.count)
    .sort((a, b) => a.s.last - b.s.last)
    .slice(0, 5);
  if (stale.length) {
    box.append(el('h2', '', '好久没吃了'), barList(stale.map(r => {
      const n = daysBetween(r.s.last, now);
      return { name: r.it.name, value: n + 1, label: fmtAgo(r.s.last) };
    })));
  }

  const meals = ['早餐', '午餐', '下午茶', '晚餐', '夜宵'];
  const byMeal = Object.fromEntries(meals.map(m => [m, 0]));
  const byWeek = Array(7).fill(0);
  for (const h of hist) {
    byMeal[meal(h.at)]++;
    byWeek[(new Date(h.at).getDay() + 6) % 7]++;
  }
  const dist = el('div', 'dist');
  const a = el('div');
  a.append(el('h2', '', '按餐段'), barList(meals.map(m => ({ no: '', name: m, value: byMeal[m], label: `${byMeal[m]} 顿` }))));
  const b = el('div');
  b.append(el('h2', '', '按星期'), barList(byWeek.map((v, k) => ({ no: '', name: `周${WEEK[(k + 1) % 7]}`, value: v, label: `${v} 顿` }))));
  dist.append(a, b);
  box.append(dist, el('h2', '', '按钟点'), hourChart(hist));
}

function renderAchvPage(first) {
  const { unlocked, DEFS } = Achv;
  const all = Achv.derive();
  const { scope, hist, s } = scopedStats();
  $('#achvCount').textContent = `已解锁 ${DEFS.filter(d => unlocked[d.id]).length} / ${DEFS.length}`;
  renderChips($('#statScope'), scope, id => {
    statView.scope = id;
    renderAchvPage(true);
  });
  $('#statTitle').textContent = scope === ALL ? '统计' : `统计 · ${Data.scopeName(scope)}`;
  const p = periodCounts(hist);
  const top = topItems(1, hist)[0];
  const items = [
    ['总共吃了', `${fmtNum(s.meals)} 顿`],
    ['吃过种类', `${fmtNum(s.distinct)} 种`],
    ['菜单项数', `${fmtNum(Data.itemsIn(scope).length)} 项`],
    ['今天', `${p.day} 顿`],
    ['本周', `${p.week} 顿`],
    ['本月', `${p.month} 顿`],
    ['记录天数', Achv.fmtDays(s.days)],
    ['当前连续', Achv.fmtDays(s.current)],
    ['最长连续', Achv.fmtDays(s.best)],
    ...(scope === ALL ? [['随机次数', `${fmtNum(all.spins)} 次`]] : [['占全部', `${all.meals ? Math.round(s.meals / all.meals * 100) : 0}%`]]),
    ['最爱', top ? top.name : '暂无'],
    ...(s.dishKinds ? [['吃过的菜', `${fmtNum(s.dishKinds)} 道`]] : []),
    ...(() => {
      const r = hist.filter(h => h.r);
      return r.length ? [['平均评分', `${fmtAvg(r.reduce((a, h) => a + h.r, 0) / r.length)} 分`]] : [];
    })(),
  ];
  $('#statGrid').replaceChildren(...items.map(([label, value]) => {
    const c = el('div', 'stat');
    c.append(el('div', 'label', label), el('div', 'value', value));
    return c;
  }));

  renderHeatmap(first, s.daily);
  renderRanks(scope, hist);

  const list = $('#achvList');
  list.replaceChildren();
  let grid = null, group = null;
  for (const d of DEFS) {
    if (d.group !== group) {
      group = d.group;
      grid = el('div', 'achv-grid');
      list.append(el('h2', '', `成就 · ${group}`), grid);
      if (!list.querySelector('.achv-note') && scope !== ALL) {
        const note = el('div', 'hint achv-note', '成就按全部分组的数据计算');
        list.insertBefore(note, grid);
      }
    }
    const at = unlocked[d.id];
    const v = Math.min(d.value(all), d.goal);
    const card = el('div', at ? 'achv done' : 'achv');
    const badge = el('div', 'badge');
    badge.innerHTML = ICONS[d.icon];
    const info = el('div', 'info');
    const track = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.width = `${(at ? 1 : v / d.goal) * 100}%`;
    track.append(fill);
    info.append(
      el('div', 'name', d.name),
      el('div', 'desc', d.desc),
      track,
      el('div', 'meta', at ? `达成于 ${dayKey(new Date(at))}` : `${d.fmt(v)} / ${d.fmt(d.goal)}`),
    );
    card.append(badge, info);
    grid.append(card);
  }
}

function showHeatTip(cell) {
  const tip = $('#heatTip');
  tip.textContent = cell.dataset.tip;
  tip.hidden = false;
  const r = cell.getBoundingClientRect();
  const w = tip.offsetWidth;
  tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
  tip.style.top = `${r.top - tip.offsetHeight - 6}px`;
  tip.dataset.key = cell.dataset.tip;
}

function hideHeatTip() {
  $('#heatTip').hidden = true;
}

function bindHeatmap() {
  const map = $('#heatmap');
  map.addEventListener('pointerover', e => {
    const cell = e.target.closest('.heat-cell[data-tip]');
    if (cell && e.pointerType === 'mouse') showHeatTip(cell);
  });
  map.addEventListener('pointerleave', hideHeatTip);
  map.addEventListener('click', e => {
    const cell = e.target.closest('.heat-cell[data-tip]');
    if (!cell) return hideHeatTip();
    const tip = $('#heatTip');
    if (!tip.hidden && tip.dataset.key === cell.dataset.tip) hideHeatTip();
    else showHeatTip(cell);
  });
  document.addEventListener('click', e => { if (!e.target.closest('#heatmap')) hideHeatTip(); });
  map.addEventListener('scroll', hideHeatTip, true);
  $('#achvPage').addEventListener('scroll', hideHeatTip);
}

pages.achievements = { el: '#achvPage', render: renderAchvPage };
