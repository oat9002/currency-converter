// Keep this stable across service-worker restarts; install-time globals are not persisted.
const CACHE_NAME = 'currency-converter-v1.0.22';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/tailwind.css',
  '/app-config.js',
  '/translations.js',
  '/i18n.js',
  '/script.js',
  '/ocr-worker.js',
  '/sw.js',
  '/version.json'
];

// Changing this worker also triggers delivery of updated cached application code.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('currency-converter')) {
            return caches.delete(cacheName);
          }
          return undefined;
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then(cachedResponse => cachedResponse || fetch(event.request).catch(() => caches.match('/index.html')))
    );
    return;
  }

  const isApiRequest = requestUrl.hostname.includes('currency-api.pages.dev');
  const isCrossOriginAsset = requestUrl.hostname.includes('cdn.jsdelivr.net') || requestUrl.hostname.includes('fonts.googleapis.com') || requestUrl.hostname.includes('fonts.gstatic.com');

  // The page owns dated rate caching. A service-worker fallback could make old
  // JSON look like a successful network refresh and reset its apparent age.
  if (isApiRequest) return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.ok && (event.request.url.startsWith(self.location.origin) || isCrossOriginAsset)) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
        return undefined;
      });
    })
  );
});
