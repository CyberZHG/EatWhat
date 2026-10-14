function computeStats(hist, items) {
  const per = new Map();
  const dishSet = new Set();
  let dishLogs = 0, rated = 0, bads = 0, turned = 0;
  const wasBad = new Set();
  const turnedSet = new Set();
  const daily = {};
  let night = 0, breakfast = 0, sameRun = 0, run = 0, prevKey = null, reunion = 0, freshRun = 0;
  const lastAt = new Map();
  const seen = new Map();
  let start = 0;
  hist.forEach((h, k) => {
    const key = h.item;
    (h.dishes || []).forEach(d => {
      dishSet.add(nameKey(d));
      dishLogs++;
      const dr = h.dr?.[d];
      if (dr) rated++;
      if (dr === 1) {
        bads++;
        wasBad.add('d:' + nameKey(d));
      }
      if (dr === 5 && wasBad.has('d:' + nameKey(d))) turnedSet.add('d:' + nameKey(d));
    });
    if (h.r) rated++;
    if (h.r === 1) {
      bads++;
      wasBad.add(h.item);
    }
    if (h.r === 5 && wasBad.has(h.item)) turnedSet.add(h.item);
    per.set(key, (per.get(key) || 0) + 1);
    const d = new Date(h.at);
    const day = dayKey(d);
    daily[day] = (daily[day] || 0) + 1;
    const hour = d.getHours();
    if (hour >= 22 || hour < 4) night++;
    if (hour >= 5 && hour < 9) breakfast++;
    run = key === prevKey ? run + 1 : 1;
    sameRun = Math.max(sameRun, run);
    prevKey = key;
    if (lastAt.has(key)) reunion = Math.max(reunion, daysBetween(lastAt.get(key), h.at));
    lastAt.set(key, h.at);
    if (seen.has(key) && seen.get(key) >= start) start = seen.get(key) + 1;
    seen.set(key, k);
    freshRun = Math.max(freshRun, k - start + 1);
  });
  const nums = Object.keys(daily).map(dayNum).sort((a, b) => a - b);
  let best = 0, streak = 0, prev = null;
  for (const n of nums) {
    streak = prev !== null && n === prev + 1 ? streak + 1 : 1;
    best = Math.max(best, streak);
    prev = n;
  }
  const current = prev !== null && dayNum(dayKey()) - prev <= 1 ? streak : 0;
  const eaten = items.filter(it => Data.stat(it.id).count > 0).length;
  return {
    meals: hist.length,
    distinct: per.size,
    maxSingle: Math.max(0, ...per.values()),
    days: nums.length,
    best,
    current,
    maxPerDay: Math.max(0, ...Object.values(daily)),
    daily,
    night,
    breakfast,
    sameRun,
    freshRun,
    reunion,
    dishKinds: dishSet.size,
    rated,
    bads,
    turned: turnedSet.size,
    dishLogs,
    coverage: items.length >= 10 ? Math.floor(eaten / items.length * 100) : 0,
  };
}

