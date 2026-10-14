const DEFAULT_GROUPS = [
  ['快餐', ['麦当劳', '肯德基', '必胜客', '汉堡王', '赛百味']],
  ['正餐', ['食堂', '海底捞', '鼎泰丰', '吉野家', '小龙坎']],
  ['咖啡', ['星巴克', '瑞幸咖啡', '皮爷咖啡', 'Tim Hortons', '蓝瓶咖啡']],
  ['奶茶', ['喜茶', '霸王茶姬', '贡茶', 'CoCo 都可', '鹿角巷']],
  ['甜点', ['哈根达斯', 'DQ 冰雪皇后', '85度C', '巴黎贝甜']],
];
const DEFAULT_NAMES = DEFAULT_GROUPS.flatMap(([, names]) => names);
const CANTEEN = '食堂';

const RATINGS = [[5, '好吃', 'good'], [3, '一般', 'ok'], [1, '踩雷', 'bad']];
const ratingName = r => RATINGS.find(x => x[0] === r)?.[1] ?? '';
const ratingClass = r => RATINGS.find(x => x[0] === r)?.[2] ?? '';

const ALL = 'all';
const NONE = '';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const normName = s => s.trim().replace(/\s+/g, ' ');
const nameKey = s => normName(s).toLowerCase();

