const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(caches) {
  const listeners = {};
  vm.runInNewContext(fs.readFileSync('sw.js', 'utf8'), {
    caches, self: { addEventListener(type, callback) { listeners[type] = callback; },
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
  let urls;
  const handlers = loadWorker({ open: async () => ({ addAll: async values => { urls = values; } }) });
  let complete;
  handlers.install({ waitUntil: promise => { complete = promise; } });
  await complete;
  assert.ok(urls.includes('/ocr-worker.js'));
  assert.ok(urls.includes('/script.js'));
});
