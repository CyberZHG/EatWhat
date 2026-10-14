const histView = { limit: 30 };

function renderHistory() {
  const all = Data.history;
  $('#histCount').textContent = all.length ? `（${all.length}）` : '';
  $('#histEmpty').hidden = all.length > 0;
  const shown = all.slice(-histView.limit).reverse();
  let day = null;
  const nodes = [];
  for (const h of shown) {
    const d = new Date(h.at);
    const key = dayKey(d);
    if (key !== day) {
      day = key;
      const n = daysBetween(h.at, Date.now());
      const label = n === 0 ? '今天' : n === 1 ? '昨天' : n === 2 ? '前天' : '';
      nodes.push(el('li', 'day', `${key} 周${WEEK[d.getDay()]}${label ? ' · ' + label : ''}`));
    }
    const li = el('li');
    const main = el('div', 'grow');
    const name = el('div', 'name', Data.entryName(h));
    if (!Data.get(h.item)) name.classList.add('gone');
    main.append(name);
    if (h.dishes) main.append(el('div', 'dishes', h.dishes.join('、')));
    li.append(main);
    const tag = ratingTag(h.r);
    if (tag) li.append(tag);
    li.append(el('span', 'meta', `${meal(h.at)} ${pad(d.getHours())}:${pad(d.getMinutes())}`));
    li.classList.add('clickable');
    li.onclick = e => { if (!e.target.closest('button')) openEntry(h.id); };
    const b = iconBtn('trash', '删除这条记录', 'unlog');
    b.onclick = () => {
      Data.unlog(h.id);
      notify(`已删除 ${Data.entryName(h)} 的记录`, Data.get(h.item) ? '撤销' : '', () => {
        const { item, at, dishes, id, name, ...rest } = h;
        Data.log(item, at, dishes, rest);
      });
    };
    li.append(b);
    nodes.push(li);
  }
  $('#histList').replaceChildren(...nodes);
  $('#histMore').hidden = all.length <= histView.limit;
}

function bindHistory() {
  $('#histMore').onclick = () => {
    histView.limit += 50;
    renderHistory();
  };
  Data.onChange(renderHistory);
  renderHistory();
}
