function applyTheme() {
  const dark = settings.theme === 'dark';
  const btn = $('#themeBtn');
  document.documentElement.dataset.theme = settings.theme;
  btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
  btn.title = dark ? '切换到浅色模式' : '切换到深色模式';
  btn.setAttribute('aria-label', btn.title);
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1e23' : '#ffffff');
}

function exportBackup() {
  try {
    const d = new Date();
    const data = JSON.stringify({ app: 'EatWhat', version: 1, exportedAt: Date.now(), prefs: store.all() });
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `EatWhat-${dayKey(d).replace(/-/g, '')}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    msg('backupMsg', `已导出：${Data.items.length} 项菜单，${Data.history.length} 条吃饭记录`);
  } catch (e) {
    msg('backupMsg', '导出失败：' + e.message, true);
  }
}

async function importBackup(file) {
  try {
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      throw new Error('不是有效的备份文件');
    }
    if (obj?.app !== 'EatWhat' || typeof obj.prefs !== 'object') throw new Error('不是有效的备份文件');
    const p = obj.prefs;
    const when = new Date(obj.exportedAt).toLocaleString('zh-CN');
    const n = Array.isArray(p.items) ? p.items.length : 0;
    const h = Array.isArray(p.history) ? p.history.length : 0;
    if (!confirm(`导入 ${when} 的备份（${n} 项菜单，${h} 条记录）？\n当前的所有数据将被覆盖。`)) return;
    Achv.freeze();
    store.clear();
    for (const [k, v] of Object.entries(p)) store.set(k, v);
    location.reload();
  } catch (e) {
    msg('backupMsg', '导入失败：' + e.message, true);
  }
}

function bindSettings() {
  $('#themeBtn').onclick = () => {
    setSetting('theme', settings.theme === 'dark' ? 'light' : 'dark');
    applyTheme();
  };
  const hint = () => { $('#modeHint').textContent = MODE_HINTS[settings.mode]; };
  bindSelect('modeSel', 'mode', MODES, hint);
  bindSelect('avoidSel', 'avoid', AVOIDS, renderPoolInfo);
  const speed = $('#speedSel');
  bindCheck('animChk', 'anim', () => { speed.disabled = !settings.anim; });
  bindSelect('speedSel', 'speed', SPEEDS);
  speed.disabled = !settings.anim;
  bindCheck('smartChk', 'smart');
  hint();
  $('#exportBtn').onclick = exportBackup;
  $('#importInput').onchange = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  };
  $('#restoreBtn').onclick = () => {
    const n = Data.restoreDefaults();
    msg('resetMsg', n ? `已恢复 ${n} 项内置店名` : '内置店名都已经在菜单里了');
  };
  $('#resetBtn').onclick = () => {
    if (!confirm('确定清空全部数据？吃饭记录、统计和成就都会被删除，菜单恢复为内置店名，无法撤销。')) return;
    if (!confirm('真的确定吗？建议先导出备份。')) return;
    const theme = settings.theme;
    Achv.freeze();
    store.clear();
    try {
      localStorage.removeItem(PET_KEY);
    } catch {}
    store.set('theme', theme);
    location.replace(location.pathname);
  };
}

pages.settings = { el: '#settingsPage' };