const Data = (() => {
  let items = store.get('items', null);
  let groups = store.get('groups', null);
  const history = store.get('history', []);
  const listeners = [];
  let index = new Map();
  let dishIndex = new Map();

  const byName = name => items.find(it => nameKey(it.name) === nameKey(name));
  const groupByName = name => groups.find(g => nameKey(g.name) === nameKey(name));

  function seedGroups(names) {
    for (const [gname, members] of DEFAULT_GROUPS) {
      const want = members.filter(n => names.some(m => nameKey(m) === nameKey(n)));
      if (!want.length) continue;
      let g = groupByName(gname);
      if (!g) groups.push(g = { id: uid() + groups.length, name: gname });
      want.forEach(n => {
        const it = byName(n);
        if (it && !it.group) it.group = g.id;
      });
    }
  }

  if (!Array.isArray(items)) {
    const now = Date.now();
    items = DEFAULT_NAMES.map((name, k) => ({ id: uid() + k, name, on: true, added: now, group: NONE, canteen: name === CANTEEN }));
    store.set('seed.canteen', true);
  }
  if (!Array.isArray(groups)) {
    groups = [];
    seedGroups(DEFAULT_NAMES);
  }
  if (!store.get('seed.canteen', false)) {
    let it = byName(CANTEEN);
    if (!it) items.push(it = { id: uid(), name: CANTEEN, on: true, added: Date.now(), group: groupByName('正餐')?.id ?? NONE });
    it.canteen = true;
    store.set('seed.canteen', true);
  }
  items.forEach(it => {
    if (!groups.some(g => g.id === it.group)) it.group = NONE;
  });
  store.set('items', items);
  store.set('groups', groups);

  function reindex() {
    index = new Map(items.map(it => [it.id, { count: 0, first: 0, last: 0, rSum: 0, rN: 0, hours: Array(24).fill(0) }]));
    dishIndex = new Map();
    for (const h of history) {
      for (const d of h.dishes || []) {
        const k = nameKey(d);
        const cur = dishIndex.get(k) || { name: d, count: 0, last: 0, items: new Map(), rSum: 0, rN: 0 };
        cur.count++;
        cur.name = d;
        cur.last = h.at;
        cur.items.set(h.item, (cur.items.get(h.item) || 0) + 1);
        const r = h.dr?.[d];
        if (r) {
          cur.rSum += r;
          cur.rN++;
        }
        dishIndex.set(k, cur);
      }
      const s = index.get(h.item);
      if (!s) continue;
      s.count++;
      if (!s.first) s.first = h.at;
      s.last = h.at;
      s.hours[new Date(h.at).getHours()]++;
      if (h.r) {
        s.rSum += h.r;
        s.rN++;
      }
    }
  }

  function commit(what) {
    if (what.includes('items')) store.set('items', items);
    if (what.includes('groups')) store.set('groups', groups);
    if (what.includes('history')) store.set('history', history);
    reindex();
    listeners.forEach(fn => fn());
  }

  const get = id => items.find(it => it.id === id);
  const group = id => groups.find(g => g.id === id);
  const stat = id => index.get(id) || { count: 0, first: 0, last: 0, rSum: 0, rN: 0, hours: Array(24).fill(0) };
  const entryName = h => get(h.item)?.name ?? h.name;
  const entryGroup = h => {
    const it = get(h.item);
    const g = it ? it.group : h.group || NONE;
    return group(g) ? g : NONE;
  };
  const inScope = (scope, g) => scope === ALL || scope === g;
  const scopeName = scope => scope === ALL ? '全部' : scope === NONE ? '未分组' : group(scope)?.name ?? '全部';
  const validScope = scope => scope === ALL || (scope === NONE && items.some(it => !it.group)) || !!group(scope);

  function checkGroupName(name, self) {
    const n = normName(name).slice(0, 20);
    if (!n) return ['', '分组名称不能为空'];
    if (['全部', '未分组'].includes(n)) return ['', `“${n}”是保留名称`];
    const other = groupByName(n);
    if (other && other.id !== self) return ['', `已经有“${other.name}”这个分组了`];
    return [n, ''];
  }

  reindex();

  return {
    get items() {
      return items;
    },
    get groups() {
      return groups;
    },
    history,
    get,
    group,
    byName,
    stat,
    entryName,
    entryGroup,
    inScope,
    scopeName,
    validScope,
    dishes: () => [...dishIndex.values()],
    dish: name => dishIndex.get(nameKey(name)),
    itemsIn: scope => items.filter(it => inScope(scope, it.group)),
    historyIn: scope => scope === ALL ? history : history.filter(h => entryGroup(h) === scope),
    onChange(fn) {
      listeners.push(fn);
    },
    add(text, groupId = NONE) {
      const names = text.split(/[,，、;；\n]+/).map(normName).filter(Boolean).map(s => s.slice(0, 40));
      const g = group(groupId) ? groupId : NONE;
      const added = [], dup = [];
      for (const name of names) {
        if (byName(name) || added.some(it => nameKey(it.name) === nameKey(name))) {
          dup.push(name);
          continue;
        }
        added.push({ id: uid(), name, on: true, added: Date.now(), group: g });
      }
      if (added.length) {
        items.push(...added);
        commit(['items']);
      }
      return { added, dup };
    },
    update(id, patch) {
      const it = get(id);
      if (!it) return '这一项已经不存在了';
      if ('name' in patch) {
        const name = normName(patch.name).slice(0, 40);
        if (!name) return '名称不能为空';
        const other = byName(name);
        if (other && other.id !== id) return `“${other.name}”已经在菜单里了`;
        if (name !== it.name) {
          it.name = name;
          history.forEach(h => { if (h.item === id) h.name = name; });
        }
      }
      if ('on' in patch) it.on = !!patch.on;
      if ('canteen' in patch) it.canteen = !!patch.canteen;
      if ('group' in patch) it.group = group(patch.group) ? patch.group : NONE;
      commit(['items', 'history']);
      return '';
    },
    setOn(ids, on) {
      const set = new Set(ids);
      items.forEach(it => { if (set.has(it.id)) it.on = on; });
      commit(['items']);
    },
    remove(id) {
      const k = items.findIndex(it => it.id === id);
      if (k < 0) return;
      const g = items[k].group;
      history.forEach(h => { if (h.item === id) h.group = g; });
      items.splice(k, 1);
      commit(['items', 'history']);
    },
    restoreDefaults() {
      const missing = DEFAULT_NAMES.filter(n => !byName(n));
      if (missing.length) {
        items.push(...missing.map((name, k) => ({ id: uid() + k, name, on: true, added: Date.now(), group: NONE, canteen: name === CANTEEN })));
        seedGroups(missing);
        commit(['items', 'groups']);
      }
      return missing.length;
    },
    addGroup(name) {
      const [n, err] = checkGroupName(name);
      if (err) return { err };
      const g = { id: uid(), name: n };
      groups.push(g);
      commit(['groups']);
      return { group: g };
    },
    renameGroup(id, name) {
      const g = group(id);
      if (!g) return '这个分组已经不存在了';
      const [n, err] = checkGroupName(name, id);
      if (err) return err;
      g.name = n;
      commit(['groups']);
      return '';
    },
    moveGroup(id, dir) {
      const k = groups.findIndex(g => g.id === id);
      const j = k + dir;
      if (k < 0 || j < 0 || j >= groups.length) return;
      [groups[k], groups[j]] = [groups[j], groups[k]];
      commit(['groups']);
    },
    removeGroup(id) {
      const k = groups.findIndex(g => g.id === id);
      if (k < 0) return;
      groups.splice(k, 1);
      items.forEach(it => { if (it.group === id) it.group = NONE; });
      history.forEach(h => { if (h.group === id) h.group = NONE; });
      commit(['items', 'groups', 'history']);
    },
    log(id, at = Date.now(), dishes, extra = {}) {
      const it = get(id);
      if (!it) return null;
      const entry = { id: uid(), item: id, name: it.name, at, t: Date.now(), ...extra };
      if (dishes?.length) entry.dishes = [...dishes];
      let k = history.length;
      while (k > 0 && history[k - 1].at > at) k--;
      history.splice(k, 0, entry);
      commit(['history']);
      return entry;
    },
    entry: entryId => history.find(h => h.id === entryId),
    setDishes(entryId, dishes, ratings = {}) {
      const h = history.find(h => h.id === entryId);
      if (!h) return;
      const clean = [];
      for (const d of dishes.map(normName).filter(Boolean)) {
        if (!clean.some(c => nameKey(c) === nameKey(d))) clean.push(d.slice(0, 40));
      }
      if (clean.length) h.dishes = clean;
      else delete h.dishes;
      const dr = {};
      clean.forEach(d => { if (ratings[d]) dr[d] = ratings[d]; });
      if (Object.keys(dr).length) h.dr = dr;
      else delete h.dr;
      commit(['history']);
    },
    rate(entryId, r) {
      const h = history.find(h => h.id === entryId);
      if (!h) return;
      if (r === null) delete h.r;
      else h.r = r;
      commit(['history']);
    },
    setCool(id, until) {
      const it = get(id);
      if (!it) return;
      if (until > Date.now()) it.cool = until;
      else delete it.cool;
      commit(['items']);
    },
    cooling: it => it.cool && it.cool > Date.now() ? it.cool : 0,
    unlog(entryId) {
      const k = history.findIndex(h => h.id === entryId);
      if (k < 0) return;
      history.splice(k, 1);
      commit(['history']);
    },
  };
})();
