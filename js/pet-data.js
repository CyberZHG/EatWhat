const PET_KEY = 'ewg.state';
const OFFLINE_CAP = 7 * DAY;
const CATCHUP_PARTS = 96;
const MEAL_CAP = 3;
const MEAL_WINDOW = 2 * HOUR;
const GROWTH = 1.15;

const FOODS = [
  { name: '零食', cost: 15, rate: 0.1 },
  { name: '便当', cost: 100, rate: 1 },
  { name: '外卖', cost: 1100, rate: 8 },
  { name: '家常菜', cost: 12000, rate: 47 },
  { name: '私房菜', cost: 130000, rate: 260 },
  { name: '自助餐', cost: 1.4e6, rate: 1400 },
  { name: '宴席', cost: 2e7, rate: 7800 },
  { name: '美食街', cost: 3.3e8, rate: 44000 },
  { name: '美食城', cost: 5.1e9, rate: 260000 },
  { name: '自家农场', cost: 8e10, rate: 1.6e6, skill: 'r1' },
];

const FOOD_TIERS = [[1, 10], [10, 50], [25, 500], [50, 5000], [100, 50000], [150, 5e5], [200, 5e6]];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const UPGRADES = [
  ...FOODS.flatMap((f, i) => FOOD_TIERS.map(([own, mul], k) => ({
    id: `f${i}-${k}`,
    name: `${f.name}产出翻倍 ${ROMAN[k]}`,
    desc: `${f.name}的产出 ×2。`,
    cost: f.cost * mul,
    show: s => s.foods[i] >= own,
    food: i,
  }))),
  ...[[100, 0], [500, 10], [1e4, 50], [1e5, 150]].map(([cost, clicks], k) => ({
    id: `c${k}`,
    name: `喂一口翻倍 ${ROMAN[k]}`,
    desc: '每次喂一口获得的热量 ×2。',
    cost,
    show: s => s.clicks >= clicks,
    click: 2,
  })),
  ...[[1e5, 1e4], [1e7, 1e6], [1e9, 1e8], [1e11, 1e10]].map(([cost, total], k) => ({
    id: `p${k}`,
    name: `顺手加餐 ${ROMAN[k]}`,
    desc: '每次喂一口，额外获得每秒产出的 5%。',
    cost,
    show: s => s.total >= total,
    pct: 0.05,
  })),
  ...FOODS.slice(1).flatMap((f, j) => {
    const i = j + 1, lo = FOODS[j];
    return [
      {
        id: `s${i}a`,
        name: `${lo.name}带动${f.name}`,
        desc: `每 10 份${lo.name}使${f.name}产出 +1%。`,
        cost: f.cost * 30,
        show: s => s.foods[i] >= 10 && s.foods[j] >= 25,
        syn: { from: j, to: i, per: 10, pct: 0.01 },
      },
      {
        id: `s${i}b`,
        name: `${f.name}回馈${lo.name}`,
        desc: `每份${f.name}使${lo.name}产出 +2%。`,
        cost: f.cost * 200,
        show: s => s.foods[i] >= 25,
        syn: { from: i, to: j, per: 1, pct: 0.02 },
      },
    ];
  }),
];

const CITIES = [
  { id: 'home', name: '起点村', rule: '没有特殊规则。' },
  { id: 'night', name: '灯笼镇', rule: '22 点到次日 1 点也算饭点。', peaks: [22, 23, 0, 1] },
  { id: 'morning', name: '晨雾港', rule: '7 点到 9 点也算饭点，饭点加成再 ×1.5。', peaks: [7, 8, 9], peakMul: 1.5 },
  { id: 'slow', name: '蜗居谷', rule: '离线产出 ×2，在线产出 ×0.8。', offline: 2, online: 0.8 },
  { id: 'fast', name: '疾风市', rule: '在线产出 ×1.5，离线产出 ×0.5。', offline: 0.5, online: 1.5 },
  { id: 'food', name: '百味坊', rule: '订单奖励 ×2，订单时限缩短到 12 小时。', order: 2, orderSpan: 12 * HOUR },
  { id: 'old', name: '古槐城', rule: '搬家时获得的见识 +20%。', insight: 1.2 },
];

