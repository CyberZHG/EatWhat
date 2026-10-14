function petSvg(level, mood) {
  const scale = 1 + Math.min(level - 1, 20) * 0.015;
  const eyes = mood > 0
    ? '<path d="M70 92q8-9 16 0M114 92q8-9 16 0" class="pet-line"/>'
    : '<circle cx="78" cy="92" r="6" class="pet-eye"/><circle cx="122" cy="92" r="6" class="pet-eye"/>';
  const mouth = mood < 0
    ? '<path d="M88 124q12-8 24 0" class="pet-line"/>'
    : '<path d="M86 116q14 14 28 0" class="pet-line pet-mouth"/>';
  const hat = level >= 5
    ? '<path d="M70 44h60v-6a14 14 0 0 0-8-26 18 18 0 0 0-22-8 18 18 0 0 0-22 8 14 14 0 0 0-8 26z" class="pet-hat"/><path d="M70 44h60" class="pet-line thin"/>'
    : '';
  const bib = level >= 10 ? '<path d="M78 140l22 16 22-16" class="pet-bib"/>' : '';
  return `<svg viewBox="0 0 200 200" class="pet-svg" aria-hidden="true">
<g transform="translate(100 120) scale(${scale}) translate(-100 -120)">
<ellipse cx="100" cy="184" rx="58" ry="8" class="pet-shadow"/>
<path d="M100 40c52 0 76 40 76 82 0 38-30 58-76 58s-76-20-76-58c0-42 24-82 76-82z" class="pet-skin"/>
<ellipse cx="64" cy="112" rx="10" ry="6" class="pet-cheek"/><ellipse cx="136" cy="112" rx="10" ry="6" class="pet-cheek"/>
${eyes}${mouth}${bib}${hat}
<ellipse cx="68" cy="178" rx="16" ry="8" class="pet-foot"/><ellipse cx="132" cy="178" rx="16" ry="8" class="pet-foot"/>
</g></svg>`;
}

function petMood() {
  const e = Pet.env();
  if (!e.recentN) return 0;
  return e.avg >= 3.5 ? 1 : e.avg < 2.5 ? -1 : 0;
}

function renderPetHead() {
  const s = Pet.s;
  const lv = petLevel(s.exp);
  const mood = petMood();
  const art = $('#petArt');
  const key = `${lv.level}|${mood}`;
  if (art.dataset.key !== key) {
    art.innerHTML = petSvg(lv.level, mood);
    art.dataset.key = key;
  }
  const sp = speciesOf(s);
  art.style.setProperty('--pet-color', sp.color || 'var(--accent)');
  $('#petSpeciesName').textContent = `${sp.name} · ${sp.trait}`;
  $('#petName').textContent = s.name;
  $('#petLevel').textContent = `${lv.level} 级`;
  $('#petExpFill').style.width = `${lv.into / lv.need * 100}%`;
  $('#petExp').textContent = `经验 ${lv.into} / ${lv.need}。经验只来自真实记录的饭。`;
  const e = Pet.env();
  const moodText = !e.recentN ? '心情：一般。最近 14 天没有评分。' : `心情：${mood > 0 ? '好' : mood < 0 ? '差' : '一般'}。最近 14 天平均评分 ${e.avg.toFixed(1)}。`;
  $('#petMood').textContent = moodText;
  const today = Pet.todayMeals();
  $('#petMeals').textContent = `今天的真实饭奖励：${today} / ${MEAL_CAP}。`;
}

function petAsk({ title, text, ok, input, danger }) {
  const dlg = $('#petDlg');
  $('#petDlgTitle').textContent = title;
  $('#petDlgText').textContent = text;
  const field = $('#petDlgInput');
  field.hidden = input === undefined;
  field.value = input ?? '';
  const okBtn = $('#petDlgOk');
  okBtn.textContent = ok;
  okBtn.classList.toggle('danger-fill', !!danger);
  return new Promise(resolve => {
    const done = v => {
      dlg.onclose = null;
      if (dlg.open) dlg.close();
      resolve(v);
    };
    $('#petDlgForm').onsubmit = e => {
      e.preventDefault();
      done(input === undefined ? true : field.value);
    };
    $('#petDlgCancel').onclick = () => done(input === undefined ? false : null);
    dlg.onclose = () => resolve(input === undefined ? false : null);
    dlg.showModal();
    if (input !== undefined) {
      field.focus();
      field.select();
    } else okBtn.focus();
  });
}

