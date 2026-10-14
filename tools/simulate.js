const fs = require('fs');
const path = require('path');
const vm = require('vm');

const head = fs.readFileSync(path.join(__dirname, '../site/js/pet-data.js'), 'utf8');
const ctx = { MINUTE: 60000, HOUR: 3600000, DAY: 86400000, fmtNum: n => String(n), console };
vm.createContext(ctx);
vm.runInContext(`${head}
this.G = { FOODS, UPGRADES, PERKS, SPECIES, SWAP_POINTS, swapNeed, POINT_BONUS, PRESTIGE_UNIT, GROWTH, prestigeGain, petLevel,
  foodRateOf, prodOf, clickOf, upCostOf, offlineCapOf, offlineMulOf, orderMulOf, mealMinutesOf, albumMulOf, peakMulOf,
  CITIES, SKILLS, CATCHUP_PARTS, insightGainOf, insightMulOf, onlineMulOf, hasSkill, foodOpen, groupBonusOf, orderHoursOf, albumPoints };`, ctx);
const G = ctx.G;

const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const DAYS = Number(args.days || 90);
const SESSIONS = (args.sessions || '8,12,19').split(',').map(Number);
const SESSION_MIN = Number(args.minutes || 5);
const CLICKS = Number(args.clicks || 120);
const ORDER_RATE = Number(args.orders || 0.5);
const PEAKS = [12, 18, 19];

function fresh() {
  return {
    kcal: 0, total: 0, runTotal: 0, clicks: 0, foods: G.FOODS.map(() => 0), ups: [], exp: 0,
    points: 0, spent: 0, perks: [], runs: 0, species: 'normal', album: [], petRuns: 0, runStart: 0,
    city: 'home', insight: 0, skills: [], moves: 0,
  };
}

function realMul(s, day) {
  const lv = G.petLevel(s.exp).level;
  const placeCards = Math.min(24, 3 + Math.floor(day / 3));
  const dishCards = Math.min(60, Math.floor(day * 0.8));
  const picky = s.species === 'picky' ? 1.5 : 1;
  const place = Math.min(picky > 1 ? 6 : 3, 1 + placeCards * 0.025 * picky);
  const dish = Math.min(picky > 1 ? 5 : 2.5, 1 + dishCards * 0.012 * picky);
  const groups = 1 + G.groupBonusOf(s) * Math.min(5, Math.floor(day / 20));
  const homeAchv = 1 + 0.02 * Math.min(45, 8 + Math.floor(day / 2));
  const petAchv = 1 + 0.01 * Math.min(60, Math.floor(day / 1.5));
  return (1 + 0.1 * (lv - 1)) * place * dish * groups * (1 + G.POINT_BONUS * s.points) * G.albumMulOf(s) * G.insightMulOf(s) * homeAchv * 1.05 * petAchv;
}

const gain = (s, n) => { s.kcal += n; s.total += n; s.runTotal += n; };

function bestBuy(s, base) {
  const now = G.prodOf(s);
  let best = null;
  G.FOODS.forEach((f, i) => {
    if (!G.foodOpen(s, i)) return;
    const cost = f.cost * G.GROWTH ** s.foods[i];
    if (cost > s.kcal) return;
    const t = { ...s, foods: s.foods.map((n, k) => k === i ? n + 1 : n) };
    const d = (G.prodOf(t) - now) * base;
    const score = cost / Math.max(d, 1e-12);
    if (!best || score < best.score) best = { score, apply: () => { s.kcal -= cost; s.foods[i]++; } };
  });
  for (const u of G.UPGRADES) {
    if (s.ups.includes(u.id) || !u.show(s)) continue;
    const cost = G.upCostOf(s, u);
    if (cost > s.kcal) continue;
    const t = { ...s, ups: [...s.ups, u.id] };
    let d = (G.prodOf(t) - now) * base;
    if (u.click || u.pct) d = (G.clickOf(t, base, now * base) - G.clickOf(s, base, now * base)) * (CLICKS / (SESSION_MIN * 60));
    const score = cost / Math.max(d, 1e-12);
    if (!best || score < best.score) best = { score, apply: () => { s.kcal -= cost; s.ups.push(u.id); } };
  }
  return best;
}

