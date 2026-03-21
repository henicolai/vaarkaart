// VaarKaart Service Worker — v4.0
const CACHE = 'vaarkaart-v4';

// Bestanden die offline beschikbaar moeten zijn
const OFFLINE_FILES = [
  '/vaarkaart.html',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
];

// Installatie — cache offline bestanden
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => {
      return cache.addAll(OFFLINE_FILES).catch(err => {
        console.log('Cache gedeeltelijk mislukt:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activatie — verwijder oude caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — cache first voor app bestanden, network first voor kaart tiles en API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Kaart tiles en live API altijd van netwerk
  const liveUrls = [
    'tile.openstreetmap.org',
    'tiles.openseamap.org',
    'basemaps.cartocdn.com',
    'waterwebservices.rijkswaterstaat.nl',
    'waterinfo.rws.nl',
    'service.pdok.nl',
    'corsproxy.io',
    'allorigins.win',
  ];

  if (liveUrls.some(u => url.hostname.includes(u))) {
    // Network only voor live data
    event.respondWith(fetch(event.request).catch(() => new Response('Offline', { status: 503 })));
    return;
  }

  // Cache first voor app bestanden
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Sla nieuwe bestanden op in cache
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback
      if (event.request.destination === 'document') {
        return caches.match('/vaarkaart.html');
      }
    })
  );
});