function renderPetNumbers() {
  const s = Pet.s;
  $('#petMiniKcal').textContent = `${fmtBig(s.kcal)} 卡`;
  $('#petMiniRate').textContent = `每秒 ${fmtBig(Pet.rate())}`;
  const hour = new Date().getHours();
  if (hour !== petHour) {
    petHour = hour;
    renderPetBonus();
  }
  $('#petKcal').textContent = fmtBig(s.kcal);
  const peak = Pet.isPeak();
  $('#petRate').textContent = `每秒 ${fmtBig(Pet.rate())} 卡${peak ? '，饭点 ×2' : ''}`;
  $('#petFeedVal').textContent = `+${fmtBig(Pet.clickValue())}`;
  $('#petDebt').hidden = !(s.debt > 0);
  $('#petDebt').textContent = `待扣除 ${fmtBig(s.debt)} 卡。删除了获得过奖励的吃饭记录，之后的收入会先抵扣这部分。`;
  $$('#petFoods [data-food]').forEach(row => {
    const i = Number(row.dataset.food);
    const k = s.buy === 'max' ? Math.max(1, Pet.maxBuy(i)) : s.buy;
    const cost = Pet.costOf(i, k);
    const btn = row.querySelector('button');
    btn.disabled = cost > s.kcal;
    btn.textContent = `买 ${k} 份 · ${fmtBig(cost)} 卡`;
    row.querySelector('.food-own').textContent = `持有 ${s.foods[i]}`;
    const total = prodOf(s);
    const share = total ? foodRateOf(s, i) / total * 100 : 0;
    const mul = Pet.rate() / Math.max(total, 1e-300);
    const one = FOODS[i].rate * Pet.foodMul(i) * (total ? mul : Pet.baseMul());
    row.querySelector('.food-rate').textContent = `每份每秒 ${fmtBig(one)} 卡，合计每秒 ${fmtBig(foodRateOf(s, i) * (total ? mul : Pet.baseMul()))} 卡 · 占总产出 ${share < 1 && share > 0 ? '不到 1' : Math.round(share)}%`;
  });
  $$('#petUps [data-up]').forEach(b => {
    const u = UPGRADES.find(x => x.id === b.dataset.up);
    b.disabled = Pet.upCost(u) > s.kcal;
  });
  const pts = Pet.prestigeGain();
  $('#petRunTotal').textContent = `本轮累计 ${fmtBig(s.runTotal)} 卡。`;
  const more = nextPointAt(s.runTotal) - s.runTotal;
  $('#petPrestigeGain').textContent = pts > 0
    ? `现在重开可获得 ${pts} 点胃口。再获得 ${fmtBig(more)} 卡可以多 1 点。`
    : `本轮累计达到 ${fmtBig(PRESTIGE_UNIT)} 卡后可以重开，还差 ${fmtBig(more)} 卡。`;
  $('#petPrestigeBtn').disabled = pts < 1;
  if (s.order) $('#petOrderLeft').textContent = `剩余 ${fmtSpan(Math.max(0, s.order.until - Date.now()))}。`;
}

function visibleFoods() {
  const s = Pet.s;
  let shown = 0;
  FOODS.forEach((f, i) => {
    if (!foodOpen(s, i)) return;
    if (s.foods[i] > 0 || i === 0 || s.foods[i - 1] > 0 || s.total >= f.cost / 2) shown = i + 1;
  });
  return shown;
}

