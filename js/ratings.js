const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/></svg>';

const avgOf = s => s && s.rN ? s.rSum / s.rN : 0;
const fmtAvg = v => v.toFixed(1);

function starsEl(avg, n, small = false) {
  const wrap = el('span', small ? 'stars small' : 'stars');
  const box = el('span', 'stars-box');
  const bg = el('span', 'stars-bg');
  const fg = el('span', 'stars-fg');
  bg.innerHTML = fg.innerHTML = STAR.repeat(5);
  fg.style.width = `${Math.max(0, Math.min(5, avg)) / 5 * 100}%`;
  box.append(bg, fg);
  wrap.append(box);
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', n ? `平均 ${fmtAvg(avg)} 分，共 ${n} 次评价` : '还没有评价');
  if (n !== undefined) wrap.append(el('span', 'stars-text', n ? `${fmtAvg(avg)} · ${n} 评` : '未评价'));
  return wrap;
}

function ratingSet(current, onPick, small = false) {
  const box = el('div', small ? 'rate-set small' : 'rate-set');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', '评价');
  RATINGS.forEach(([r, name, cls]) => {
    const b = el('button', `rate ${cls}${current === r ? ' on' : ''}`, name);
    b.type = 'button';
    b.setAttribute('aria-pressed', current === r);
    b.onclick = e => {
      e.stopPropagation();
      onPick(current === r ? null : r);
    };
    box.append(b);
  });
  return box;
}

function ratingTag(r) {
  return r ? el('span', `rate-tag ${ratingClass(r)}`, ratingName(r)) : null;
}

function pendingRating() {
  const now = Date.now();
  for (let k = Data.history.length - 1; k >= 0; k--) {
    const h = Data.history[k];
    if (h.at > now + MINUTE) continue;
    if (now - h.at > 2 * DAY) return null;
    if (h.r === undefined && Data.get(h.item)) return h;
  }
  return null;
}

function renderRatePanel() {
  const h = pendingRating();
  const panel = $('#ratePanel');
  panel.hidden = !h;
  if (!h) return;
  const n = daysBetween(h.at, Date.now());
  const when = n === 0 ? `今天${meal(h.at)}` : n === 1 ? `昨天${meal(h.at)}` : `${dayKey(new Date(h.at)).slice(5)} ${meal(h.at)}`;
  const title = el('div', 'rate-q');
  title.append(`${when}的`, el('b', '', Data.entryName(h)), '吃得怎么样？');
  const row = el('div', 'row');
  row.append(ratingSet(undefined, r => {
    Data.rate(h.id, r);
    notify(`已评价：${Data.entryName(h)} ${ratingName(r)}`, '撤销', () => Data.rate(h.id, null));
  }));
  const later = el('button', 'link', '不评了');
  later.type = 'button';
  later.onclick = () => Data.rate(h.id, 0);
  row.append(later);
  panel.replaceChildren(title, row);
  if (h.dishes) {
    const b = el('button', 'link', '给每道菜打分');
    b.type = 'button';
    b.onclick = () => openDishes(h.id);
    panel.append(b);
  }
}

const entryView = { id: null };

function renderEntryDlg() {
  const h = Data.entry(entryView.id);
  if (!h) return $('#entryDlg').close();
  const it = Data.get(h.item);
  $('#entryTitle').textContent = Data.entryName(h);
  $('#entryWhen').textContent = `${fmtTime(h.at)} 周${WEEK[new Date(h.at).getDay()]} · ${meal(h.at)}`;
  $('#entryRate').replaceChildren(ratingSet(h.r || undefined, r => Data.rate(h.id, r)));
  const dishes = $('#entryDishes');
  dishes.replaceChildren(...(h.dishes || []).map(d => {
    const li = el('li');
    li.append(el('span', 'grow', d));
    const tag = ratingTag(h.dr?.[d]);
    if (tag) li.append(tag);
    return li;
  }));
  dishes.hidden = !h.dishes;
  $('#entryDishBtn').hidden = !(it?.canteen || h.dishes);
  $('#entryDishBtn').textContent = h.dishes ? '修改菜品和评分' : '填写吃了什么';
}

function openEntry(id) {
  if (!Data.entry(id)) return;
  entryView.id = id;
  renderEntryDlg();
  $('#entryDlg').showModal();
}

function bindRatings() {
  const dlg = $('#entryDlg');
  $('#entryClose').onclick = () => dlg.close();
  $('#entryDishBtn').onclick = () => openDishes(entryView.id);
  $('#entryDel').onclick = () => {
    const h = Data.entry(entryView.id);
    if (!h) return dlg.close();
    Data.unlog(h.id);
    dlg.close();
    notify(`已删除 ${Data.entryName(h)} 的记录`, Data.get(h.item) ? '撤销' : '', () => {
      const { item, at, dishes, ...rest } = h;
      delete rest.id;
      delete rest.name;
      Data.log(item, at, dishes, rest);
    });
  };
  Data.onChange(() => {
    renderRatePanel();
    if (dlg.open) renderEntryDlg();
  });
  renderRatePanel();
}
