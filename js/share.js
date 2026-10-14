const share = { blob: null, url: '', name: '' };
const SITE_URL = 'https://cyberzhg.github.io/EatWhat/';

function canvasKit(W, H) {
  const css = getComputedStyle(document.documentElement);
  const color = n => css.getPropertyValue(n).trim();
  const cv = el('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const font = (size, weight = 400) => `${weight} ${size}px system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  const text = (s, x, y, size, fill, weight, align = 'left') => {
    g.font = font(size, weight);
    g.fillStyle = fill;
    g.textAlign = align;
    g.fillText(s, x, y);
  };
  const box = (x, y, w, h, r, fill, stroke) => {
    g.beginPath();
    g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h);
    if (fill) {
      g.fillStyle = fill;
      g.fill();
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = 2;
      g.stroke();
    }
  };
  const fit = (s, max, size, weight = 600) => {
    g.font = font(size, weight);
    if (g.measureText(s).width <= max) return s;
    while (s.length > 1 && g.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  };
  const C = {
    bg: color('--bg'), surface: color('--surface'), surface2: color('--surface2'), border: color('--border'),
    fg: color('--text'), muted: color('--muted'), accent: color('--accent'), onAccent: color('--on-accent'), star: color('--star'),
  };
  const footer = () => {
    g.fillStyle = C.border;
    g.fillRect(80, H - 92, W - 160, 2);
    text(SITE_URL, 80, H - 40, 28, C.accent, 600);
    text('EatWhat', W - 80, H - 40, 28, C.muted, 600, 'right');
  };
  const dice = (x, y, size, pips) => {
    box(x, y, size, size, size * 0.22, C.accent);
    g.fillStyle = C.onAccent;
    const at = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.28, .28], [.5, .5], [.72, .72]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]], 6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]] }[pips];
    at.forEach(([px, py]) => {
      g.beginPath();
      g.arc(x + px * size, y + py * size, size * 0.085, 0, Math.PI * 2);
      g.fill();
    });
  };
  return { cv, g, font, text, box, fit, C, footer, dice };
}

function wrapName(g, font, name, maxW) {
  for (let size = 168; size >= 72; size -= 8) {
    g.font = font(size, 800);
    if (g.measureText(name).width <= maxW) return { size, lines: [name] };
  }
  const size = 72;
  g.font = font(size, 800);
  const lines = [];
  let line = '';
  for (const ch of name) {
    if (g.measureText(line + ch).width > maxW && line) {
      lines.push(line);
      line = '';
    }
    line += ch;
  }
  if (line) lines.push(line);
  return { size, lines: lines.slice(0, 3) };
}

function drawStars(g, cx, y, size, avg, C) {
  const star = new Path2D('M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z');
  const gap = size * 0.25;
  const x0 = cx - (size * 5 + gap * 4) / 2;
  for (let k = 0; k < 5; k++) {
    const x = x0 + k * (size + gap);
    g.save();
    g.translate(x, y);
    g.scale(size / 24, size / 24);
    g.fillStyle = C.surface2;
    g.fill(star);
    const part = Math.max(0, Math.min(1, avg - k));
    if (part > 0) {
      g.beginPath();
      g.rect(0, 0, 24 * part, 24);
      g.clip();
      g.fillStyle = C.star;
      g.fill(star);
    }
    g.restore();
  }
}

