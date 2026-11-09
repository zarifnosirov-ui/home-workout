// Кэширует приложение, чтобы оно открывалось мгновенно и работало без интернета.
// Данные (тренировки, замеры) хранятся отдельно на телефоне (localStorage).
const CACHE = 'mt-v1';
const SHELL = ['./', 'index.html', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('mt-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Сначала сеть (чтобы приходили обновления), без сети — из кэша.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