function renderPetLists() {
  if (!pageVisible('pet')) return;
  const s = Pet.s;
  const n = visibleFoods();
  $('#petFoods').replaceChildren(...FOODS.slice(0, n).map((f, i) => {
    const row = el('div', 'food-row');
    row.dataset.food = i;
    const info = el('div', 'grow');
    info.append(el('div', 'name', f.name), el('div', 'meta food-own'), el('div', 'meta food-rate'));
    const b = el('button', 'food-buy');
    b.type = 'button';
    b.onclick = () => {
      const k = s.buy === 'max' ? Pet.maxBuy(i) : s.buy;
      if (Pet.buy(i, k)) {
        renderPetLists();
        renderPetNumbers();
      }
    };
    row.append(info, b);
    return row;
  }));
  const all = UPGRADES.filter(u => !s.ups.includes(u.id) && u.show(s)).map(u => {
    const g = Pet.upgradeGain(u);
    const perSec = g.rate ?? g.click;
    return { u, g, cost: Pet.upCost(u), value: perSec / Pet.upCost(u) };
  });
  all.sort(s.upSort === 'cost' ? (a, b) => a.cost - b.cost : (a, b) => b.value - a.value || a.cost - b.cost);
  const ups = all.slice(0, 12);
  $('#petUpsMore').hidden = all.length <= ups.length;
  $('#petUpsMore').textContent = `另有 ${all.length - ups.length} 项升级未显示。`;
  $$('#petUpSort .chip').forEach(b => b.classList.toggle('on', b.dataset.sort === (s.upSort || 'value')));
  $('#petUps').replaceChildren(...ups.map(({ u, g, cost }) => {
    const b = el('button', 'up-card');
    b.type = 'button';
    b.dataset.up = u.id;
    const effect = g.rate !== undefined ? `每秒 +${fmtBig(g.rate)} 卡` : `每口 +${fmtBig(g.click)} 卡`;
    b.append(el('span', 'name', u.name), el('span', 'meta', u.desc), el('span', 'up-gain', effect), el('span', 'up-cost', `${fmtBig(cost)} 卡`));
    b.onclick = () => {
      if (Pet.upgrade(u.id)) {
        renderPetLists();
        renderPetBonus();
        renderPetNumbers();
      }
    };
    return b;
  }));
  $('#petUpsEmpty').hidden = ups.length > 0;
  $('#petBuyAll').disabled = !all.length;
  $$('#petBuy button').forEach(b => b.classList.toggle('on', String(s.buy) === b.dataset.buy));
  renderPetAchv();
  renderPetPerks();
  renderPetSwap();
  renderPetMove();
  renderPetAuto();
}

const petMovePick = { id: '' };

function renderPetMove() {
  const s = Pet.s;
  const city = cityOf(s);
  const days = Math.max(0, daysBetween(s.cityStart || Date.now(), Date.now()));
  $('#petCity').replaceChildren(el('b', '', `当前城市：${city.name}`), el('div', 'hint', `${city.rule} 已住 ${days} 天，搬过 ${s.moves || 0} 次家。`));
  const spent = SKILLS.filter(k => hasSkill(s, k.id)).reduce((a, k) => a + k.cost, 0);
  const free = (s.insight || 0) - spent;
  $('#petInsight').textContent = `见识 ${s.insight || 0} 点，可用 ${free} 点。每点见识使产出 +${INSIGHT_BONUS * 100}%，花掉也不减少。`;
  $('#petSkills').replaceChildren(...BRANCHES.map(b => {
    const col = el('div', 'skill-col');
    col.append(el('div', 'skill-branch', b));
    SKILLS.filter(k => k.branch === b).forEach(k => {
      const owned = hasSkill(s, k.id);
      const locked = k.req && !hasSkill(s, k.req);
      const btn = el('button', `up-card skill${owned ? ' owned' : ''}`);
      btn.type = 'button';
      btn.disabled = owned || locked || free < k.cost;
      const req = locked ? `需要先学“${SKILLS.find(x => x.id === k.req).name}”` : '';
      btn.append(el('span', 'name', k.name), el('span', 'meta', k.desc), el('span', 'up-cost', owned ? '已学会' : req || `${k.cost} 点见识`));
      btn.onclick = () => {
        if (Pet.buySkill(k.id)) renderPetPage();
      };
      col.append(btn);
    });
    return col;
  }));
  const ap = albumPoints(s);
  const g = Pet.insightGain();
  $('#petMoveInfo').textContent = g > 0
    ? `相册共 ${ap} 点胃口，现在搬家可获得 ${g} 点见识。相册达到 ${Math.ceil(nextInsightAt(ap))} 点时可以多 1 点。`
    : `相册共 ${ap} 点胃口，达到 ${MOVE_UNIT} 点后可以搬家。`;
  if (!petMovePick.id || petMovePick.id === s.city) petMovePick.id = CITIES.find(c => c.id !== s.city && c.id !== 'home').id;
  $('#petCities').replaceChildren(...CITIES.filter(c => c.id !== 'home').map(c => {
    const cur = c.id === s.city;
    const b = el('button', `species${petMovePick.id === c.id ? ' on' : ''}${cur ? ' current' : ''}`);
    b.type = 'button';
    b.disabled = cur;
    b.append(el('span', 'name', c.name), el('span', 'meta', c.rule));
    if (cur) b.append(el('span', 'up-cost', '当前'));
    b.onclick = () => {
      petMovePick.id = c.id;
      renderPetMove();
    };
    return b;
  }));
  $('#petMoveBtn').disabled = g < 1;
  const log = $('#petMoves');
  log.hidden = !(s.moveLog || []).length;
  log.replaceChildren(el('li', 'album-title', `搬家记录 · ${s.moveLog.length} 次`), ...[...s.moveLog].reverse().map(m => {
    const li = el('li');
    const c = CITIES.find(x => x.id === m.city) || CITIES[0];
    li.append(el('span', 'grow', c.name), el('span', 'meta', `${dayKey(new Date(m.from))} 至 ${dayKey(new Date(m.to))}，相册 ${m.album} 只、${m.points} 点胃口，获得 ${m.insight} 点见识`));
    return li;
  }));
}

