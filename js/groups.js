function scopeOptions() {
  const opts = [[ALL, '全部', Data.items.length]];
  Data.groups.forEach(g => opts.push([g.id, g.name, Data.items.filter(it => it.group === g.id).length]));
  const loose = Data.items.filter(it => !it.group).length;
  if (loose) opts.push([NONE, '未分组', loose]);
  return opts;
}

function renderChips(box, current, onPick, extra) {
  box.replaceChildren(...scopeOptions().map(([id, name, n]) => {
    const b = el('button', id === current ? 'chip on' : 'chip');
    b.type = 'button';
    b.setAttribute('aria-pressed', id === current);
    b.append(el('span', '', name), el('span', 'chip-n', String(n)));
    b.onclick = () => onPick(id);
    return b;
  }));
  if (extra) box.append(extra);
  const on = box.querySelector('.chip.on');
  if (on && (on.offsetLeft < box.scrollLeft || on.offsetLeft + on.offsetWidth > box.scrollLeft + box.clientWidth)) {
    box.scrollLeft = on.offsetLeft - 16;
  }
}

function currentScope() {
  if (!Data.validScope(settings.scope)) setSetting('scope', ALL);
  return settings.scope;
}

function setScope(scope) {
  setSetting('scope', scope);
  if (!picker.rolling && picker.current && !picker.accepted) picker.current = null;
  renderGroupBar();
  renderPick();
  renderList();
}

function renderGroupBar() {
  const edit = el('button', 'chip ghost-chip');
  edit.type = 'button';
  edit.innerHTML = ICONS.edit;
  edit.append(el('span', '', '编辑分组'));
  edit.onclick = openGroups;
  const scope = currentScope();
  renderChips($('#groupBar'), scope, setScope, edit);
  $('#addInput').placeholder = scope === ALL || scope === NONE
    ? '添加食物或饭店，多个可用逗号分隔'
    : `添加到“${Data.scopeName(scope)}”，多个可用逗号分隔`;
}

function renderGroupList() {
  const list = $('#groupList');
  if (!Data.groups.length) {
    list.replaceChildren(el('li', 'hint', '还没有分组'));
    return;
  }
  list.replaceChildren(...Data.groups.map((g, k) => {
    const li = el('li');
    const input = el('input');
    input.value = g.name;
    input.maxLength = 20;
    input.setAttribute('aria-label', '分组名称');
    input.onchange = () => {
      const err = Data.renameGroup(g.id, input.value);
      msg('groupMsg', err, true);
      if (err) input.value = g.name;
    };
    input.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      }
    };
    const n = Data.items.filter(it => it.group === g.id).length;
    const up = iconBtn('up', '上移', 'up');
    up.disabled = k === 0;
    up.onclick = () => Data.moveGroup(g.id, -1);
    const down = iconBtn('down', '下移', 'down');
    down.disabled = k === Data.groups.length - 1;
    down.onclick = () => Data.moveGroup(g.id, 1);
    const del = iconBtn('trash', '删除分组', 'del');
    del.onclick = () => {
      if (n && !confirm(`删除分组“${g.name}”？\n里面的 ${n} 项会变成未分组，不会被删除。`)) return;
      Data.removeGroup(g.id);
    };
    li.append(input, el('span', 'meta', `${n} 项`), up, down, del);
    return li;
  }));
}

function openGroups() {
  msg('groupMsg', '');
  renderGroupList();
  $('#groupDlg').showModal();
}

function bindGroups() {
  $('#groupForm').onsubmit = e => {
    e.preventDefault();
    const input = $('#groupInput');
    const { err } = Data.addGroup(input.value);
    msg('groupMsg', err || '', true);
    if (!err) {
      input.value = '';
      $('#groupList').lastElementChild?.scrollIntoView({ block: 'nearest' });
    }
  };
  $('#groupClose').onclick = () => $('#groupDlg').close();
  Data.onChange(() => {
    renderGroupBar();
    if ($('#groupDlg').open) renderGroupList();
  });
  renderGroupBar();
}
