// VaarKaart Service Worker — opruimversie
// De oude versie bewaarde index.html in de cache, waardoor nieuwe versies niet zichtbaar werden.
// Deze versie wist die cache en schakelt zichzelf uit.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(c => c.navigate(c.url));
  })());
});