const KEEPS = [[0, '不保留'], [0.1, '保留 10%'], [0.25, '保留 25%'], [0.5, '保留 50%']];
const RATIOS = [[0.25, '胃口增加 25% 时'], [0.5, '胃口增加 50% 时'], [1, '胃口翻倍时'], [2, '胃口变成 3 倍时']];

function renderPetAuto() {
  const s = Pet.s;
  const any = ['a1', 'a2', 'a3', 'a4'].some(id => hasSkill(s, id));
  $('#petAuto').hidden = !any;
  if (!any) return;
  $$('#petAuto [data-skill]').forEach(e => { e.hidden = !hasSkill(s, e.dataset.skill); });
  $$('#petAuto [data-auto]').forEach(c => { c.checked = !!s.auto[c.dataset.auto]; });
  const keep = $('#petAutoKeep');
  keep.replaceChildren(...KEEPS.map(([v, t]) => new Option(t, v)));
  keep.value = s.auto.keep;
  const ratio = $('#petAutoRatio');
  ratio.replaceChildren(...RATIOS.map(([v, t]) => new Option(t, v)));
  ratio.value = s.auto.ratio;
  $('#petAutoLog').replaceChildren(...(s.autoLog || []).slice(0, 5).map(l => {
    const d = new Date(l.at);
    return el('li', '', `${pad(d.getHours())}:${pad(d.getMinutes())} ${l.text}`);
  }));
}

const petSwapPick = { id: '' };