function drawPickCard(id) {
  const W = 1080, H = 1080;
  const { cv, g, font, text, box, C, footer, dice } = canvasKit(W, H);
  const it = Data.get(id);
  const s = Data.stat(id);
  const now = new Date();

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.12;
  g.fillStyle = C.accent;
  g.beginPath();
  g.arc(W - 120, 160, 260, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(90, H - 260, 170, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;

  dice(80, 100, 96, 1 + Math.floor(Math.random() * 6));
  text('今天吃什么', 204, 150, 52, C.fg, 700);
  text(`${dayKey(now)} 周${WEEK[now.getDay()]} · ${meal(now)}`, 204, 196, 30, C.muted);

  const boxTop = 280, boxH = 620;
  box(80, boxTop, W - 160, boxH, 40, C.surface, C.border);
  const { size, lines } = wrapName(g, font, it.name, W - 260);
  const lh = size * 1.18;
  const mid = boxTop + boxH / 2 - (s.rN ? 40 : 0);
  const top = mid - (lines.length - 1) * lh / 2 + size * 0.35;
  lines.forEach((line, k) => text(line, W / 2, top + k * lh, size, C.accent, 800, 'center'));
  if (s.rN) {
    const y = top + (lines.length - 1) * lh + 70;
    drawStars(g, W / 2, y, 56, avgOf(s), C);
  }
  footer();
  return cv;
}

function drawAchvCard() {
  const { unlocked, DEFS } = Achv;
  const all = Achv.derive();
  const { scope, hist, s } = scopedStats();
  const top = topItems(5, hist);
  const done = DEFS.filter(d => unlocked[d.id]).sort((a, b) => unlocked[b.id] - unlocked[a.id]);
  const W = 1080;
  const H = 680 + 30 + Math.max(top.length, 1) * 62 + 140 + Math.ceil(Math.min(done.length, 6) / 2) * 92 + 50 + 20 + 7 * 23 + 150;
  const { cv, g, text, box, fit, C, footer, dice } = canvasKit(W, H);

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);
  dice(80, 92, 96, 5);
  text('我的干饭成就', 204, 150, 60, C.fg, 700);
  text(`${dayKey()} · ${scope === ALL ? '今天吃什么' : `分组：${Data.scopeName(scope)}`}`, 204, 196, 30, C.muted);

  const items = [
    ['总共吃了', `${fmtNum(s.meals)} 顿`],
    ['吃过种类', `${fmtNum(s.distinct)} 种`],
    ['最长连续', `${s.best} 天`],
    scope === ALL ? ['随机次数', `${fmtNum(all.spins)} 次`] : ['当前连续', `${s.current} 天`],
  ];
  items.forEach(([label, value], k) => {
    const x = 80 + (k % 2) * 480, y = 250 + Math.floor(k / 2) * 190;
    box(x, y, 440, 165, 24, C.surface, C.border);
    text(label, x + 36, y + 58, 30, C.muted);
    text(value, x + 36, y + 128, 54, C.fg, 700);
  });

  let y = 680;
  text('最常吃', 80, y, 36, C.fg, 700);
  y += 30;
  if (!top.length) {
    text('还没有记录，快去吃一顿吧', 80, y + 50, 30, C.muted);
    y += 90;
  }
  const max = Math.max(1, ...top.map(r => r.count));
  top.forEach((r, k) => {
    const yy = y + k * 62;
    text(String(k + 1), 96, yy + 42, 30, C.accent, 700, 'center');
    box(130, yy + 12, 600, 40, 12, C.surface);
    box(130, yy + 12, Math.max(24, 600 * r.count / max), 40, 12, C.accent);
    text(fit(r.name, 260, 30), 750, yy + 43, 30, C.fg, 600);
    text(`${r.count} 次`, W - 80, yy + 43, 28, C.muted, 400, 'right');
  });
  y += Math.max(top.length, 1) * 62 + 70;

  text(`已解锁 ${done.length} / ${DEFS.length} 个成就`, 80, y, 36, C.fg, 700);
  box(80, y + 24, 920, 16, 8, C.surface);
  if (done.length) box(80, y + 24, 920 * done.length / DEFS.length, 16, 8, C.accent);
  y += 70;
  done.slice(0, 6).forEach((d, k) => {
    const x = 80 + (k % 2) * 480, yy = y + Math.floor(k / 2) * 92;
    box(x, yy, 440, 76, 38, C.surface, C.border);
    box(x + 14, yy + 14, 48, 48, 24, C.accent);
    g.strokeStyle = C.onAccent;
    g.lineWidth = 5;
    g.lineCap = g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(x + 27, yy + 39);
    g.lineTo(x + 35, yy + 47);
    g.lineTo(x + 50, yy + 31);
    g.stroke();
    text(fit(d.name, 340, 30), x + 80, yy + 49, 30, C.fg, 600);
  });
  y += Math.ceil(Math.min(done.length, 6) / 2) * 92 + 50;

  text('近半年', 80, y, 28, C.muted);
  heatDays(26, s.daily).forEach((d, k) => {
    const x = 80 + Math.floor(k / 7) * 23, yy = y + 20 + (k % 7) * 23;
    if (d.future) return;
    const level = heatLevel(d.n);
    g.globalAlpha = level ? [0, 0.3, 0.5, 0.75, 1][level] : 1;
    box(x, yy, 18, 18, 4, level ? C.accent : C.surface);
    g.globalAlpha = 1;
  });
  footer();
  return cv;
}

async function openShare(kind, id) {
  const cv = kind === 'pick' ? drawPickCard(id) : drawAchvCard();
  share.name = kind === 'pick' ? `今天吃什么-${dayKey()}.png` : `干饭成就-${dayKey()}.png`;
  share.blob = await new Promise(r => cv.toBlob(r, 'image/png'));
  URL.revokeObjectURL(share.url);
  share.url = URL.createObjectURL(share.blob);
  $('#shareImg').src = share.url;
  const file = new File([share.blob], share.name, { type: 'image/png' });
  $('#shareSend').hidden = !navigator.canShare?.({ files: [file] });
  $('#shareDlg').showModal();
  Achv.shared();
}

function bindShare() {
  $('#shareBtn').onclick = () => openShare('achv');
  $('#shareClose').onclick = () => $('#shareDlg').close();
  $('#shareSave').onclick = () => {
    const a = el('a');
    a.href = share.url;
    a.download = share.name;
    a.click();
  };
  $('#shareSend').onclick = async () => {
    try {
      await navigator.share({ files: [new File([share.blob], share.name, { type: 'image/png' })], title: '今天吃什么' });
    } catch {}
  };
}