const Achv = (() => {
  const defaults = () => ({
    spins: 0,
    rerollMax: 0,
    firstTry: 0,
    echoes: 0,
    skips: 0,
    shares: 0,
    adds: 0,
    removes: 0,
    backfills: 0,
    cooled: 0,
    syncs: 0,
  });
  const counters = Object.assign(defaults(), store.get('counters', {}));
  const unlocked = store.get('achv', {});
  let frozen = false;
  let cache = null;

  function derive() {
    if (cache) return cache;
    const used = Data.groups.filter(g => Data.items.some(it => it.group === g.id));
    const ate = used.filter(g => Data.history.some(h => Data.entryGroup(h) === g.id));
    cache = {
      ...computeStats(Data.history, Data.items),
      groupCover: used.length >= 3 ? Math.floor(ate.length / used.length * 100) : 0,
      ...counters,
    };
    return cache;
  }

  const fmtTimes = n => `${fmtNum(n)} 次`;
  const fmtMeals = n => `${fmtNum(n)} 顿`;
  const fmtKinds = n => `${fmtNum(n)} 种`;
  const fmtDays = n => `${fmtNum(n)} 天`;
  const fmtPct = n => `${n}%`;

  const tier = (group, icon, value, fmt, list) =>
    list.map(([id, name, goal, desc]) => ({ id, group, icon, value, fmt, name, goal, desc }));

  const DEFS = [
    ...tier('干饭', 'bowl', s => s.meals, fmtMeals, [
      ['meals-1', '第一口', 1, '记录第一顿饭'],
      ['meals-10', '干饭人', 10, '累计记录 10 顿饭'],
      ['meals-50', '饭来张口', 50, '累计记录 50 顿饭'],
      ['meals-100', '百饭斩', 100, '累计记录 100 顿饭'],
      ['meals-365', '一年三百六十五顿', 365, '累计记录 365 顿饭'],
      ['meals-1000', '千顿饕餮', 1000, '累计记录 1,000 顿饭'],
    ]),
    ...tier('尝鲜', 'compass', s => s.distinct, fmtKinds, [
      ['kinds-5', '尝鲜者', 5, '吃过 5 种不同的食物或饭店'],
      ['kinds-15', '美食探索家', 15, '吃过 15 种不同的食物或饭店'],
      ['kinds-30', '吃百家饭', 30, '吃过 30 种不同的食物或饭店'],
      ['kinds-60', '舌尖上的地图', 60, '吃过 60 种不同的食物或饭店'],
    ]),
    ...tier('尝鲜', 'crown', s => s.coverage, fmtPct, [
      ['coverage', '雨露均沾', 100, '菜单至少 10 项，并且每一项都吃过'],
    ]),
    ...tier('尝鲜', 'map', s => s.groupCover, fmtPct, [
      ['groups', '五湖四海', 100, '至少 3 个分组有内容，并且每个分组都吃过'],
    ]),
    ...tier('食堂', 'tray', s => s.dishLogs, fmtTimes, [
      ['dishlog-1', '打饭去', 1, '第一次记录在食堂吃了什么'],
      ['dishlog-100', '食堂编年史', 100, '累计记录 100 次菜名'],
    ]),
    ...tier('食堂', 'list', s => s.dishKinds, n => `${fmtNum(n)} 道`, [
      ['dish-10', '菜谱入门', 10, '吃过 10 道不同的菜'],
      ['dish-50', '食堂百科', 50, '吃过 50 道不同的菜'],
      ['dish-150', '行走的菜单', 150, '吃过 150 道不同的菜'],
    ]),
    ...tier('评价', 'star', s => s.rated, fmtTimes, [
      ['rate-1', '第一条点评', 1, '第一次给吃过的东西打分'],
      ['rate-30', '大众点评', 30, '累计评价 30 次'],
      ['rate-100', '米其林评审', 100, '累计评价 100 次'],
    ]),
    ...tier('评价', 'ban', s => s.bads, fmtTimes, [
      ['bad-5', '踩雷专家', 5, '累计踩雷 5 次'],
    ]),
    ...tier('评价', 'sparkle', s => s.turned, fmtTimes, [
      ['turned-1', '真香', 1, '曾经踩过雷的，后来又评了好吃'],
    ]),
    ...tier('专一', 'heart', s => s.maxSingle, fmtTimes, [
      ['single-5', '回头客', 5, '同一家吃过 5 次'],
      ['single-20', '老主顾', 20, '同一家吃过 20 次'],
      ['single-50', '这家店是我开的', 50, '同一家吃过 50 次'],
      ['single-100', '荣誉股东', 100, '同一家吃过 100 次'],
    ]),
    ...tier('专一', 'repeat', s => s.sameRun, fmtTimes, [
      ['same-3', '情有独钟', 3, '连续 3 顿吃同一家'],
      ['same-7', '钉子户', 7, '连续 7 顿吃同一家'],
    ]),
    ...tier('花心', 'sparkle', s => s.freshRun, fmtMeals, [
      ['fresh-7', '七顿不重样', 7, '连续 7 顿每顿都不一样'],
      ['fresh-21', '花样百出', 21, '连续 21 顿每顿都不一样'],
    ]),
    ...tier('花心', 'hourglass', s => s.reunion, fmtDays, [
      ['reunion-30', '久别重逢', 30, '再次吃到一个隔了 30 天以上没吃的'],
      ['reunion-180', '故地重游', 180, '再次吃到一个隔了半年以上没吃的'],
    ]),
    ...tier('坚持', 'calendar', s => s.days, fmtDays, [
      ['days-3', '三天打鱼', 3, '累计 3 天有吃饭记录'],
      ['days-30', '月度饭票', 30, '累计 30 天有吃饭记录'],
      ['days-100', '百日食记', 100, '累计 100 天有吃饭记录'],
      ['days-365', '一年四季', 365, '累计 365 天有吃饭记录'],
    ]),
    ...tier('坚持', 'flame', s => s.best, fmtDays, [
      ['streak-3', '按时吃饭', 3, '连续 3 天有吃饭记录'],
      ['streak-7', '一周不落', 7, '连续 7 天有吃饭记录'],
      ['streak-30', '作息规律', 30, '连续 30 天有吃饭记录'],
    ]),
    ...tier('坚持', 'utensils', s => s.maxPerDay, fmtMeals, [
      ['perday-3', '一日三餐', 3, '同一天记录 3 顿饭'],
      ['perday-5', '胃是无底洞', 5, '同一天记录 5 顿饭'],
    ]),
    ...tier('随机', 'dice', s => s.spins, fmtTimes, [
      ['spin-1', '听天由命', 1, '第一次随机抽选'],
      ['spin-50', '命运的齿轮', 50, '累计随机抽选 50 次'],
      ['spin-500', '选择困难症晚期', 500, '累计随机抽选 500 次'],
    ]),
    ...tier('随机', 'target', s => s.firstTry, fmtTimes, [
      ['first-1', '一锤定音', 1, '接受第一次抽到的结果'],
      ['first-20', '随遇而安', 20, '累计 20 次接受第一次抽到的结果'],
    ]),
    ...tier('随机', 'shuffle', s => s.rerollMax, fmtTimes, [
      ['reroll-10', '挑三拣四', 10, '一口气连续换 10 次'],
      ['reroll-30', '到底吃不吃', 30, '一口气连续换 30 次'],
    ]),
    ...tier('随机', 'infinity', s => s.echoes, fmtTimes, [
      ['echo-1', '命中注定', 1, '连续换了几次之后，又抽回了第一次抽到的那个'],
    ]),
    ...tier('特别', 'moon', s => s.night, fmtMeals, [
      ['night-5', '深夜食堂', 5, '在 22:00 至 4:00 之间记录 5 顿饭'],
    ]),
    ...tier('特别', 'sunrise', s => s.breakfast, fmtMeals, [
      ['breakfast-5', '早餐要吃好', 5, '在 5:00 至 9:00 之间记录 5 顿饭'],
    ]),
    ...tier('特别', 'book', s => s.adds, fmtKinds, [
      ['adds-5', '私房菜单', 5, '自己添加 5 项'],
      ['adds-30', '美食图鉴', 30, '自己添加 30 项'],
    ]),
    ...tier('特别', 'ban', s => s.skips, fmtTimes, [
      ['skip-10', '今天不想吃', 10, '累计 10 次把抽到的结果暂时排除'],
    ]),
    ...tier('特别', 'undo', s => s.backfills, fmtTimes, [
      ['backfill-1', '亡羊补牢', 1, '补记一顿之前吃过的饭'],
    ]),
    ...tier('特别', 'scissors', s => s.removes, fmtTimes, [
      ['remove-1', '断舍离', 1, '从菜单中删除一项'],
    ]),
    ...tier('特别', 'hourglass', s => s.cooled, fmtTimes, [
      ['cool-1', '冷静一下', 1, '给抽到的结果设置一次冷却期'],
    ]),
    ...tier('特别', 'repeat', s => s.syncs, fmtTimes, [
      ['sync-1', '换个设备接着吃', 1, '用二维码或同步码导入一次数据'],
    ]),
    ...tier('特别', 'camera', s => s.shares, fmtTimes, [
      ['share-1', '晒一晒', 1, '生成一张分享图片'],
    ]),
  ];

  function toast({ icon, name, desc }, title = '成就达成') {
    const t = el('div', 'toast');
    const info = el('div');
    const badge = el('div', 'badge');
    badge.innerHTML = ICONS[icon];
    info.append(el('div', 'title', title), el('div', 'name', name), el('div', 'desc', desc));
    t.append(badge, info);
    t.onclick = () => openPage('achievements');
    pushToast(t);
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 300);
    }, 4500);
  }

  function check(silent = false) {
    const s = derive();
    const fresh = DEFS.filter(d => !unlocked[d.id] && d.value(s) >= d.goal);
    if (fresh.length) {
      fresh.forEach(d => { unlocked[d.id] = Date.now(); });
      if (!frozen) store.set('achv', unlocked);
      if (!silent) {
        const shown = fresh.length > 3 ? fresh.slice(0, 2) : fresh;
        shown.forEach(d => toast(d));
        if (fresh.length > shown.length) {
          toast({ icon: 'trophy', name: `另有 ${fresh.length - shown.length} 个成就达成`, desc: '点击查看全部成就' });
        }
      }
    }
    if (pageVisible('achievements')) pages.achievements.render(false);
  }

  function bump(key, n = 1) {
    counters[key] += n;
    if (!frozen) store.set('counters', counters);
    cache = null;
    check();
  }

  Data.onChange(() => {
    cache = null;
    check();
  });

  return {
    DEFS,
    unlocked,
    derive,
    check,
    toast,
    fmtDays,
    freeze() {
      frozen = true;
    },
    spun({ rerolls, echo }) {
      counters.rerollMax = Math.max(counters.rerollMax, rerolls);
      if (echo) counters.echoes++;
      bump('spins');
    },
    accepted(first) {
      if (first) bump('firstTry');
    },
    skipped: () => bump('skips'),
    shared: () => bump('shares'),
    added: n => bump('adds', n),
    removed: () => bump('removes'),
    backfilled: () => bump('backfills'),
    cooled: () => bump('cooled'),
  };
})();