function renderPetSwap() {
  const s = Pet.s;
  const need = Pet.swapNeed();
  const can = Pet.canSwap();
  $('#petSwapInfo').textContent = can
    ? `当前宠物：${petLabel(s.name, speciesOf(s))}。胃口 ${s.points} 点，已达到要求的 ${need} 点，可以换宠物。`
    : `当前宠物：${petLabel(s.name, speciesOf(s))}。胃口 ${s.points} / ${need} 点，达到后可以换宠物。`;
  if (!petSwapPick.id || petSwapPick.id === s.species) petSwapPick.id = SPECIES.find(x => x.id !== s.species).id;
  $('#petSpecies').replaceChildren(...SPECIES.map(sp => {
    const cur = sp.id === (s.species || 'normal');
    const b = el('button', `species${petSwapPick.id === sp.id ? ' on' : ''}${cur ? ' current' : ''}`);
    b.type = 'button';
    b.disabled = cur;
    b.style.setProperty('--pet-color', sp.color || 'var(--accent)');
    const dot = el('span', 'species-dot');
    b.append(dot, el('span', 'name', sp.name), el('span', 'meta', sp.trait));
    if (cur) b.append(el('span', 'up-cost', '当前'));
    b.onclick = () => {
      petSwapPick.id = sp.id;
      renderPetSwap();
    };
    return b;
  }));
  $('#petSwapBtn').disabled = !can;
  const album = $('#petAlbum');
  album.hidden = !s.album.length;
  album.replaceChildren(el('li', 'album-title', `相册 · ${s.album.length} 只 · 共 ${albumPoints(s)} 点胃口，产出 ×${albumMulOf(s).toFixed(2)}`), ...[...s.album].reverse().map(a => {
    const li = el('li');
    const sp = SPECIES.find(x => x.id === a.species) || SPECIES[0];
    li.append(el('span', 'grow', petLabel(a.name, sp)), el('span', 'meta', `${dayKey(new Date(a.from))} 至 ${dayKey(new Date(a.to))}，重开 ${a.runs} 次，${a.points} 点胃口，共 ${fmtBig(a.total)} 卡`));
    return li;
  }));
}

function renderPetOrder() {
  const s = Pet.s;
  const box = $('#petOrder');
  box.replaceChildren();
  if (!s.order) {
    const wait = s.orderNext > Date.now() ? `下一个订单约 ${fmtSpan(s.orderNext - Date.now())}后出现。` : '暂时没有订单。菜单里没有可选的项时不会出现订单。';
    box.append(el('div', 'hint', `${s.name}现在没有想吃的。${wait}已完成 ${s.ordersDone} 个订单。`));
    return;
  }
  const title = el('div', 'order-title');
  title.append(`${s.name}想吃：`, el('b', '', s.order.name));
  const info = el('div', 'hint', `在主页真实地吃一次并记录（记录时间与吃饭时间相差不超过 2 小时），可获得 ${fmtBig(Pet.orderReward())} 卡，相当于 1 小时产出${s.perks.includes('order') ? '的 2 倍' : ''}。不占每天 3 次的真实饭奖励。`);
  const left = el('div', 'hint');
  left.id = 'petOrderLeft';
  left.textContent = `剩余 ${fmtSpan(Math.max(0, s.order.until - Date.now()))}。`;
  const row = el('div', 'row');
  const no = el('button', '', '不想吃这个');
  no.type = 'button';
  no.onclick = () => {
    Pet.declineOrder();
    renderPetOrder();
  };
  row.append(no);
  box.append(title, info, left, row);
}

function renderPetPerks() {
  const s = Pet.s;
  const free = s.points - s.spent;
  const allOwned = PERKS.every(p => s.perks.includes(p.id));
  $('#petPerks').hidden = allOwned;
  $('#petPoints').textContent = allOwned
    ? `胃口 ${s.points} 点。每点胃口使产出 +${POINT_BONUS * 100}%。天赋已全部买齐。已重开 ${s.runs} 次。`
    : `胃口 ${s.points} 点，可用 ${free} 点。每点胃口使产出 +${POINT_BONUS * 100}%，花掉也不减少。已重开 ${s.runs} 次。`;
  $('#petPerks').replaceChildren(...PERKS.map(p => {
    const owned = s.perks.includes(p.id);
    const b = el('button', owned ? 'up-card owned' : 'up-card');
    b.type = 'button';
    b.disabled = owned || free < p.cost;
    b.append(el('span', 'name', p.name), el('span', 'meta', p.desc), el('span', 'up-cost', owned ? '已拥有' : `${p.cost} 点胃口`));
    b.onclick = () => {
      if (Pet.buyPerk(p.id)) renderPetPage();
    };
    return b;
  }));
}


