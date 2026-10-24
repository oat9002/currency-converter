const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(caches, fetch = async () => { throw new Error('offline'); }) {
  const listeners = {};
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    caches, URL, Request, fetch, console: { warn() {} }, self: { location: { origin: 'https://converter.test' }, addEventListener(type, callback) { listeners[type] = callback; },
      skipWaiting: async () => {}, clients: { claim: async () => {} } }
  });
  return listeners;
}

test('fresh service-worker context preserves current cache and only deletes this app old caches', async () => {
  const deleted = [];
  const version = JSON.parse(fs.readFileSync('version.json', 'utf8')).version;
  const current = 'currency-converter-v' + version;
  const handlers = loadWorker({
    keys: async () => [current, 'currency-converter-v1.0.15', 'another-app'],
    delete: async name => { deleted.push(name); }
  });
  let complete;
  handlers.activate({ waitUntil: promise => { complete = promise; } });
  await complete;
  assert.deepEqual(deleted, ['currency-converter-v1.0.15']);
});

test('offline installation caches OCR worker alongside the converter', async () => {
  let requests;
  const handlers = loadWorker({ open: async () => ({ addAll: async values => { requests = values; } }) });
  let complete;
  handlers.install({ waitUntil: promise => { complete = promise; } });
  await complete;
  const urls = requests.map(request => new URL(request.url).pathname);
  assert.ok(requests.every(request => request.cache === 'reload'), 'installation must bypass old HTTP-cached files');
  assert.ok(urls.includes('/ocr-worker.js'));
  assert.ok(urls.includes('/script.js'));
  for (const dependency of ['/app-config.js', '/translations.js', '/i18n.js']) {
    assert.ok(urls.includes(dependency), dependency + ' must be available offline');
  }
});

test('exchange-rate requests bypass service-worker cache fallbacks', () => {
  const handlers = loadWorker({});
  let intercepted = false;
  handlers.fetch({ request: { method: 'GET', mode: 'cors', url: 'https://latest.currency-api.pages.dev/v1/currencies/thb.json' },
    respondWith() { intercepted = true; } });
  assert.equal(intercepted, false);
});

function cacheFixture(initial = {}) {
  const key = input => new URL(input.url || input, 'https://converter.test').href;
  const files = new Map(Object.entries(initial).map(([url, text]) => [key(url), new Response(text)]));
  return { files, key,
    open: async () => ({
      match: async input => files.get(key(input))?.clone(),
      put: async (input, response) => { files.set(key(input), response.clone()); }
    })
  };
}

function intercept(handlers, path, navigation = false) {
  const request = new Request(new URL(path, 'https://converter.test'));
  if (navigation) Object.defineProperty(request, 'mode', { value: 'navigate' });
  let response;
  handlers.fetch({ request, respondWith(promise) { response = promise; } });
  return response;
}

test('online navigation serves current HTML even when an old page is already cached', async () => {
  const cache = cacheFixture({ '/index.html': 'old app' });
  const handlers = loadWorker(cache, async request => {
    assert.equal(request.cache, 'no-cache');
    return new Response('new app');
  });
  const response = await intercept(handlers, '/', true);
  assert.equal(await response.text(), 'new app');
  assert.equal(await cache.files.get(cache.key('/index.html')).text(), 'new app');
});

test('unversioned JavaScript and CSS are refreshed instead of being pinned to cached copies', async () => {
  for (const path of ['/script.js', '/tailwind.css', '/app-config.js', '/translations.js', '/i18n.js', '/ocr-worker.js']) {
    const cache = cacheFixture({ [path]: 'old asset' });
    const handlers = loadWorker(cache, async () => new Response('new asset'));
    assert.equal(await (await intercept(handlers, path)).text(), 'new asset', path);
  }
});

test('saved HTML and assets remain available offline', async () => {
  const cache = cacheFixture({ '/index.html': 'saved page', '/script.js': 'saved script' });
  const handlers = loadWorker(cache);
  assert.equal(await (await intercept(handlers, '/', true)).text(), 'saved page');
  assert.equal(await (await intercept(handlers, '/script.js')).text(), 'saved script');
});

test('version checks refresh the server value and share one saved cache entry', async () => {
  const cache = cacheFixture({ '/version.json': '{"version":"old"}' });
  const handlers = loadWorker(cache, async () => new Response('{"version":"new"}'));
  for (const query of ['123', '456']) {
    assert.equal((await (await intercept(handlers, '/version.json?t=' + query)).json()).version, 'new');
  }
  assert.equal(cache.files.size, 1);
});

test('cache write failure does not hide a successfully downloaded new app file', async () => {
  const cache = { open: async () => ({ put: async () => { throw new Error('quota full'); } }) };
  const handlers = loadWorker(cache, async () => new Response('new app'));
  assert.equal(await (await intercept(handlers, '/script.js')).text(), 'new app');
});

test('service-worker script requests bypass saved assets', async () => {
  const cache = cacheFixture({ '/sw.js': 'old worker' });
  const handlers = loadWorker(cache, async request => {
    assert.equal(request.cache, 'no-cache');
    return new Response('new worker');
  });
  assert.equal(await (await intercept(handlers, '/sw.js')).text(), 'new worker');
});