const SKILLS = [
  { id: 'a1', branch: '自动化', name: '自动买食物', desc: '在宠物页打开时，按性价比自动买食物。', cost: 1 },
  { id: 'a2', branch: '自动化', name: '自动买升级', desc: '自动买下买得起的升级，从便宜的开始。', cost: 1, req: 'a1' },
  { id: 'a5', branch: '自动化', name: '离线补买', desc: '结算离线收益时，按自动规则分段补买，收益可以滚动增长。', cost: 2, req: 'a1' },
  { id: 'a3', branch: '自动化', name: '自动重开', desc: '获得的胃口达到设定比例时自动重开。', cost: 2, req: 'a2' },
  { id: 'a4', branch: '自动化', name: '自动换宠物', desc: '胃口达到要求时自动换下一种宠物。', cost: 3, req: 'a3' },
  { id: 'r1', branch: '规则', name: '自家农场', desc: '解锁第 10 种食物：自家农场。', cost: 2 },
  { id: 'r2', branch: '规则', name: '天赋随身', desc: '换宠物时保留已买的天赋。', cost: 2 },
  { id: 'r3', branch: '规则', name: '留一手', desc: '换宠物时保留 10% 的胃口。', cost: 2, req: 'r2' },
  { id: 'r4', branch: '规则', name: '联动加倍', desc: '所有联动升级的效果 ×2。', cost: 1 },
  { id: 'e1', branch: '真实联动', name: '吃遍有奖', desc: '每个吃遍的分组从 +10% 提高到 +25%。', cost: 1 },
  { id: 'e2', branch: '真实联动', name: '大订单', desc: '订单奖励从 1 小时产出提高到 3 小时产出。', cost: 1 },
  { id: 'e3', branch: '真实联动', name: '心情放大', desc: '心情加成的范围从 ×0.9 至 ×1.2 扩大到 ×0.8 至 ×1.4。', cost: 1 },
];
const BRANCHES = ['自动化', '规则', '真实联动'];
const MOVE_UNIT = 2000;
const INSIGHT_BONUS = 0.25;
const cityOf = s => CITIES.find(c => c.id === s.city) || CITIES[0];
const hasSkill = (s, id) => (s.skills || []).includes(id);
const foodOpen = (s, i) => !FOODS[i].skill || hasSkill(s, FOODS[i].skill);
const insightGain = ap => ap < MOVE_UNIT ? 0 : Math.floor(3 * Math.log2(ap / MOVE_UNIT) + 2 + 1e-9);
const insightGainOf = s => Math.floor(insightGain(albumPoints(s)) * (cityOf(s).insight || 1));
const nextInsightAt = ap => MOVE_UNIT * 2 ** ((Math.max(insightGain(ap), 1) + 1 - 2) / 3);
const insightMulOf = s => 1 + INSIGHT_BONUS * (s.insight || 0);
const onlineMulOf = s => cityOf(s).online || 1;
const groupBonusOf = s => hasSkill(s, 'e1') ? 0.25 : 0.1;
const moodMulOf = (s, avg) => !avg ? 1 : hasSkill(s, 'e3') ? 0.8 + 0.15 * (avg - 1) : 0.9 + 0.075 * (avg - 1);
const orderHoursOf = s => hasSkill(s, 'e2') ? 3 : 1;
const orderSpanOf = s => cityOf(s).orderSpan || DAY;
const LAYER_GROUPS = { 重开: 'prestige', 相册: 'swap', 搬家: 'move' };
const LAYER_NAMES = { prestige: '重开', swap: '换宠物', move: '搬家' };
const layerOpen = (s, layer) => !layer || !!(s.seen || {})[layer];

