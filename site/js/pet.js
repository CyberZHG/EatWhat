function petCollection(picky = false) {
  const places = Data.items.map(it => {
    const st = Data.stat(it.id);
    return { name: it.name, count: st.count, rN: st.rN, avg: avgOf(st), group: it.group, lv: cardLevel('place', st.count) };
  });
  const dishes = Data.dishes().map(d => ({ name: d.name, count: d.count, rN: d.rN, avg: avgOf(d), lv: cardLevel('dish', d.count) }));
  const groups = Data.groups.map(g => {
    const list = places.filter(p => p.group === g.id);
    const eaten = list.filter(p => p.count > 0).length;
    return { name: g.name, total: list.length, eaten, done: list.length >= 3 && eaten === list.length };
  });
  const sum = list => list.reduce((a, c) => a + (c.lv ? c.lv.pct : 0), 0);
  const placePct = sum(places), dishPct = sum(dishes);
  return {
    places,
    dishes,
    groups,
    placeCards: places.filter(p => p.lv).length,
    dishCards: dishes.length,
    topCards: places.filter(p => p.lv?.top).length + dishes.filter(d => d.lv?.top).length,
    groupsDone: groups.filter(g => g.done).length,
    placeMul: Math.min(picky ? 6 : 3, 1 + placePct * (picky ? 1.5 : 1) / 100),
    dishMul: Math.min(picky ? 5 : 2.5, 1 + dishPct * (picky ? 1.5 : 1) / 100),
    placePct: placePct * (picky ? 1.5 : 1),
    dishPct: dishPct * (picky ? 1.5 : 1),
    picky,
  };
}

