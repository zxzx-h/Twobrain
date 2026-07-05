const CACHE_NAME = 'twobrain-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/reminder.js',
  './manifest.json'
];

// Install: cache all app shell assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first strategy for app shell, network-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // For app shell assets, use cache-first
  if (ASSETS.some(a => url.pathname.endsWith(a.replace('./', '')))) {
    event.respondWith(
      caches.match(event.request).then(
        cached => cached || fetch(event.request)
      )
    );
    return;
  }

  // For everything else, try network then fall back to cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache =>
          cache.put(event.request, clone)
        );
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