const SPECIES = [
  { id: 'normal', name: '团子', trait: '没有特性。', color: '' },
  { id: 'punctual', name: '阿准', trait: '饭点加成从 ×2 提高到 ×3。', color: '#d4a017' },
  { id: 'patient', name: '慢慢', trait: '离线产出 ×2。', color: '#5b8fd1' },
  { id: 'bigbite', name: '大口', trait: '喂一口 ×5，顺手加餐的比例 ×2。', color: '#d9534f' },
  { id: 'picky', name: '挑挑', trait: '图鉴加成 ×1.5，图鉴上限翻倍。', color: '#6aa84f' },
  { id: 'social', name: '热闹', trait: '订单奖励 ×3，完成后 30 分钟出现新订单。', color: '#a35bc4' },
];
const SWAP_POINTS = 100;
const SWAP_GROWTH = 1.6;
const swapNeed = s => Math.round(SWAP_POINTS * SWAP_GROWTH ** (s.album || []).length);
const POINT_BONUS = 0.25;
const ALBUM_BONUS = 0.03;
const speciesOf = s => SPECIES.find(x => x.id === s.species) || SPECIES[0];
const petLabel = (name, sp) => name === sp.name ? name : `${name}（${sp.name}）`;
const hasPerk = (s, id) => s.perks.includes(id);
const isSpecies = (s, id) => (s.species || 'normal') === id;

function foodMulOf(s, i) {
  let m = 2 ** UPGRADES.filter(u => u.food === i && s.ups.includes(u.id)).length;
  for (const u of UPGRADES) {
    if (u.syn && u.syn.to === i && s.ups.includes(u.id)) m *= 1 + u.syn.pct * (hasSkill(s, 'r4') ? 2 : 1) * Math.floor((s.foods[u.syn.from] || 0) / u.syn.per);
  }
  return m;
}

const foodRateOf = (s, i) => (s.foods[i] || 0) * FOODS[i].rate * foodMulOf(s, i);
const prodOf = s => FOODS.reduce((a, _, i) => a + foodRateOf(s, i), 0);
const peakMulOf = s => (isSpecies(s, 'punctual') ? 3 : 2) * (cityOf(s).peakMul || 1);
const upCostOf = (s, u) => u.cost * (hasPerk(s, 'cheap') ? 0.75 : 1);
const offlineCapOf = () => OFFLINE_CAP;
const offlineMulOf = s => (isSpecies(s, 'patient') ? 2 : 1) * (hasPerk(s, 'offline') ? 1.5 : 1) * (cityOf(s).offline || 1);
const orderMulOf = s => (hasPerk(s, 'order') ? 2 : 1) * (isSpecies(s, 'social') ? 3 : 1) * (cityOf(s).order || 1);
const mealMinutesOf = s => hasPerk(s, 'meal') ? 30 : 10;
const albumPoints = s => (s.album || []).reduce((a, p) => a + p.points, 0);
const albumMulOf = s => 1 + ALBUM_BONUS * albumPoints(s);
const nextPointAt = runTotal => (prestigeGain(runTotal) + 1) ** PRESTIGE_POW * PRESTIGE_UNIT;

const CLICK_PCT = 0.1;

function clickOf(s, base, perSec) {
  const mul = UPGRADES.filter(u => u.click && s.ups.includes(u.id)).reduce((a, u) => a * u.click, 1);
  const pct = CLICK_PCT + UPGRADES.filter(u => u.pct && s.ups.includes(u.id)).reduce((a, u) => a + u.pct, 0) * (isSpecies(s, 'bigbite') ? 2 : 1);
  return (mul * base + pct * perSec) * (hasPerk(s, 'click') ? 3 : 1) * (isSpecies(s, 'bigbite') ? 5 : 1);
}

function upgradeGain(s, u, base) {
  if (u.click || u.pct) {
    const t = { ...s, ups: [...s.ups, u.id] };
    return { click: clickOf(t, base, prodOf(t) * base) - clickOf(s, base, prodOf(s) * base) };
  }
  const t = { ...s, ups: [...s.ups, u.id] };
  return { rate: (prodOf(t) - prodOf(s)) * base };
}

