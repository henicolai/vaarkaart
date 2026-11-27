// VaarKaart Service Worker
// Altijd eerst het netwerk (zodat updates meteen zichtbaar zijn); alleen zonder verbinding uit de cache.
const CACHE = 'vaarkaart-v1';
const SCHIL = ['./', './index.html', './enc.js', './ais.js', './handleiding.html', './icon-192.png', './icon-512.png', './app.webmanifest'];
const CDN = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SCHIL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Bibliotheken (Leaflet e.d.) hebben een vast versienummer: cache eerst
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      if (res.ok) { const k = res.clone(); caches.open(CACHE).then(c => c.put(req, k)); }
      return res;
    })));
    return;
  }
  if (url.origin !== location.origin) return;
  // Grote kaartbestanden niet in deze cache (die regelt de browser zelf)
  if (/\/(enc|kaarten)\//.test(url.pathname) && !/index\.json$|manifest\.json$/.test(url.pathname)) return;
  const appBestand = req.mode === 'navigate' || /\.(html|js|webmanifest|png)$/.test(url.pathname) || /\/data\/.*\.json$/.test(url.pathname) || /(enc\/index|kaarten\/manifest)\.json$/.test(url.pathname);
  if (!appBestand) return;
  const sleutel = req.mode === 'navigate' ? './index.html' : url.origin + url.pathname;
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const k = res.clone(); caches.open(CACHE).then(c => c.put(sleutel, k)); }
    return res;
  }).catch(() => caches.match(sleutel).then(r => r || caches.match(req))));
});
