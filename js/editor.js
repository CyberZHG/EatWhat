const editor = { id: null };

function localInput(t) {
  const d = new Date(t);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderEditor() {
  const it = Data.get(editor.id);
  if (!it) return $('#editDlg').close();
  const s = Data.stat(it.id);
  const dishes = Data.dishes().filter(d => d.items.has(it.id)).sort((a, b) => b.items.get(it.id) - a.items.get(it.id));
  $('#editStars').replaceChildren(starsEl(avgOf(s), s.rN));
  $('#editStats').textContent = (s.count
    ? `吃过 ${s.count} 次，第一次是 ${dayKey(new Date(s.first))}，上次是${fmtAgo(s.last)}`
    : '还没有吃过') + (dishes.length ? `。吃过 ${dishes.length} 道菜，最常点：${dishes.slice(0, 3).map(d => d.name).join('、')}` : '');
  const entries = Data.history.filter(h => h.item === it.id).slice(-30).reverse();
  $('#editHist').replaceChildren(...entries.map(h => {
    const li = el('li');
    const main = el('div', 'grow');
    main.append(el('div', '', fmtTime(h.at)));
    if (h.dishes) main.append(el('div', 'dishes', h.dishes.join('、')));
    li.append(main);
    const tag = ratingTag(h.r);
    if (tag) li.append(tag);
    li.append(el('span', 'meta', meal(h.at)));
    li.classList.add('clickable');
    li.onclick = e => { if (!e.target.closest('button')) openEntry(h.id); };
    if (it.canteen || h.dishes) {
      const e = iconBtn('edit', '编辑吃了什么', 'dishes');
      e.onclick = () => openDishes(h.id);
      li.append(e);
    }
    const b = iconBtn('trash', '删除这条记录', 'unlog');
    b.onclick = () => Data.unlog(h.id);
    li.append(b);
    return li;
  }));
}

function openEditor(id) {
  const it = Data.get(id);
  if (!it) return;
  editor.id = id;
  $('#editName').value = it.name;
  $('#editOn').checked = it.on;
  $('#editCanteen').checked = !!it.canteen;
  $('#editDel').disabled = !!it.canteen;
  $('#editDel').title = it.canteen ? '食堂不能删除' : '';
  $('#editGroup').replaceChildren(new Option('未分组', NONE), ...Data.groups.map(g => new Option(g.name, g.id)));
  $('#editGroup').value = it.group || NONE;
  const cool = Data.cooling(it);
  $('#editCool').replaceChildren(
    new Option(cool ? `冷却到 ${dayKey(new Date(cool))}` : '不冷却', ''),
    ...(cool ? [new Option('解除冷却', -1)] : []),
    ...COOLS.map(([d, name]) => new Option(`${name}内不再抽到`, d)),
  );
  $('#editCool').value = '';
  $('#editDate').value = localInput(Date.now() - HOUR);
  $('#editDate').max = localInput(Date.now());
  msg('editMsg', '');
  renderEditor();
  $('#editDlg').showModal();
}

function bindEditor() {
  const dlg = $('#editDlg');
  $('#editForm').onsubmit = e => {
    e.preventDefault();
    const err = Data.update(editor.id, { name: $('#editName').value, on: $('#editOn').checked, canteen: $('#editCanteen').checked, group: $('#editGroup').value });
    if (err) return msg('editMsg', err, true);
    const cool = Number($('#editCool').value);
    if (cool < 0) Data.setCool(editor.id, 0);
    else if (cool > 0) {
      Data.setCool(editor.id, Date.now() + cool * DAY);
      Achv.cooled();
    }
    dlg.close();
  };
  $('#editCancel').onclick = () => dlg.close();
  $('#editDel').onclick = () => {
    if (removeItem(editor.id)) dlg.close();
  };
  $('#editLog').onclick = () => {
    const v = $('#editDate').value;
    const at = v ? new Date(v).getTime() : NaN;
    if (!Number.isFinite(at)) return msg('editMsg', '请选择时间', true);
    if (at > Date.now() + MINUTE) return msg('editMsg', '不能补记未来的时间', true);
    msg('editMsg', '');
    if (Data.get(editor.id).canteen !== $('#editCanteen').checked) Data.update(editor.id, { canteen: $('#editCanteen').checked });
    logMeal(editor.id, at);
    if (Date.now() - at > HOUR / 2) Achv.backfilled();
  };
  Data.onChange(() => editor.id && dlg.open && renderEditor());
}