function renderPetAchv() {
  const s = Pet.s;
  const coll = Pet.env().coll;
  const groupStarted = g => PET_ACHV.some(d => d.group === g && s.achv[d.id]);
  const shownDefs = PET_ACHV.filter(d => (!d.hidden || s.achv[d.id]) && (layerOpen(s, LAYER_GROUPS[d.group]) || groupStarted(d.group)));
  const done = shownDefs.filter(d => s.achv[d.id]).length;
  $('#petAchvCount').textContent = `已解锁 ${done} / ${shownDefs.length}`;
  $('#petAchvSum').textContent = `${done} / ${shownDefs.length}`;
  const list = $('#petAchv');
  list.replaceChildren();
  let grid = null, group = null;
  const groups = [...new Set(shownDefs.map(d => d.group))];
  for (const d of groups.flatMap(g => shownDefs.filter(x => x.group === g))) {
    if (d.group !== group) {
      group = d.group;
      grid = el('div', 'achv-grid');
      list.append(el('h3', '', group), grid);
    }
    const at = s.achv[d.id];
    const v = Math.min(d.value(s, coll), d.goal);
    const card = el('div', at ? 'achv done' : 'achv');
    const badge = el('div', 'badge');
    badge.innerHTML = ICONS[d.icon];
    const info = el('div', 'info');
    const track = el('div', 'bar-track');
    const fill = el('div', 'bar-fill');
    fill.style.width = `${(at ? 1 : v / d.goal) * 100}%`;
    track.append(fill);
    info.append(el('div', 'name', d.name), el('div', 'desc', d.desc), track,
      el('div', 'meta', at ? `达成于 ${dayKey(new Date(at))}` : `${d.fmt(v)} / ${d.fmt(d.goal)}`));
    if (d.id === 'pair-all') info.append(pairTable(s));
    card.append(badge, info);
    grid.append(card);
  }
}

function pairTable(s) {
  const t = el('table', 'pair-table');
  const head = el('tr');
  head.append(el('th', ''));
  CITIES.forEach(c => {
    const th = el('th', '', c.name.slice(0, 1));
    th.title = c.name;
    head.append(th);
  });
  t.append(head);
  SPECIES.forEach(sp => {
    const tr = el('tr');
    tr.append(el('th', 'row-head', sp.name));
    CITIES.forEach(c => {
      const done = !!(s.cityPets || {})[`${c.id}|${sp.id}`];
      const td = el('td', done ? 'on' : '');
      td.title = `${sp.name} · ${c.name}${done ? '：住过' : '：还没住过'}`;
      td.setAttribute('aria-label', td.title);
      tr.append(td);
    });
    t.append(tr);
  });
  return t;
}

function renderPetBonus() {
  const e = Pet.env();
  const peak = Pet.isPeak();
  const rows = [...e.parts.filter(p => Pet.layerOpen(p.layer)), {
    name: '饭点',
    mul: peak ? 2 : 1,
    note: e.peaks.length
      ? `你最常在 ${e.peaks.map(h => `${h} 时`).join('、')}吃饭。${peak ? '现在是饭点。' : '现在不是饭点。'}这些钟点产出 ×2，离线时不计算。`
      : '记录满 5 顿后，根据最常吃饭的钟点确定饭点。',
  }];
  const total = rows.reduce((a, r) => a * r.mul, 1);
  $('#petBonusTotal').textContent = `×${total.toFixed(2)}`;
  $('#petBonus').replaceChildren(...rows.map(r => {
    const li = el('li');
    const head = el('div', 'rank-head');
    head.append(el('span', 'name grow', r.name), el('span', 'mul', `×${r.mul.toFixed(2)}`));
    li.append(head, el('div', 'meta', r.note));
    return li;
  }));
}

let petHour = -1;

function renderPetLayers() {
  $$('#petPage [data-layer]').forEach(e => { e.hidden = !Pet.layerOpen(e.dataset.layer); });
}

function renderPetPage() {
  renderPetLayers();
  $$('#petNumFmt [data-fmt]').forEach(b => {
    const on = b.dataset.fmt === (Pet.s.numFormat || 'cn');
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on);
  });
  Pet.syncMeals(true);
  Pet.enter();
  petHour = new Date().getHours();
  renderPetHead();
  renderPetOrder();
  renderPetBonus();
  renderPetLists();
  renderPetNumbers();
  const note = Pet.s.note;
  $('#petNote').hidden = !note;
  $('#petNoteText').textContent = note;
}

