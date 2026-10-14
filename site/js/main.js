applyIcons();
applyTheme();
bindSettings();
bindGroups();
bindPicker();
bindList();
bindEditor();
bindDishes();
bindRatings();
bindPet();
bindHistory();
bindShare();
bindHeatmap();
bindFolds();
$('#aboutBtn').onclick = () => $('#aboutDlg').showModal();
$('#aboutClose').onclick = () => $('#aboutDlg').close();
$$('dialog').forEach(d => d.addEventListener('click', e => {
  if (e.target !== d) return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
}));
bindSync();
Achv.check();
route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !picker.rolling) location.reload();
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
