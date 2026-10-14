const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const PREFIX = 'ew.';

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(PREFIX + k);
      return v === null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
    } catch {}
  },
  all() {
    const out = {};
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k));
      }
    } catch {}
    return out;
  },
  clear() {
    try {
      Object.keys(store.all()).forEach(k => localStorage.removeItem(PREFIX + k));
    } catch {}
  },
};

const settings = {
  theme: store.get('theme', matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'),
  mode: store.get('mode', 'fresh'),
  avoid: store.get('avoid', 0),
  anim: store.get('anim', true),
  sort: store.get('sort', 'stale'),
  scope: store.get('scope', 'all'),
  smart: store.get('smart', true),
  speed: store.get('speed', 1),
};

const setSetting = (key, value) => {
  settings[key] = value;
  store.set(key, value);
};

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = k => {
  const [y, m, d] = k.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY;
};
const daysBetween = (a, b) => dayNum(dayKey(new Date(b))) - dayNum(dayKey(new Date(a)));
const fmtNum = n => Math.floor(n).toLocaleString('zh-CN');
const fmtTime = t => {
  const d = new Date(t);
  return `${dayKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const fmtAgo = t => {
  if (!t) return '从没吃过';
  const n = daysBetween(t, Date.now());
  if (n <= 0) return '今天';
  if (n === 1) return '昨天';
  if (n === 2) return '前天';
  if (n < 30) return `${n} 天前`;
  if (n < 365) return `${Math.floor(n / 30)} 个月前`;
  return `${+(n / 365).toFixed(1)} 年前`;
};
const meal = t => {
  const h = new Date(t).getHours();
  return h < 5 ? '夜宵' : h < 10 ? '早餐' : h < 15 ? '午餐' : h < 17 ? '下午茶' : h < 21 ? '晚餐' : '夜宵';
};

function bindCheck(id, key, onChange) {
  const input = $('#' + id);
  input.checked = settings[key];
  input.onchange = () => {
    setSetting(key, input.checked);
    onChange?.();
  };
}

function bindSelect(id, key, options, onChange) {
  const sel = $('#' + id);
  sel.replaceChildren(...options.map(([v, name]) => new Option(name, v)));
  sel.value = options.some(([v]) => v === settings[key]) ? settings[key] : options[0][0];
  sel.onchange = () => {
    const v = options.find(([v]) => String(v) === sel.value)[0];
    setSetting(key, v);
    onChange?.();
  };
}

function bindFolds() {
  $$('details[data-fold]').forEach(d => {
    const key = 'fold.' + d.dataset.fold;
    d.open = store.get(key, d.open);
    d.ontoggle = () => store.set(key, d.open);
  });
}

function msg(id, text, err = false) {
  const m = $('#' + id);
  m.textContent = text;
  m.classList.toggle('err', err);
}

const pages = {};
let pageOpenedHere = false;

function openPage(name) {
  if (location.hash === '#' + name) return;
  if (document.body.classList.contains('page-open')) {
    location.replace('#' + name);
  } else {
    pageOpenedHere = true;
    location.hash = name;
  }
}

function closePage() {
  if (pageOpenedHere) {
    history.back();
  } else {
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }
}

function route() {
  const name = location.hash.slice(1);
  let shown = false;
  for (const [key, page] of Object.entries(pages)) {
    const on = key === name;
    const was = !$(page.el).hidden;
    $(page.el).hidden = !on;
    if (was && !on) page.leave?.();
    if (on) {
      shown = true;
      page.render?.(true);
    }
  }
  if (!shown) pageOpenedHere = false;
  document.body.classList.toggle('page-open', shown);
}

const pageVisible = name => pages[name] && !$(pages[name].el).hidden;

addEventListener('hashchange', route);
addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.body.classList.contains('page-open') && !document.querySelector('dialog[open]')) closePage();
});
document.addEventListener('click', e => {
  const open = e.target.closest('[data-page]');
  if (open) openPage(open.dataset.page);
  else if (e.target.closest('[data-close]')) closePage();
});

function notify(text, action, onAction) {
  const t = el('div', 'toast note');
  t.append(el('div', 'grow', text));
  if (action) {
    const b = el('button', 'link', action);
    b.type = 'button';
    b.onclick = e => {
      e.stopPropagation();
      onAction();
      dismiss();
    };
    t.append(b);
  }
  const dismiss = () => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  };
  t.onclick = dismiss;
  pushToast(t);
  setTimeout(dismiss, 4000);
}

function pushToast(t) {
  const box = $('#toasts');
  box.append(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
}
