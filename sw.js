const CACHE_VERSION_URL = '/version.json';
let CACHE_NAME = 'currency-converter'; // Default fallback

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/tailwind.css',
  '/script.js',
  '/sw.js',
  '/version.json'
];

// Fetch version on install and set cache name
self.addEventListener('install', event => {
  event.waitUntil(
    fetch(CACHE_VERSION_URL)
      .then(response => response.json())
      .then(data => {
        CACHE_NAME = 'currency-converter-v' + data.version;
        return caches.open(CACHE_NAME)
          .then(cache => cache.addAll(PRECACHE_URLS))
          .then(() => self.skipWaiting());
      })
      .catch(() => {
        // Fallback if version.json fetch fails
        return caches.open(CACHE_NAME)
          .then(cache => cache.addAll(PRECACHE_URLS))
          .then(() => self.skipWaiting());
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
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

  if (isApiRequest) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

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
