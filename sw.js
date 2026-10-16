const CACHE = 'eatwhat-v28';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/base.css',
  'css/pages.css',
  'icons/icon.svg',
  'icons/favicon.svg',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  ...['core', 'icons', 'data', 'achievements', 'picker', 'groups', 'list', 'editor', 'history', 'ratings', 'dishes', 'achv-page', 'qr', 'sync', 'pet-data', 'pet', 'pet-ui', 'share', 'settings', 'main'].map(n => `js/${n}.js`),
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => {
        if (r.ok) {
          const copy = r.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(e.request, copy)));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