const NUM_FORMAT = { mode: 'cn' };

const fmtSci = n => {
  const [m, e] = n.toExponential(2).split('e');
  return `${+m}e${+e}`;
};

const fmtBig = n => {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + fmtBig(-n);
  if (NUM_FORMAT.mode === 'sci' && n >= 1e4) return fmtSci(n);
  if (n < 10) return n.toFixed(1).replace(/\.0$/, '');
  if (n < 1e4) return Math.floor(n).toLocaleString('zh-CN');
  const units = ['万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'];
  const k = Math.min(units.length, Math.floor(Math.log10(n) / 4));
  if (k >= units.length && n >= 1e48) return n.toExponential(2);
  const v = n / 10 ** (k * 4);
  return `${v < 10 ? +v.toFixed(2) : v < 100 ? +v.toFixed(1) : Math.floor(v)}${units[k - 1]}`;
};

const PERKS = [
  { id: 'start', name: '开局有粮', desc: '重开后自带 10 份零食和 5 份便当。', cost: 1 },
  { id: 'click', name: '大口吃', desc: '喂一口获得的热量 ×3。', cost: 1 },
  { id: 'offline', name: '耐心等待', desc: '离线产出 ×1.5。', cost: 1 },
  { id: 'order', name: '好商量', desc: '订单奖励 ×2。', cost: 1 },
  { id: 'meal', name: '认真吃饭', desc: '真实饭的热量奖励从 10 分钟产出提高到 30 分钟。', cost: 1 },
  { id: 'cheap', name: '熟门熟路', desc: '所有升级价格 -25%。', cost: 1 },
];

const PRESTIGE_UNIT = 1e11;
const PRESTIGE_POW = 3;
const ORDER_SPAN = DAY;
const prestigeGain = runTotal => Math.floor((runTotal / PRESTIGE_UNIT) ** (1 / PRESTIGE_POW) + 1e-9);

const CARD_LEVELS = {
  place: [[20, '常客', 5], [5, '熟悉', 3], [1, '尝过', 2]],
  dish: [[20, '拿手', 3], [5, '熟悉', 2], [1, '尝过', 1]],
};

function cardLevel(kind, n) {
  const hit = CARD_LEVELS[kind].find(([min]) => n >= min);
  return hit ? { name: hit[1], pct: hit[2], top: hit === CARD_LEVELS[kind][0] } : null;
}

const petTier = (group, icon, value, fmt, list) =>
  list.map(([id, name, goal, desc]) => ({ id, group, icon, value, fmt, name, goal, desc }));
const fmtTimesP = n => `${fmtNum(n)} 次`;
const fmtKcal = n => `${fmtBig(n)} 卡`;
const fmtLv = n => `${n} 级`;
const fmtFen = n => `${fmtNum(n)} 份`;