function bindPet() {
  Pet.syncMeals(true);
  $('#petFeed').onclick = () => {
    Pet.feed();
    const art = $('#petArt');
    art.classList.remove('chomp');
    void art.offsetWidth;
    art.classList.add('chomp');
    renderPetNumbers();
  };
  $('#petArt').onclick = () => $('#petFeed').click();
  $('#petName').onclick = async () => {
    const name = await petAsk({ title: '给宠物改名', text: '最多 12 个字。', ok: '改名', input: Pet.s.name });
    if (name !== null) {
      Pet.rename(name);
      renderPetHead();
    }
  };
  $('#petMiniFeed').onclick = () => $('#petFeed').click();
  $$('#petNumFmt [data-fmt]').forEach(b => {
    b.onclick = () => {
      Pet.setNumFormat(b.dataset.fmt);
      renderPetPage();
    };
  });
  $('#petResetBtn').onclick = async () => {
    const ok = await petAsk({
      title: '重置宠物',
      text: '清空宠物的所有进度，包括热量、食物、升级、胃口、相册、见识、技能和宠物成就。吃饭记录和主页的统计不受影响。无法撤销。',
      ok: '重置',
      danger: true,
    });
    if (!ok) return;
    Pet.reset();
    renderPetPage();
    notify('宠物已重置');
  };
  const io = new IntersectionObserver(([e]) => {
    $('#petMini').hidden = e.isIntersecting;
    $('#petAchvCount').hidden = !e.isIntersecting;
  }, { root: $('#petPage'), rootMargin: '-60px 0px 0px 0px' });
  io.observe($('.pet-kcal'));
  $$('#petBuy button').forEach(b => {
    b.onclick = () => {
      Pet.s.buy = b.dataset.buy === 'max' ? 'max' : Number(b.dataset.buy);
      renderPetLists();
      renderPetNumbers();
    };
  });
  $$('#petUpSort .chip').forEach(b => {
    b.onclick = () => {
      Pet.s.upSort = b.dataset.sort;
      renderPetLists();
      renderPetNumbers();
    };
  });
  $('#petBuyAll').onclick = () => {
    const n = Pet.buyAllUpgrades();
    notify(n ? `买了 ${n} 项升级` : '没有买得起的升级');
    renderPetLists();
    renderPetBonus();
    renderPetNumbers();
  };
  $$('#petAuto [data-auto]').forEach(c => {
    c.onchange = () => Pet.setAuto(c.dataset.auto, c.checked);
  });
  $('#petAutoKeep').onchange = e => Pet.setAuto('keep', Number(e.target.value));
  $('#petAutoRatio').onchange = e => Pet.setAuto('ratio', Number(e.target.value));
  $('#petMoveBtn').onclick = async () => {
    const c = CITIES.find(x => x.id === petMovePick.id);
    const g = Pet.insightGain();
    if (!c || g < 1) return;
    if (!await petAsk({ title: `搬到${c.name}`, text: `获得 ${g} 点见识。热量、食物、升级、胃口、天赋和相册会清零。`, ok: '搬家' })) return;
    Pet.move(c.id);
    renderPetPage();
  };
  $('#petSwapBtn').onclick = async () => {
    const sp = SPECIES.find(x => x.id === petSwapPick.id);
    if (!sp || !Pet.canSwap()) return;
    const name = $('#petSwapName').value;
    if (!await petAsk({ title: `换成${sp.name}`, text: `当前宠物${Pet.s.name}会进入相册。热量、食物、升级、胃口和天赋清零。`, ok: '换宠物' })) return;
    Pet.swap(sp.id, name);
    $('#petSwapName').value = '';
    renderPetPage();
  };
  $('#petPrestigeBtn').onclick = async () => {
    const pts = Pet.prestigeGain();
    if (pts < 1) return;
    if (!await petAsk({ title: '重开', text: `获得 ${pts} 点胃口。热量、食物和升级清零，等级、经验、成就、图鉴和订单记录保留。`, ok: '重开' })) return;
    Pet.prestige();
    renderPetPage();
  };
  $('#petNoteClose').onclick = () => {
    Pet.s.note = '';
    $('#petNote').hidden = true;
  };
}

pages.pet = { el: '#petPage', render: renderPetPage, leave: () => Pet.leave() };
