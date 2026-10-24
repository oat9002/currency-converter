// Keep this stable across service-worker restarts; install-time globals are not persisted.
const CACHE_NAME = 'currency-converter-v1.0.24';

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
  '/version.json'
];
const APP_PATHS = new Set(PRECACHE_URLS);

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // A new release must not copy still-fresh files from the browser HTTP cache.
      .then(cache => cache.addAll(PRECACHE_URLS.map(path => new Request(
        new URL(path, self.location.origin), { cache: 'reload' }
      ))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => Promise.all(cacheNames.map(cacheName => {
      if (cacheName !== CACHE_NAME && cacheName.startsWith('currency-converter')) {
        return caches.delete(cacheName);
      }
      return undefined;
    }))).then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheKey, navigation = false) {
  try {
    const response = await fetch(new Request(request, { cache: 'no-cache' }));
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    try {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(cacheKey, response.clone());
    } catch (error) {
      // A storage failure must not replace a fresh response with an old one.
      console.warn('Unable to save app file for offline use:', error);
    }
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(cacheKey) || (navigation && await cache.match('/index.html'));
    if (cached) return cached;
    throw error;
  }
}

async function cachedExternalAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    try { await cache.put(request, response.clone()); } catch (error) { /* Keep the network result. */ }
  }
  return response;
}

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Leave rates to the page's dated local-storage cache.
  if (url.hostname === 'currency-api.pages.dev' || url.hostname.endsWith('.currency-api.pages.dev')) return;

  if (sameOrigin && url.pathname === '/sw.js') {
    event.respondWith(fetch(new Request(event.request, { cache: 'no-cache' })));
    return;
  }
  if (event.request.mode === 'navigate') {
    const key = url.pathname === '/' ? '/index.html' : event.request;
    event.respondWith(networkFirst(event.request, key, true));
    return;
  }
  if (sameOrigin && APP_PATHS.has(url.pathname)) {
    // Stable file names are revalidated online; saved copies are an offline fallback.
    // Ignore version-check query strings when storing to avoid unbounded cache keys.
    event.respondWith(networkFirst(event.request, url.pathname));
    return;
  }
  if (['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
    event.respondWith(cachedExternalAsset(event.request));
  }
});