const PET_ACHV = [
  ...petTier('喂食', 'bowl', s => s.clicks, fmtTimesP, [
    ['click-1', '第一口', 1, '喂一口。'],
    ['click-100', '一百口', 100, '累计喂 100 口。'],
    ['click-1000', '一千口', 1000, '累计喂 1,000 口。'],
    ['click-10000', '一万口', 10000, '累计喂 10,000 口。'],
  ]),
  ...petTier('喂食', 'clock', s => s.peakClicks, fmtTimesP, [
    ['peak-50', '饭点喂食', 50, '在饭点内喂 50 口。'],
  ]),
  ...petTier('热量', 'flame', s => s.total, fmtKcal, [
    ['total-1e3', '一千卡', 1e3, '累计获得 1 千卡。'],
    ['total-1e5', '十万卡', 1e5, '累计获得 10 万卡。'],
    ['total-1e7', '一千万卡', 1e7, '累计获得 1,000 万卡。'],
    ['total-1e9', '十亿卡', 1e9, '累计获得 10 亿卡。'],
    ['total-1e12', '一兆卡', 1e12, '累计获得 1 兆卡。'],
    ['total-1e15', '一千兆卡', 1e15, '累计获得 1,000 兆卡。'],
  ]),
  ...petTier('热量', 'bolt', s => s.maxRate, fmtKcal, [
    ['rate-10', '每秒十卡', 10, '每秒产出达到 10 卡。'],
    ['rate-1e3', '每秒一千卡', 1e3, '每秒产出达到 1 千卡。'],
    ['rate-1e5', '每秒十万卡', 1e5, '每秒产出达到 10 万卡。'],
    ['rate-1e7', '每秒一千万卡', 1e7, '每秒产出达到 1,000 万卡。'],
  ]),
  ...petTier('食物', 'utensils', s => Math.max(...s.foods), fmtFen, [
    ['own-10', '十份', 10, '同一种食物持有 10 份。'],
    ['own-50', '五十份', 50, '同一种食物持有 50 份。'],
    ['own-100', '一百份', 100, '同一种食物持有 100 份。'],
    ['own-200', '两百份', 200, '同一种食物持有 200 份。'],
  ]),
  ...petTier('食物', 'list', s => s.foods.filter(n => n > 0).length, n => `${n} 种`, [
    ['kinds-3', '三种食物', 3, '持有 3 种食物。'],
    ['kinds-6', '六种食物', 6, '持有 6 种食物。'],
    ['kinds-9', '九种食物', 9, '九种食物都持有。'],
  ]),
  ...petTier('食物', 'crown', s => s.ups.length, n => `${n} 个`, [
    ['ups-5', '五项升级', 5, '购买 5 项升级。'],
    ['ups-20', '二十项升级', 20, '购买 20 项升级。'],
    ['ups-50', '五十项升级', 50, '购买 50 项升级。'],
  ]),
  ...petTier('成长', 'heart', s => petLevel(s.exp).level, fmtLv, [
    ['lv-3', '3 级', 3, '宠物达到 3 级。'],
    ['lv-5', '5 级', 5, '宠物达到 5 级，戴上厨师帽。'],
    ['lv-10', '10 级', 10, '宠物达到 10 级，系上围兜。'],
    ['lv-20', '20 级', 20, '宠物达到 20 级。'],
  ]),
  ...petTier('成长', 'tray', s => s.meals, fmtTimesP, [
    ['meal-1', '同步进食', 1, '第一次因为真实的一餐获得奖励。'],
    ['meal-10', '十顿', 10, '累计 10 次因为真实的一餐获得奖励。'],
    ['meal-30', '三十顿', 30, '累计 30 次因为真实的一餐获得奖励。'],
    ['meal-100', '一百顿', 100, '累计 100 次因为真实的一餐获得奖励。'],
  ]),
  ...petTier('重开', 'repeat', s => s.runs, fmtTimesP, [
    ['run-1', '从头再来', 1, '第一次重开。'],
    ['run-5', '五次重开', 5, '累计重开 5 次。'],
    ['run-20', '二十次重开', 20, '累计重开 20 次。'],
  ]),
  ...petTier('重开', 'star', s => s.points, n => `${fmtNum(n)} 点`, [
    ['pts-10', '十点胃口', 10, '累计获得 10 点胃口。'],
    ['pts-100', '一百点胃口', 100, '累计获得 100 点胃口。'],
  ]),
  ...petTier('重开', 'gift', s => s.perks.length, n => `${n} 项`, [
    ['perk-all', '全部天赋', PERKS.length, '购买全部胃口天赋。'],
  ]),
  ...petTier('订单', 'target', s => s.ordersDone, fmtTimesP, [
    ['order-1', '完成订单', 1, '完成一个订单。'],
    ['order-10', '十个订单', 10, '完成 10 个订单。'],
    ['order-50', '五十个订单', 50, '完成 50 个订单。'],
  ]),
  ...petTier('图鉴', 'store', (s, c) => c.placeCards, n => `${n} 张`, [
    ['place-10', '十个地点', 10, '收集 10 张地点卡。'],
    ['place-30', '三十个地点', 30, '收集 30 张地点卡。'],
  ]),
  ...petTier('图鉴', 'book', (s, c) => c.dishCards, n => `${n} 张`, [
    ['dish-10', '十道菜', 10, '收集 10 张菜谱卡。'],
    ['dish-50', '五十道菜', 50, '收集 50 张菜谱卡。'],
  ]),
  ...petTier('图鉴', 'crown', (s, c) => c.topCards, n => `${n} 张`, [
    ['top-3', '三张满级卡', 3, '3 张卡达到最高等级（常客或拿手）。'],
  ]),
  ...petTier('图鉴', 'map', (s, c) => c.groupsDone, n => `${n} 组`, [
    ['group-1', '吃遍一组', 1, '一个分组里的每一项都吃过（至少 3 项）。'],
    ['group-3', '吃遍三组', 3, '三个分组里的每一项都吃过。'],
  ]),
  ...petTier('相册', 'paw', s => (s.album || []).length, n => `${n} 只`, [
    ['album-1', '新伙伴', 1, '第一次换宠物。'],
    ['album-5', '五只宠物', 5, '相册里有 5 只宠物。'],
  ]),
  ...petTier('相册', 'sparkle', s => new Set([...(s.album || []).map(a => a.species), s.species || 'normal']).size, n => `${n} 种`, [
    ['species-all', '全都养过', 6, '六种宠物都养过。'],
  ]),
  ...petTier('搬家', 'map', s => s.moves || 0, fmtTimesP, [
    ['move-1', '第一次搬家', 1, '搬一次家。'],
    ['move-5', '五次搬家', 5, '累计搬家 5 次。'],
  ]),
  ...petTier('搬家', 'compass', s => new Set([...(s.moveLog || []).map(m => m.city), s.city || 'home'].filter(c => c !== 'home')).size, n => `${n} 座`, [
    ['cities-6', '住遍六城', 6, '六座城市都住过。'],
  ]),
  ...petTier('搬家', 'star', s => s.insight || 0, n => `${fmtNum(n)} 点`, [
    ['insight-50', '见多识广', 50, '累计获得 50 点见识。'],
  ]),
  ...petTier('搬家', 'list', s => Math.max(0, ...BRANCHES.map(b => SKILLS.filter(k => k.branch === b).every(k => hasSkill(s, k.id)) ? 1 : 0)), n => `${n} 条`, [
    ['branch-1', '点满一条分支', 1, '一条技能分支全部学会。'],
  ]),
  ...petTier('搬家', 'crown', s => (s.skills || []).length, n => `${n} 个`, [
    ['skills-all', '全部技能', SKILLS.length, '学会全部技能。'],
  ]),
  ...petTier('搬家', 'repeat', s => s.autoPrestiges || 0, fmtTimesP, [
    ['auto-1', '自己会重开', 1, '自动重开一次。'],
    ['auto-100', '自动重开一百次', 100, '自动重开 100 次。'],
  ]),
  ...petTier('搬家', 'bolt', s => s.fastSwaps || 0, fmtTimesP, [
    ['fast-swap', '疾风换宠', 1, '在疾风市换一次宠物。'],
  ]),
  ...petTier('热量', 'flame', s => s.total, fmtKcal, [
    ['total-1e18', '一百京卡', 1e18, '累计获得 100 京卡。'],
    ['total-1e24', '一秭卡', 1e24, '累计获得 1 秭卡。'],
  ]),
  ...petTier('热量', 'bolt', s => s.maxRate, fmtKcal, [
    ['rate-1e10', '每秒一百亿卡', 1e10, '每秒产出达到 100 亿卡。'],
    ['rate-1e15', '每秒一千兆卡', 1e15, '每秒产出达到 1,000 兆卡。'],
  ]),
  ...petTier('食物', 'utensils', s => Math.max(...s.foods), fmtFen, [
    ['own-500', '五百份', 500, '同一种食物持有 500 份。'],
  ]),
  ...petTier('食物', 'store', s => s.foods[FOODS.length - 1] || 0, fmtFen, [
    ['farm-1', '自家农场', 1, '持有一份自家农场。'],
  ]),
  ...petTier('食物', 'shuffle', s => UPGRADES.filter(u => u.syn && s.ups.includes(u.id)).length, n => `${n} 项`, [
    ['syn-1', '第一项联动', 1, '购买一项联动升级。'],
    ['syn-all', '全部联动', UPGRADES.filter(u => u.syn).length, '同时拥有全部联动升级。'],
  ]),
  ...petTier('成长', 'heart', s => petLevel(s.exp).level, fmtLv, [
    ['lv-30', '30 级', 30, '宠物达到 30 级。'],
    ['lv-50', '50 级', 50, '宠物达到 50 级。'],
  ]),
  ...petTier('重开', 'repeat', s => s.runs, fmtTimesP, [
    ['run-100', '一百次重开', 100, '累计重开 100 次。'],
  ]),
  ...petTier('重开', 'star', s => s.points, n => `${fmtNum(n)} 点`, [
    ['pts-1000', '一千点胃口', 1000, '当前宠物的胃口达到 1,000 点。'],
  ]),
  ...petTier('订单', 'target', s => s.ordersDone, fmtTimesP, [
    ['order-100', '一百个订单', 100, '完成 100 个订单。'],
  ]),
  ...petTier('相册', 'paw', s => (s.album || []).length, n => `${n} 只`, [
    ['album-20', '二十只宠物', 20, '相册里有 20 只宠物。'],
  ]),
  ...petTier('搬家', 'map', s => s.moves || 0, fmtTimesP, [
    ['move-10', '十次搬家', 10, '累计搬家 10 次。'],
  ]),
  ...petTier('搬家', 'star', s => s.insight || 0, n => `${fmtNum(n)} 点`, [
    ['insight-200', '阅历丰富', 200, '累计获得 200 点见识。'],
  ]),
  ...petTier('陪伴', 'calendar', s => Math.max(0, daysBetween(s.start, Date.now())), n => `${n} 天`, [
    ['days-7', '一周', 7, '开始养宠物满 7 天。'],
    ['days-30', '一个月', 30, '开始养宠物满 30 天。'],
    ['days-100', '一百天', 100, '开始养宠物满 100 天。'],
    ['days-365', '一年', 365, '开始养宠物满 365 天。'],
  ]),
  ...petTier('离开', 'hourglass', s => s.returns, fmtTimesP, [
    ['return-100', '一百次回来', 100, '领取 100 次离线收益。'],
  ]),
  ...petTier('长线', 'compass', s => Object.keys(s.cityPets || {}).length, n => `${n} 种`, [
    ['pair-10', '结伴旅行', 10, '宠物和城市的组合达到 10 种。'],
    ['pair-all', '处处为家', SPECIES.length * CITIES.length, `六种宠物都在七座城市（包括起点村）住过，共 ${SPECIES.length * CITIES.length} 种组合。`],
  ]),
  ...petTier('长线', 'bowl', s => s.maxBite || 0, fmtKcal, [
    ['bite-1e8', '一口一亿', 1e8, '喂一口获得 1 亿卡。'],
    ['bite-1e16', '一口一京', 1e16, '喂一口获得 1 京卡。'],
  ]),
  ...petTier('长线', 'flame', s => s.total, fmtKcal, [
    ['total-1e30', '一百穰卡', 1e30, '累计获得 100 穰卡。'],
  ]),
  ...petTier('长线', 'bolt', s => s.maxRate, fmtKcal, [
    ['rate-1e20', '每秒一垓卡', 1e20, '每秒产出达到 1 垓卡。'],
  ]),
  ...petTier('长线', 'utensils', s => Math.min(...s.foods), fmtFen, [
    ['every-100', '样样一百', 100, '十种食物同时各有 100 份。'],
    ['every-500', '样样五百', 500, '十种食物同时各有 500 份。'],
  ]),
  ...petTier('长线', 'crown', s => UPGRADES.filter(u => s.ups.includes(u.id)).length, n => `${n} 项`, [
    ['ups-all', '全部升级', UPGRADES.length, `同时拥有全部 ${UPGRADES.length} 项升级。`],
  ]),
  ...petTier('长线', 'target', s => s.ordersDone, fmtTimesP, [
    ['order-365', '一年的订单', 365, '完成 365 个订单。'],
  ]),
  ...petTier('长线', 'paw', s => (s.album || []).length, n => `${n} 只`, [
    ['album-50', '五十只宠物', 50, '相册里有 50 只宠物。'],
  ]),
  ...petTier('长线', 'map', s => s.moves || 0, fmtTimesP, [
    ['move-30', '三十次搬家', 30, '累计搬家 30 次。'],
  ]),
  ...petTier('长线', 'star', s => s.insight || 0, n => `${fmtNum(n)} 点`, [
    ['insight-500', '见识五百', 500, '累计获得 500 点见识。'],
  ]),
  ...petTier('长线', 'calendar', s => Math.max(0, daysBetween(s.start, Date.now())), n => `${n} 天`, [
    ['days-730', '两年', 730, '开始养宠物满 730 天。'],
  ]),
  ...petTier('长线', 'trophy', s => PET_ACHV.filter(d => !d.hidden && d.id !== 'all-visible' && s.achv[d.id]).length, n => `${n} 个`, [
    ['all-visible', '全部达成', 0, '解锁除隐藏成就以外的全部宠物成就。'],
  ]),
  ...[
    ['h-time', '时光倒流', '系统时间比上次打开时还早。', 'clock', s => s.timeTravel],
    ['h-night', '凌晨加餐', '在 3:00 到 4:59 之间喂一口。', 'moon', s => s.nightFeed],
    ['h-burst', '手速', '10 秒内喂 60 口。', 'bolt', s => s.burst],
    ['h-names', '起名困难', '给宠物改名 5 次。', 'edit', s => s.renames >= 5],
    ['h-self', '它也想知道', '把宠物的名字改成“今天吃什么”。', 'sparkle', s => s.selfName],
    ['h-decline', '挑食', '连续拒绝 3 个订单。', 'ban', s => s.declineRun >= 3],
    ['h-debt', '欠账', '删掉了获得过奖励的吃饭记录，热量不够扣。', 'undo', s => s.debtSeen],
    ['h-broke', '花光', '一次花掉 100 万卡以上，之后只剩不到 1 卡。', 'scissors', s => s.broke],
    ['h-away-7', '好久不见', '离开宠物页 7 天以上再回来。', 'hourglass', s => s.longAway],
    ['h-newyear', '新年', '在 1 月 1 日打开宠物页。', 'gift', s => s.newYear],
  ].map(([id, name, desc, icon, ok]) => ({ id, group: '隐藏', icon, name, desc, goal: 1, value: s => (ok(s) ? 1 : 0), fmt: n => String(n), hidden: true })),
  ...petTier('离开', 'hourglass', s => s.returns, fmtTimesP, [
    ['return-1', '回来了', 1, '离开游戏页面后回来，领取一次离线收益。'],
    ['return-30', '常回来看看', 30, '领取 30 次离线收益。'],
  ]),
  ...petTier('离开', 'moon', s => s.fullAway, fmtTimesP, [
    ['away-12h', '离开太久', 1, '离开超过一周，离线收益达到上限。'],
  ]),
];

function petLevel(exp) {
  let level = 1, need = 3, left = exp;
  while (left >= need) {
    left -= need;
    level++;
    need = level + 2;
  }
  return { level, into: left, need };
}

function fmtSpan(ms) {
  const m = Math.floor(ms / MINUTE);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d) return `${d} 天 ${h % 24} 小时`;
  if (h) return `${h} 小时 ${m % 60} 分`;
  return `${m} 分钟`;
}

PET_ACHV.find(d => d.id === 'all-visible').goal = PET_ACHV.filter(d => !d.hidden && d.id !== 'all-visible').length;
