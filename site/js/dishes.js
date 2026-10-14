const dishView = { target: null, list: [], ratings: {}, rating: undefined, active: -1, matches: [] };

function editDistance(a, b) {
  const x = [...a], y = [...b];
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

function grams(s) {
  const chars = [...s].filter(c => c.trim());
  const out = new Map();
  const add = g => out.set(g, (out.get(g) || 0) + 1);
  chars.forEach(add);
  for (let k = 0; k + 1 < chars.length; k++) add(chars[k] + chars[k + 1]);
  return out;
}

function dice(a, b) {
  const ga = grams(a), gb = grams(b);
  let both = 0, total = 0;
  for (const [g, n] of ga) {
    both += Math.min(n, gb.get(g) || 0);
    total += n;
  }
  for (const n of gb.values()) total += n;
  return total ? 2 * both / total : 0;
}

function dishScore(query, name) {
  const a = nameKey(query).replace(/\s/g, ''), b = nameKey(name).replace(/\s/g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (b.startsWith(a)) return 0.95;
  if (b.includes(a)) return 0.9;
  if (a.includes(b) && [...b].length >= 2) return 0.8;
  const la = [...a].length, lb = [...b].length;
  const dist = editDistance(a, b);
  if (Math.min(la, lb) >= 2 && dist <= (Math.max(la, lb) >= 5 ? 2 : 1)) return 0.8;
  let i = 0;
  const qa = [...a];
  for (const ch of b) if (ch === qa[i]) i++;
  if (i === qa.length && la >= 2) return 0.7;
  return dice(a, b) * 0.85;
}

function matchDishes(query, itemId, exclude = []) {
  const skip = new Set(exclude.map(nameKey));
  return Data.dishes()
    .filter(d => !skip.has(nameKey(d.name)))
    .map(d => ({ d, score: dishScore(query, d.name), here: d.items.get(itemId) || 0 }))
    .filter(m => m.score >= 0.3)
    .sort((x, y) => y.score - x.score || y.here - x.here || y.d.count - x.d.count)
    .slice(0, 6);
}

function dishLabel(d, itemId) {
  const here = d.items.get(itemId) || 0;
  return here ? `吃过 ${d.count} 次` : `吃过 ${d.count} 次 · 别处`;
}

function renderDishChips() {
  const box = $('#dishChips');
  box.replaceChildren(...dishView.list.map((name, k) => {
    const li = el('li', 'dish-row');
    li.append(el('span', 'grow name', name), ratingSet(dishView.ratings[name], r => {
      if (r) dishView.ratings[name] = r;
      else delete dishView.ratings[name];
      renderDishChips();
    }, true));
    const b = el('button', 'icon-btn small');
    b.type = 'button';
    b.title = `移除 ${name}`;
    b.setAttribute('aria-label', b.title);
    b.innerHTML = ICONS.close;
    b.onclick = () => {
      dishView.list.splice(k, 1);
      delete dishView.ratings[name];
      renderDishChips();
      renderDishFav();
      $('#dishInput').focus();
    };
    li.append(b);
    return li;
  }));
  box.hidden = !dishView.list.length;
}

function renderDishFav() {
  const h = dishView.target;
  if (!h) return;
  const taken = new Set(dishView.list.map(nameKey));
  const fav = Data.dishes()
    .filter(d => d.items.has(h.item) && !taken.has(nameKey(d.name)))
    .sort((a, b) => b.items.get(h.item) - a.items.get(h.item) || b.last - a.last)
    .slice(0, 10);
  $('#dishFav').replaceChildren(...fav.map(d => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.append(el('span', '', d.name), el('span', 'chip-n', String(d.items.get(h.item))));
    b.onclick = () => addDish(d.name);
    return b;
  }));
  $('#dishFavWrap').hidden = !fav.length;
}

function renderSuggest() {
  const input = $('#dishInput');
  const q = input.value.trim();
  const h = dishView.target;
  const box = $('#dishSuggest');
  dishView.matches = q && h ? matchDishes(q, h.item, dishView.list) : [];
  if (dishView.active >= dishView.matches.length) dishView.active = -1;
  box.replaceChildren(...dishView.matches.map((m, k) => {
    const li = el('li', k === dishView.active ? 'on' : '');
    li.id = 'dishOpt' + k;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', k === dishView.active);
    li.append(el('span', 'grow', m.d.name));
    if (m.d.rN) li.append(starsEl(avgOf(m.d), undefined, true));
    li.append(el('span', 'meta', dishLabel(m.d, h.item)));
    li.onpointerdown = e => {
      e.preventDefault();
      addDish(m.d.name);
    };
    return li;
  }));
  box.hidden = !dishView.matches.length;
  input.setAttribute('aria-expanded', !box.hidden);
  if (dishView.active >= 0) input.setAttribute('aria-activedescendant', 'dishOpt' + dishView.active);
  else input.removeAttribute('aria-activedescendant');
}

function showNear(name) {
  const near = $('#dishNear');
  near.replaceChildren();
  near.hidden = true;
  if (Data.dish(name)) return;
  const h = dishView.target;
  const best = matchDishes(name, h?.item, dishView.list).find(m => m.score >= 0.6);
  if (!best) return;
  near.append(`“${name}”和之前吃过的“${best.d.name}”很像，是同一道菜吗？`);
  const b = el('button', 'link', `换成“${best.d.name}”`);
  b.type = 'button';
  b.onclick = () => {
    const k = dishView.list.findIndex(n => nameKey(n) === nameKey(name));
    if (k >= 0) {
      const old = dishView.list[k];
      dishView.list.splice(k, 1, best.d.name);
      if (dishView.ratings[old]) dishView.ratings[best.d.name] = dishView.ratings[old];
      delete dishView.ratings[old];
    }
    dishView.list = dishView.list.filter((n, i, arr) => arr.findIndex(m => nameKey(m) === nameKey(n)) === i);
    near.hidden = true;
    renderDishChips();
    renderDishFav();
    $('#dishInput').focus();
  };
  near.append(' ', b);
  near.hidden = false;
}

function addDish(raw) {
  const names = raw.split(/[,，、;；\n]+/).map(normName).filter(Boolean).map(s => s.slice(0, 40));
  let last = null;
  for (let name of names) {
    name = Data.dish(name)?.name ?? name;
    if (dishView.list.some(n => nameKey(n) === nameKey(name))) continue;
    dishView.list.push(name);
    last = name;
  }
  $('#dishInput').value = '';
  dishView.active = -1;
  renderSuggest();
  renderDishChips();
  renderDishFav();
  if (last) showNear(last);
  else $('#dishNear').hidden = true;
  $('#dishInput').focus();
}

function renderDishRate() {
  $('#dishRate').replaceChildren(ratingSet(dishView.rating || undefined, r => {
    dishView.rating = r ?? undefined;
    renderDishRate();
  }));
}

function showDishDialog(target, list, skipLabel, ratings = {}, rating) {
  dishView.target = target;
  dishView.list = [...list];
  dishView.ratings = { ...ratings };
  dishView.rating = rating;
  renderDishRate();
  dishView.active = -1;
  $('#dishTitle').textContent = `在“${target.name}”吃了什么`;
  $('#dishWhen').textContent = `${fmtTime(target.at)} · ${meal(target.at)}`;
  $('#dishInput').value = '';
  $('#dishNear').hidden = true;
  $('#dishSkip').textContent = skipLabel;
  $('#dishSave').textContent = target.entryId ? '保存' : '记下这顿';
  renderSuggest();
  renderDishChips();
  renderDishFav();
  $('#dishDlg').showModal();
  $('#dishInput').focus();
}

function openDishes(entryId, fresh = false) {
  const h = Data.entry(entryId);
  if (!h) return;
  showDishDialog({ entryId, item: h.item, at: h.at, name: Data.entryName(h) }, h.dishes || [], fresh ? '先不填' : '取消', h.dr || {}, h.r || undefined);
}

function openCanteen(id) {
  const it = Data.get(id);
  if (!it) return;
  showDishDialog({ entryId: null, item: id, at: Date.now(), name: it.name }, [], '取消');
}

function lastDishes(id) {
  for (let k = Data.history.length - 1; k >= 0; k--) {
    const h = Data.history[k];
    if (h.item === id && h.dishes) return h;
  }
  return null;
}

function logMeal(id, at, dishes) {
  const entry = Data.log(id, at, dishes);
  if (entry && Data.get(id).canteen && !dishes) openDishes(entry.id, true);
  return entry;
}

function renderCanteens() {
  const list = Data.items.filter(it => it.canteen);
  $('#canteenPanel').hidden = !list.length;
  $('#canteenList').replaceChildren(...list.map(it => {
    const row = el('div', 'canteen-row');
    const badge = el('div', 'badge');
    badge.innerHTML = ICONS.tray;
    const info = el('div', 'grow');
    const last = lastDishes(it.id);
    const s = Data.stat(it.id);
    info.append(el('div', 'name', it.name), el('div', 'dishes', last
      ? `上次：${last.dishes.join('、')} · ${fmtAgo(last.at)}`
      : s.count ? `吃过 ${s.count} 次，还没记过菜名` : '还没有记录'));
    row.append(badge, info);
    const go = el('button', 'primary log-btn');
    go.type = 'button';
    go.innerHTML = ICONS.plus;
    go.append('记一顿');
    go.onclick = () => openCanteen(it.id);
    row.append(go);
    return row;
  }));
}

function bindDishes() {
  const dlg = $('#dishDlg');
  const input = $('#dishInput');
  input.oninput = () => {
    dishView.active = -1;
    renderSuggest();
  };
  input.onkeydown = e => {
    const n = dishView.matches.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      dishView.active = (dishView.active + 1) % n;
      renderSuggest();
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      dishView.active = (dishView.active - 1 + n) % n;
      renderSuggest();
    } else if (e.key === 'Enter' && !e.isComposing) {
      if (dishView.active >= 0) {
        e.preventDefault();
        addDish(dishView.matches[dishView.active].d.name);
      } else if (input.value.trim()) {
        e.preventDefault();
        addDish(input.value);
      }
    } else if (e.key === 'Escape' && !$('#dishSuggest').hidden) {
      e.preventDefault();
      dishView.matches = [];
      $('#dishSuggest').hidden = true;
    } else if (e.key === 'Backspace' && !input.value && dishView.list.length) {
      dishView.list.pop();
      renderDishChips();
      renderDishFav();
    }
  };
  input.onblur = () => setTimeout(() => { $('#dishSuggest').hidden = true; }, 100);
  input.onfocus = renderSuggest;
  $('#dishAdd').onclick = () => input.value.trim() ? addDish(input.value) : input.focus();
  $('#dishForm').onsubmit = e => {
    e.preventDefault();
    if (input.value.trim()) addDish(input.value);
    const t = dishView.target;
    const before = Data.dishes().length;
    let entry = null;
    if (t.entryId) {
      Data.setDishes(t.entryId, dishView.list, dishView.ratings);
      const h = Data.entry(t.entryId);
      if (h && dishView.rating && h.r !== dishView.rating) Data.rate(t.entryId, dishView.rating);
    } else {
      const extra = {};
      const dr = {};
      dishView.list.forEach(d => { if (dishView.ratings[d]) dr[d] = dishView.ratings[d]; });
      if (Object.keys(dr).length) extra.dr = dr;
      if (dishView.rating) extra.r = dishView.rating;
      entry = Data.log(t.item, t.at, dishView.list, extra);
    }
    const added = Data.dishes().length - before;
    const n = dishView.list.length;
    const text = !n ? `已记录：${t.name}` : added > 0 ? `已记录 ${n} 道菜，其中 ${added} 道是第一次吃` : `已记录 ${n} 道菜`;
    if (entry) notify(text, '撤销', () => Data.unlog(entry.id));
    else if (n) notify(text);
    dlg.close();
  };
  $('#dishSkip').onclick = () => dlg.close();
  Data.onChange(renderCanteens);
  renderCanteens();
  if (new URLSearchParams(location.search).has('canteen')) {
    history.replaceState(null, '', location.pathname + location.hash);
    const list = Data.items.filter(it => it.canteen);
    if (list.length === 1) openCanteen(list[0].id);
    else if (list.length) $('#canteenPanel').scrollIntoView({ block: 'center' });
  }
}
