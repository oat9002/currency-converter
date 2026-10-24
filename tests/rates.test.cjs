const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-fixture.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const today = new Date().toISOString().slice(0, 10);

test('expired saved rates still convert offline without resetting their source date or fetch timestamp', async () => {
  const timestamp = Date.parse('2020-01-01T12:00:00Z');
  const { context, element, state } = loadApp({
    navigator: { onLine: false, languages: ['en'] }, fetch: async () => { throw new Error('offline'); }
  }, { selectedCurrency: 'vnd', rates: { vnd: 750 }, ratesDate: '2020-01-01', ratesTimestamp: timestamp });
  await tick();
  element('thb').value = '100';
  element('thb').listeners.input();
  assert.equal(element('second-currency').value, '75000');
  assert.equal(state().ratesTimestamp, timestamp);
  assert.equal(state().ratesDate, '2020-01-01');
  assert.match(element('rates-status').textContent, /2020.*Saved rates.*May be outdated.*Offline/);
  assert.equal(context.getSelectedRate('vnd'), 750);
});

test('a recent fetch of old data still shows its actual source date and stale warning', async () => {
  const { element, state } = loadApp({ fetch: async (_, options) => {
    assert.equal(options.cache, 'no-store');
    return { ok: true, json: async () => ({ date: '2020-01-01', thb: { vnd: 750 } }) };
  } });
  await tick();
  assert.equal(state().ratesDate, '2020-01-01');
  assert.match(element('rates-status').textContent, /2020.*May be outdated/);
  assert.doesNotMatch(element('rates-status').textContent, /Saved rates/);
});

test('legacy caches with no source date do not claim a known source date', () => {
  const { element } = loadApp({}, { selectedCurrency: 'vnd', rates: { vnd: 750 }, ratesTimestamp: Date.now() });
  assert.match(element('rates-status').textContent, /Source date unavailable.*Saved rates/);
});

test('missing rates show a useful failure state rather than staying in loading state', async () => {
  const { element } = loadApp({ fetch: async () => { throw new Error('network down'); } });
  await tick();
  assert.match(element('rates-status').textContent, /Rates unavailable.*Refresh failed/);
  assert.doesNotMatch(element('rates-status').textContent, /Loading/);
});

test('reconnecting refreshes saved rates and clears cache/offline indicators', async () => {
  let connected = false;
  const navigator = { onLine: false, languages: ['en'] };
  const { element, state, windowListeners } = loadApp({ navigator, fetch: async () => {
    if (!connected) throw new Error('offline');
    return { ok: true, json: async () => ({ date: today, thb: { vnd: 800 } }) };
  } }, { selectedCurrency: 'vnd', rates: { vnd: 750 }, ratesDate: '2020-01-01' });
  await tick();
  connected = navigator.onLine = true;
  await windowListeners.online();
  assert.equal(state().rates.vnd, 800);
  assert.equal(state().ratesDate, today);
  assert.doesNotMatch(element('rates-status').textContent, /Offline|Saved rates|Refresh failed|May be outdated/);
});

test('date validation rejects impossible calendar dates', () => {
  const { context } = loadApp();
  assert.equal(context.validRateDate('2026-02-30'), null);
  assert.equal(context.validRateDate('not-a-date'), null);
  assert.equal(context.validRateDate('2024-02-29'), '2024-02-29');
});