const Pet = (() => {
  const fresh = () => ({
    v: 1,
    name: '团子',
    start: Date.now(),
    last: Date.now(),
    kcal: 0,
    total: 0,
    clicks: 0,
    foods: FOODS.map(() => 0),
    ups: [],
    achv: {},
    exp: 0,
    peakClicks: 0,
    maxRate: 0,
    returns: 0,
    fullAway: 0,
    meals: 0,
    debt: 0,
    rewarded: {},
    buy: 1,
    note: '',
    points: 0,
    spent: 0,
    runs: 0,
    runTotal: 0,
    perks: [],
    order: null,
    orderNext: 0,
    ordersDone: 0,
    orderRewards: {},
    species: 'normal',
    album: [],
    petStart: Date.now(),
    petRuns: 0,
    petTotal: 0,
    upSort: 'value',
    city: 'home',
    cityStart: Date.now(),
    insight: 0,
    skills: [],
    moves: 0,
    moveLog: [],
    auto: { foods: true, ups: true, prestige: true, ratio: 0.5, swap: true, keep: 0 },
    autoLog: [],
    autoPrestiges: 0,
    fastSwaps: 0,
    timeTravel: 0,
    nightFeed: 0,
    burst: 0,
    renames: 0,
    selfName: 0,
    declineRun: 0,
    debtSeen: 0,
    broke: 0,
    longAway: 0,
    newYear: 0,
    seen: {},
    cityPets: {},
    maxBite: 0,
    numFormat: 'cn',
  });
  let s;
  try {
    s = Object.assign(fresh(), JSON.parse(localStorage.getItem(PET_KEY)) || {});
  } catch {
    s = fresh();
  }
  s.foods = FOODS.map((_, i) => s.foods[i] || 0);
  ['kcal', 'total', 'runTotal', 'petTotal', 'debt'].forEach(k => { if (!Number.isFinite(s[k])) s[k] = 0; });
  s.auto = Object.assign(fresh().auto, s.auto);
  s.seen = s.seen || {};
  s.cityPets = s.cityPets || {};
  NUM_FORMAT.mode = s.numFormat === 'sci' ? 'sci' : 'cn';
  const markPair = () => { s.cityPets[`${s.city || 'home'}|${s.species || 'normal'}`] = 1; };
  markPair();
  if (s.runs > 0 || s.points > 0) s.seen.prestige = 1;
  if ((s.album || []).length) s.seen.swap = 1;
  if (s.moves > 0 || s.insight > 0) s.seen.move = 1;
  if (!s.runTotal && s.total) s.runTotal = s.total;
  let env = null;
  let dirty = false;
  let loop = 0;
  const clickTimes = [];

  const save = () => {
    dirty = false;
    try {
      localStorage.setItem(PET_KEY, JSON.stringify(s));
    } catch {}
  };

  function computeEnv() {
    const coll = petCollection(isSpecies(s, 'picky'));
    const lv = petLevel(s.exp).level;
    const hours = Array(24).fill(0);
    Data.history.forEach(h => hours[new Date(h.at).getHours()]++);
    const own = Data.history.length >= 5
      ? hours.map((n, h) => [n, h]).filter(([n]) => n >= 2).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, h]) => h)
      : [];
    const peaks = [...new Set([...own, ...(cityOf(s).peaks || [])])].sort((a, b) => a - b);
    const since = Date.now() - 14 * DAY;
    const recent = Data.history.filter(h => h.at >= since && h.r);
    const avg = recent.length ? recent.reduce((a, h) => a + h.r, 0) / recent.length : 0;
    const achvN = Object.keys(Achv.unlocked).length;
    const mineN = PET_ACHV.filter(d => s.achv[d.id]).length;
    const hiddenN = PET_ACHV.filter(d => d.hidden && s.achv[d.id]).length;
    env = {
      level: lv,
      coll,
      peaks,
      avg,
      recentN: recent.length,
      parts: [
        { name: '等级', mul: 1 + 0.1 * (lv - 1), note: `${lv} 级，每级 +10%。` },
        { name: '地点图鉴', mul: coll.placeMul, note: `${coll.placeCards} 张，合计 +${coll.placePct}%，最多 ×${coll.picky ? 6 : 3}。尝过 +2%，熟悉 +3%，常客 +5%${coll.picky ? '，挑挑再 ×1.5' : ''}。` },
        { name: '菜谱图鉴', mul: coll.dishMul, note: `${coll.dishCards} 张，合计 +${coll.dishPct}%，最多 ×${coll.picky ? 5 : 2.5}。尝过 +1%，熟悉 +2%，拿手 +3%${coll.picky ? '，挑挑再 ×1.5' : ''}。` },
        { name: '吃遍的分组', mul: 1 + groupBonusOf(s) * coll.groupsDone, note: `${coll.groupsDone} 组，每组 +${groupBonusOf(s) * 100}%。分组至少 3 项且每项都吃过。` },
        { layer: 'prestige', name: '胃口', mul: 1 + POINT_BONUS * s.points, note: `${s.points} 点，每点 +${POINT_BONUS * 100}%。重开获得。` },
        { layer: 'swap', name: '相册', mul: albumMulOf(s), note: `相册里的宠物共 ${albumPoints(s)} 点胃口，每点 +${ALBUM_BONUS * 100}%。` },
        { layer: 'move', name: '见识', mul: insightMulOf(s), note: `${s.insight || 0} 点，每点 +${INSIGHT_BONUS * 100}%。搬家获得。` },
        { name: '主页成就', mul: 1 + 0.02 * achvN, note: `${achvN} 个，每个 +2%。` },
        { name: '心情', mul: moodMulOf(s, avg), note: avg ? `最近 14 天平均评分 ${avg.toFixed(1)}，共 ${recent.length} 次。` : '最近 14 天没有评分，不影响。' },
        { name: '宠物成就', mul: 1 + 0.01 * mineN, note: `${mineN} 个${hiddenN ? `（含隐藏成就 ${hiddenN} 个）` : ''}，每个 +1%，隐藏成就也算。` },
      ],
    };
    return env;
  }

  const isPeak = () => (env || computeEnv()).peaks.includes(new Date().getHours());
  const baseMul = () => (env || computeEnv()).parts.reduce((a, p) => a * p.mul, 1);
  const foodMul = i => foodMulOf(s, i);
  const rawRate = () => prodOf(s) * baseMul();
  const rate = (peak = isPeak(), online = true) => rawRate() * (peak ? peakMulOf(s) : 1) * (online ? onlineMulOf(s) : 1);
  const clickValue = () => clickOf(s, baseMul(), rate());

  function gain(n) {
    if (!Number.isFinite(n) || n <= 0) return;
    if (s.debt > 0) {
      const pay = Math.min(s.debt, n);
      s.debt -= pay;
      n -= pay;
    }
    s.kcal += n;
    s.total += n;
    s.runTotal += n;
    s.petTotal += n;
    dirty = true;
  }

  const upCost = u => upCostOf(s, u);
  const offlineCap = () => offlineCapOf(s);
  const mealMinutes = () => mealMinutesOf(s);
  const orderReward = () => Math.max(1000, rawRate() * 3600 * orderHoursOf(s)) * orderMulOf(s);

  function ensureOrder() {
    const now = Date.now();
    if (s.order && now > s.order.until) {
      s.note = `订单已过期：${s.order.name}。`;
      s.order = null;
      s.orderNext = now + HOUR;
      dirty = true;
    }
    if (s.order || now < s.orderNext) return;
    const pool = Data.items.filter(it => it.on && !Data.cooling(it));
    if (!pool.length) return;
    const it = drawFrom(pool);
    s.order = { item: it.id, name: it.name, created: now, until: now + orderSpanOf(s) };
    dirty = true;
  }

  function autoLog(text) {
    s.autoLog.unshift({ at: Date.now(), text });
    s.autoLog.length = Math.min(s.autoLog.length, 20);
  }

  function doPrestige() {
    const pts = prestigeGain(s.runTotal);
    if (pts < 1) return 0;
    s.points += pts;
    s.runs++;
    s.petRuns++;
    s.kcal = 0;
    s.runTotal = 0;
    s.ups = [];
    s.foods = FOODS.map(() => 0);
    if (s.perks.includes('start')) {
      s.foods[0] = 10;
      s.foods[1] = 5;
    }
    env = null;
    return pts;
  }

  function doSwap(species, name) {
    s.album.push({
      name: s.name,
      species: s.species,
      from: s.petStart,
      to: Date.now(),
      points: s.points,
      runs: s.petRuns,
      total: s.petTotal,
      level: petLevel(s.exp).level,
    });
    if (s.city === 'fast') s.fastSwaps++;
    s.species = species;
    s.cityPets[`${s.city || 'home'}|${species}`] = 1;
    s.name = normName(name || '').slice(0, 12) || SPECIES.find(x => x.id === species).name;
    s.petStart = Date.now();
    s.petRuns = 0;
    s.petTotal = 0;
    s.points = hasSkill(s, 'r3') ? Math.floor(s.points * 0.1) : 0;
    if (!hasSkill(s, 'r2')) s.perks = [];
    s.spent = 0;
    s.kcal = 0;
    s.runTotal = 0;
    s.ups = [];
    s.foods = FOODS.map(() => 0);
    env = null;
  }

  function nextSpecies() {
    const k = SPECIES.findIndex(x => x.id === (s.species || 'normal'));
    return SPECIES[(k + 1) % SPECIES.length];
  }

  function autoTick() {
    let acted = false;
    const keep = () => s.auto.keep * Math.max(s.kcal, 0);
    if (hasSkill(s, 'a1') && s.auto.foods) {
      for (let n = 0; n < 40; n++) {
        let best = -1, bestScore = Infinity, bestCost = 0;
        FOODS.forEach((f, i) => {
          if (!foodOpen(s, i)) return;
          const c = f.cost * GROWTH ** s.foods[i];
          const d = f.rate * foodMulOf(s, i);
          if (c / d < bestScore) {
            best = i;
            bestScore = c / d;
            bestCost = c;
          }
        });
        if (best < 0 || bestCost > s.kcal - keep()) break;
        s.kcal -= bestCost;
        s.foods[best]++;
        acted = true;
      }
    }
    if (hasSkill(s, 'a2') && s.auto.ups) {
      for (;;) {
        const u = UPGRADES.filter(x => !s.ups.includes(x.id) && x.show(s) && upCost(x) <= s.kcal - keep()).sort((a, b) => upCost(a) - upCost(b))[0];
        if (!u) break;
        s.kcal -= upCost(u);
        s.ups.push(u.id);
        acted = true;
        env = null;
      }
    }
    if (hasSkill(s, 'a3') && s.auto.prestige) {
      const pts = prestigeGain(s.runTotal);
      if (pts >= Math.max(1, Math.ceil(s.auto.ratio * s.points))) {
        doPrestige();
        s.autoPrestiges++;
        autoLog(`自动重开，获得 ${pts} 点胃口，共 ${s.points} 点。`);
        acted = true;
      }
    }
    if (hasSkill(s, 'a4') && s.auto.swap && s.points >= swapNeed(s)) {
      const old = s.name;
      const sp = nextSpecies();
      doSwap(sp.id);
      autoLog(`自动换宠物：${old}进入相册，换成${sp.name}。`);
      acted = true;
    }
    if (acted) {
      dirty = true;
      s.maxRate = Math.max(s.maxRate, rate());
    }
    return acted;
  }

  const costOf = (i, k = 1) => FOODS[i].cost * GROWTH ** s.foods[i] * (GROWTH ** k - 1) / (GROWTH - 1);
  const maxBuy = i => Math.max(0, Math.floor(Math.log(s.kcal * (GROWTH - 1) / (FOODS[i].cost * GROWTH ** s.foods[i]) + 1) / Math.log(GROWTH)));

  function checkAchv() {
    const c = (env || computeEnv()).coll;
    const fresh = PET_ACHV.filter(d => !s.achv[d.id] && d.value(s, c) >= d.goal);
    if (!fresh.length) return 0;
    fresh.forEach(d => { s.achv[d.id] = Date.now(); });
    const shown = fresh.length > 3 ? fresh.slice(0, 2) : fresh;
    shown.forEach(d => Achv.toast(d, d.hidden ? '隐藏的宠物成就' : '宠物成就'));
    if (fresh.length > shown.length) Achv.toast({ icon: 'paw', name: `另有 ${fresh.length - shown.length} 个宠物成就达成`, desc: '在宠物页面查看' }, '宠物成就');
    env = null;
    dirty = true;
    return fresh.length;
  }

  function syncMeals(silent = false) {
    const ids = new Set(Data.history.map(h => h.id));
    let changed = false;
    for (const [id, r] of Object.entries(s.rewarded)) {
      if (ids.has(id)) continue;
      const take = Math.min(s.kcal, r.kcal);
      s.kcal -= take;
      s.debt += r.kcal - take;
      if (r.kcal > take) s.debtSeen = 1;
      s.exp = Math.max(0, s.exp - 1);
      s.meals = Math.max(0, s.meals - 1);
      delete s.rewarded[id];
      changed = true;
    }
    for (const [id, kcal] of Object.entries(s.orderRewards)) {
      if (ids.has(id)) continue;
      const take = Math.min(s.kcal, kcal);
      s.kcal -= take;
      s.debt += kcal - take;
      s.ordersDone = Math.max(0, s.ordersDone - 1);
      delete s.orderRewards[id];
      changed = true;
    }
    const valid = h => h.t && Math.abs(h.t - h.at) <= MEAL_WINDOW && h.t <= Date.now() + MINUTE;
    if (s.order && Date.now() <= s.order.until) {
      const hit = Data.history.find(h => h.item === s.order.item && h.at >= s.order.created - MEAL_WINDOW && h.t >= s.order.created && valid(h) && !s.orderRewards[h.id]);
      if (hit) {
        const kcal = orderReward();
        s.orderRewards[hit.id] = kcal;
        s.ordersDone++;
        gain(kcal);
        if (!silent) notify(`订单完成：${s.order.name}，热量 +${fmtBig(kcal)} 卡`);
        else s.note = `订单完成：${s.order.name}，热量 +${fmtBig(kcal)} 卡。`;
        s.order = null;
        s.declineRun = 0;
        s.orderNext = Date.now() + (isSpecies(s, 'social') ? 30 * MINUTE : 2 * HOUR);
        changed = true;
      }
    }
    const perDay = {};
    const minutes = new Set();
    Object.values(s.rewarded).forEach(r => {
      perDay[r.day] = (perDay[r.day] || 0) + 1;
      minutes.add(r.key);
    });
    const got = [];
    for (const h of Data.history) {
      if (s.rewarded[h.id] || !h.t || h.at < s.start || h.t < s.start) continue;
      if (Math.abs(h.t - h.at) > MEAL_WINDOW || h.t > Date.now() + MINUTE) continue;
      const day = dayKey(new Date(h.at));
      const key = `${h.item}|${toMin(h.at)}`;
      if ((perDay[day] || 0) >= MEAL_CAP || minutes.has(key)) continue;
      const kcal = Math.max(100, rawRate() * 60 * mealMinutes());
      s.rewarded[h.id] = { day, key, kcal };
      perDay[day] = (perDay[day] || 0) + 1;
      minutes.add(key);
      s.exp++;
      s.meals++;
      gain(kcal);
      got.push([h, kcal]);
      changed = true;
    }
    if (changed) {
      env = null;
      dirty = true;
      checkAchv();
      save();
    }
    if (!silent) {
      got.forEach(([h, kcal]) => notify(`${s.name}跟着吃了${Data.entryName(h)}：经验 +1，热量 +${fmtBig(kcal)} 卡`));
    }
    return got.length;
  }

  function timeTravel(back) {
    const now = Date.now();
    s.timeTravel++;
    s.orderNext = Math.min(s.orderNext, now + 2 * HOUR);
    if (s.order && s.order.created > now) {
      s.order = null;
      s.orderNext = now;
    }
    ['start', 'petStart', 'cityStart'].forEach(k => { if (s[k] > now) s[k] = now; });
    s.note = `系统时间比上次早了 ${fmtSpan(back)}，这段时间的离线收益按 0 计算。`;
    dirty = true;
  }

  function checkLayers() {
    const reached = {
      prestige: s.runTotal >= PRESTIGE_UNIT || s.runs > 0,
      swap: s.points >= swapNeed(s) || s.album.length > 0,
      move: albumPoints(s) >= MOVE_UNIT || s.moves > 0,
    };
    const fresh = Object.keys(reached).filter(k => reached[k] && !s.seen[k]);
    fresh.forEach(k => {
      s.seen[k] = 1;
      notify(`解锁了新玩法：${LAYER_NAMES[k]}。说明在页面下方。`);
    });
    if (fresh.length) {
      dirty = true;
      renderPetPage();
    }
  }

  function step() {
    const now = Date.now();
    const dt = now - s.last;
    s.last = now;
    if (dt < -MINUTE) {
      timeTravel(-dt);
      checkAchv();
      return;
    }
    if (dt <= 0) return;
    gain(rate() * Math.min(dt, 5000) / 1000);
    checkLayers();
    if (autoTick()) {
      checkAchv();
      renderPetLists();
      renderPetBonus();
      renderPetHead();
      renderPetAuto();
    }
    if (s.order && now > s.order.until) {
      ensureOrder();
      renderPetOrder();
    }
    s.maxRate = Math.max(s.maxRate, rate());
    if (checkAchv()) renderPetLists();
  }

  function enter() {
    if (loop) return;
    const now = Date.now();
    const dt = now - s.last;
    s.note = '';
    const today = new Date(now);
    if (today.getMonth() === 0 && today.getDate() === 1) s.newYear = 1;
    if (dt >= 7 * DAY) s.longAway = 1;
    if (dt < -MINUTE) timeTravel(-dt);
    else if (dt > MINUTE) {
      const cap = offlineCap();
      const used = Math.min(dt, cap);
      const per = rate(false, false) * offlineMulOf(s);
      let got = 0;
      s.returns++;
      if (dt >= cap) s.fullAway++;
      if (hasSkill(s, 'a5')) {
        const parts = 48;
        for (let k = 0; k < parts; k++) {
          const g = rate(false, false) * offlineMulOf(s) * used / parts / 1000;
          gain(g);
          got += g;
          autoTick();
        }
      } else {
        got = per * used / 1000;
        if (got > 0) gain(got);
      }
      const lines = [
        `离开了 ${fmtSpan(dt)}。`,
        dt > cap ? `计算 ${fmtSpan(used)}，上限是 ${cap / HOUR} 小时，超出的 ${fmtSpan(dt - cap)} 不计算。` : `全部 ${fmtSpan(used)} 都计入。`,
        hasSkill(s, 'a5')
          ? `开始时每秒 ${fmtBig(per)} 卡，离线期间按自动规则分段补买，结束时每秒 ${fmtBig(rate(false, false) * offlineMulOf(s))} 卡。不含饭点加成。`
          : `按每秒 ${fmtBig(per)} 卡计算${offlineMulOf(s) !== 1 ? `，含离线 ×${offlineMulOf(s)}` : ''}，不含饭点加成。`,
        `获得 ${fmtBig(got)} 卡。`,
      ];
      s.note = lines.join('\n');
    }
    s.last = now;
    s.maxRate = Math.max(s.maxRate, rate());
    ensureOrder();
    checkAchv();
    dirty = true;
    setTimeout(checkLayers);
    let ticks = 0;
    loop = setInterval(() => {
      step();
      renderPetNumbers();
      if (++ticks % 120 === 0) save();
    }, 250);
  }

  function leave() {
    if (!loop) return;
    clearInterval(loop);
    loop = 0;
    step();
    save();
  }

  const todayMeals = () => Object.values(s.rewarded).filter(r => r.day === dayKey()).length;

  Data.onChange(() => {
    env = null;
    syncMeals();
    if (pageVisible('pet')) renderPetPage();
  });
  addEventListener('pagehide', leave);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) leave();
    else if (pageVisible('pet')) {
      enter();
      renderPetPage();
    }
  });

  return {
    get s() {
      return s;
    },
    env: () => env || computeEnv(),
    baseMul,
    layerOpen: layer => layerOpen(s, layer),
    refreshEnv: () => { env = null; },
    rate,
    rawRate,
    isPeak,
    clickValue,
    costOf,
    maxBuy,
    foodMul,
    enter,
    leave,
    save: () => dirty && save(),
    syncMeals,
    todayMeals,
    checkAchv,
    feed() {
      s.clicks++;
      if (isPeak()) s.peakClicks++;
      const now = Date.now();
      const h = new Date(now).getHours();
      if (h >= 3 && h < 5) s.nightFeed = 1;
      clickTimes.push(now);
      while (clickTimes.length > 60) clickTimes.shift();
      if (clickTimes.length === 60 && now - clickTimes[0] <= 10000) s.burst = 1;
      const v = clickValue();
      s.maxBite = Math.max(s.maxBite || 0, v);
      gain(v);
      checkAchv();
      return v;
    },
    buy(i, k) {
      if (k <= 0 || !foodOpen(s, i)) return false;
      const c = costOf(i, k);
      if (c > s.kcal) return false;
      s.kcal -= c;
      if (c >= 1e6 && s.kcal < 1) s.broke = 1;
      s.foods[i] += k;
      s.maxRate = Math.max(s.maxRate, rate());
      dirty = true;
      checkAchv();
      return true;
    },
    upgrade(id) {
      const u = UPGRADES.find(x => x.id === id);
      if (!u || s.ups.includes(id) || upCost(u) > s.kcal) return false;
      s.kcal -= upCost(u);
      if (upCost(u) >= 1e6 && s.kcal < 1) s.broke = 1;
      s.ups.push(id);
      dirty = true;
      env = null;
      s.maxRate = Math.max(s.maxRate, rate());
      checkAchv();
      return true;
    },
    upCost,
    offlineCap,
    orderReward,
    ensureOrder,
    declineOrder() {
      if (!s.order) return;
      s.order = null;
      s.declineRun++;
      checkAchv();
      s.orderNext = Date.now() + HOUR;
      dirty = true;
      save();
    },
    prestigeGain: () => prestigeGain(s.runTotal),
    prestige() {
      const pts = doPrestige();
      if (!pts) return 0;
      checkAchv();
      save();
      return pts;
    },
    upgradeGain: u => upgradeGain(s, u, baseMul()),
    buyAllUpgrades() {
      let n = 0;
      for (;;) {
        const u = UPGRADES.filter(x => !s.ups.includes(x.id) && x.show(s) && upCost(x) <= s.kcal).sort((a, b) => upCost(a) - upCost(b))[0];
        if (!u) break;
        s.kcal -= upCost(u);
        s.ups.push(u.id);
        n++;
      }
      if (n) {
        env = null;
        dirty = true;
        s.maxRate = Math.max(s.maxRate, rate());
        checkAchv();
      }
      return n;
    },
    canSwap: () => s.points >= swapNeed(s),
    swapNeed: () => swapNeed(s),
    swap(species, name) {
      if (s.points < swapNeed(s) || !SPECIES.some(x => x.id === species)) return false;
      doSwap(species, name);
      checkAchv();
      save();
      return true;
    },
    insightGain: () => insightGainOf(s),
    move(city) {
      const gainN = insightGainOf(s);
      if (gainN < 1 || !CITIES.some(c => c.id === city) || city === s.city) return 0;
      s.moveLog.push({ city: s.city, from: s.cityStart, to: Date.now(), album: s.album.length, points: albumPoints(s), insight: gainN });
      s.insight += gainN;
      s.moves++;
      s.city = city;
      s.cityStart = Date.now();
      markPair();
      s.album = [];
      s.points = 0;
      s.spent = 0;
      s.perks = [];
      s.petRuns = 0;
      s.petTotal = 0;
      s.kcal = 0;
      s.runTotal = 0;
      s.ups = [];
      s.foods = FOODS.map(() => 0);
      s.order = null;
      s.orderNext = 0;
      env = null;
      checkAchv();
      save();
      return gainN;
    },
    buySkill(id) {
      const k = SKILLS.find(x => x.id === id);
      if (!k || hasSkill(s, id) || (k.req && !hasSkill(s, k.req))) return false;
      const spent = SKILLS.filter(x => hasSkill(s, x.id)).reduce((a, x) => a + x.cost, 0);
      if ((s.insight || 0) - spent < k.cost) return false;
      s.skills.push(id);
      env = null;
      checkAchv();
      save();
      return true;
    },
    setNumFormat(mode) {
      s.numFormat = mode;
      NUM_FORMAT.mode = mode;
      save();
    },
    setAuto(key, value) {
      s.auto[key] = value;
      dirty = true;
      save();
    },
    buyPerk(id) {
      const p = PERKS.find(x => x.id === id);
      if (!p || s.perks.includes(id) || s.points - s.spent < p.cost) return false;
      s.spent += p.cost;
      s.perks.push(id);
      env = null;
      checkAchv();
      save();
      return true;
    },
    rename(name) {
      const n = normName(name).slice(0, 12) || speciesOf(s).name;
      if (n !== s.name) s.renames++;
      if (n === '今天吃什么') s.selfName = 1;
      s.name = n;
      checkAchv();
      dirty = true;
      save();
    },
    reset() {
      s = fresh();
      NUM_FORMAT.mode = 'cn';
      markPair();
      s.last = Date.now();
      env = null;
      save();
    },
  };
})();