function maybePrestige(s, day, log) {
  const pts = G.prestigeGain(s.runTotal);
  const runDays = day - s.runStart;
  if (pts < 1) return;
  if (pts < Math.max(1, Math.ceil(s.points * 0.6)) && runDays < 7) return;
  s.points += pts;
  s.runs++;
  s.petRuns++;
  s.kcal = 0;
  s.runTotal = 0;
  s.ups = [];
  s.foods = G.FOODS.map(() => 0);
  if (s.perks.includes('start')) { s.foods[0] = 10; s.foods[1] = 5; }
  s.runStart = day;
  log(`第 ${day.toFixed(1)} 天 重开 #${s.runs}，+${pts} 胃口，共 ${s.points}`);
  for (const p of [...G.PERKS].sort((a, b) => a.cost - b.cost)) {
    if (!s.perks.includes(p.id) && s.points - s.spent >= p.cost) {
      s.spent += p.cost;
      s.perks.push(p.id);
      log(`第 ${day.toFixed(1)} 天 天赋：${p.name}`);
    }
  }
  if (s.points >= G.swapNeed(s)) {
    const next = G.SPECIES[(G.SPECIES.findIndex(x => x.id === s.species) + 1) % G.SPECIES.length];
    s.album.push({ points: s.points });
    log(`第 ${day.toFixed(1)} 天 换宠物：${next.name}（相册共 ${G.albumPoints(s)} 点）`);
    Object.assign(s, {
      species: next.id,
      points: G.hasSkill(s, 'r3') ? Math.floor(s.points * 0.1) : 0,
      spent: 0,
      perks: G.hasSkill(s, 'r2') ? s.perks : [],
      petRuns: 0,
    });
  }
  const ig = G.insightGainOf(s);
  if (ig >= Math.max(1, Math.ceil(s.insight * 0.6))) {
    const order = ['night', 'slow', 'old', 'fast', 'food', 'morning'];
    const city = order[s.moves % order.length];
    s.insight += ig;
    s.moves++;
    log(`第 ${day.toFixed(1)} 天 搬家 #${s.moves} 到 ${G.CITIES.find(c => c.id === city).name}，+${ig} 见识，共 ${s.insight}（相册 ${s.album.length} 只，${G.albumPoints(s)} 点）`);
    Object.assign(s, { city, album: [], points: 0, spent: 0, perks: [], petRuns: 0, kcal: 0, runTotal: 0, ups: [], foods: G.FOODS.map(() => 0) });
    const spentNow = () => G.SKILLS.filter(k => s.skills.includes(k.id)).reduce((a, k) => a + k.cost, 0);
    for (const id of ['a1', 'a2', 'a5', 'a3', 'a4', 'r2', 'r1', 'r3', 'r4', 'e1', 'e2', 'e3']) {
      const k = G.SKILLS.find(x => x.id === id);
      if (s.skills.includes(id) || (k.req && !s.skills.includes(k.req))) continue;
      if (s.insight - spentNow() < k.cost) break;
      s.skills.push(id);
      log(`第 ${day.toFixed(1)} 天 技能：${k.name}`);
    }
  }
}

function simulate() {
  const s = fresh();
  const events = [];
  const log = m => events.push(m);
  const snaps = [];
  let lastHour = 0;
  let idleDays = 0, boughtToday = 0;
  for (let day = 0; day < DAYS; day++) {
    boughtToday = 0;
    for (const hour of SESSIONS) {
      const t = day * 24 + hour;
      const away = (t - lastHour) * 3600000;
      const base0 = realMul(s, day);
      if (lastHour > 0) {
        const used = Math.min(away, G.offlineCapOf(s));
        if (G.hasSkill(s, 'a5')) {
          for (let k = 0; k < G.CATCHUP_PARTS; k++) {
            gain(s, G.prodOf(s) * base0 * G.offlineMulOf(s) * used / G.CATCHUP_PARTS / 1000);
            for (let n = 0; n < 60; n++) {
              const b = bestBuy(s, base0);
              if (!b) break;
              b.apply();
            }
          }
        } else {
          gain(s, G.prodOf(s) * base0 * G.offlineMulOf(s) * used / 1000);
        }
      }
      lastHour = t + SESSION_MIN / 60;
      if (hour !== 8) {
        s.exp++;
        gain(s, Math.max(100, G.prodOf(s) * base0 * 60 * G.mealMinutesOf(s)));
      }
      if (hour === 19) {
        s.exp++;
        if (Math.random() < ORDER_RATE) gain(s, Math.max(1000, G.prodOf(s) * base0 * 3600 * G.orderHoursOf(s)) * G.orderMulOf(s));
      }
      const peak = PEAKS.includes(hour) ? G.peakMulOf(s) : 1;
      for (let sec = 0; sec < SESSION_MIN * 60; sec++) {
        const base = realMul(s, day);
        gain(s, G.prodOf(s) * base * peak * G.onlineMulOf(s));
        if (sec < CLICKS) {
          s.clicks++;
          gain(s, G.clickOf(s, base, G.prodOf(s) * base * peak));
        }
        for (let k = 0; k < 50; k++) {
          const b = bestBuy(s, base);
          if (!b) break;
          b.apply();
          boughtToday++;
        }
      }
      maybePrestige(s, day + hour / 24, log);
    }
    if (!boughtToday) idleDays++;
    if ([0, 1, 2, 4, 6, 9, 13, 20, 29, 44, 59, 89, 119, 179, 269, 364].includes(day)) {
      snaps.push({
        day: day + 1,
        rate: G.prodOf(s) * realMul(s, day),
        foods: s.foods.filter(n => n > 0).length,
        ups: s.ups.length,
        points: s.points,
        album: s.album.length,
        insight: s.insight,
        level: G.petLevel(s.exp).level,
      });
    }
  }
  return { events, snaps, idleDays, s };
}

const fmt = n => n < 1e4 ? n.toFixed(1) : n.toExponential(2);
const runs = Number(args.runs || 1);
for (let r = 0; r < runs; r++) {
  const { events, snaps, idleDays } = simulate();
  console.log(`模拟 ${DAYS} 天，每天 ${SESSIONS.length} 次，每次 ${SESSION_MIN} 分钟，每次喂 ${CLICKS} 口`);
  console.log('天数 | 每秒产出 | 食物种类 | 升级数 | 胃口 | 相册 | 见识 | 等级');
  snaps.forEach(x => console.log(`${x.day} | ${fmt(x.rate)} | ${x.foods} | ${x.ups} | ${x.points} | ${x.album} | ${x.insight} | ${x.level}`));
  console.log(`没有买任何东西的天数：${idleDays}`);
  events.slice(0, Number(args.events || 40)).forEach(e => console.log(e));
}
