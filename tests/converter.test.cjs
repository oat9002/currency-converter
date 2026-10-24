const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadApp } = require('./app-fixture.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('preserves entered amount through rate refresh and supports both conversion directions and zero', () => {
  const { context, element } = loadApp();
  assert.equal(element('currency-select').value, 'vnd');
  element('thb').value = '100';
  element('thb').listeners.input();
  context.applyRates({ vnd: 750.25 });
  assert.equal(element('second-currency').value, '75025');
  assert.equal(element('thb').value, '100');
  context.applyRates({ vnd: 800 });
  assert.equal(element('second-currency').value, '80000');
  element('second-currency').value = '40000';
  element('second-currency').listeners.input();
  assert.equal(element('thb').value, '50.00');
  context.applyRates({ vnd: 1000 });
  assert.equal(element('second-currency').value, '40000');
  assert.equal(element('thb').value, '40.00');
  element('second-currency').value = '0';
  element('second-currency').listeners.input();
  assert.equal(element('thb').value, '0.00');
});

test('partial or invalid rates do not prevent valid currencies working', async () => {
  const { context, element, state } = loadApp({ fetch: async () => ({ ok: true, json: async () => ({ thb: { vnd: 750, idr: -1, jpy: 'bad' } }) }) });
  await tick();
  assert.equal(context.getSelectedRate('vnd'), 750);
  assert.equal(context.getSelectedRate('idr'), null);
  assert.equal(context.getSelectedRate('jpy'), null);
  assert.equal(state().rates.vnd, 750);
  assert.match(element('thb-rate').textContent, /750.00 VND/);
});

test('selection change recalculates and persists selection', () => {
  const { context, element, state } = loadApp();
  context.applyRates({ vnd: 750, php: 1.5 });
  element('thb').value = '100';
  element('thb').listeners.input();
  element('currency-select').value = 'php';
  element('currency-select').listeners.change();
  assert.equal(element('second-currency').value, '150.00');
  assert.equal(state().selectedCurrency, 'php');
});

test('OCR Blob fallback delivers response and reuses the worker', async () => {
  const { context, element, workers } = loadApp();
  for (let i = 0; i < 2; i++) {
    const scan = context.runOCROnCanvas(element('camera-canvas'), 0);
    await tick();
    const worker = workers[0];
    assert.equal(worker.message.image.blob, true);
    worker.onmessage({ data: { id: worker.message.id, result: { candidates: [{ value: 100 }] } } });
    assert.equal((await scan).candidates[0].value, 100);
  }
  assert.equal(workers.length, 1);
});

test('worker failures reject pending scan immediately and allow retry', async () => {
  const { context, element, workers } = loadApp();
  const scan = context.runOCROnCanvas(element('camera-canvas'), 0);
  const rejected = assert.rejects(scan, /Unable to load OCR/);
  workers[0].onerror();
  await rejected;
  assert.equal(workers[0].terminated, true);
  const retry = context.runOCROnCanvas(element('camera-canvas'), 0);
  await tick();
  workers[1].onmessage({ data: { id: workers[1].message.id, result: {} } });
  await retry;
  assert.equal(workers.length, 2);
});

test('closing camera cancels pending scan and hides candidate UI', async () => {
  const { context, element, workers } = loadApp();
  const scan = context.runOCROnCanvas(element('camera-canvas'), 0);
  const rejected = assert.rejects(scan, /cancelled/);
  context.closeCamera();
  await rejected;
  await tick();
  assert.equal(workers[0].terminated, true);
  assert.equal(element('camera-modal').style.display, 'none');
  assert.equal(element('ocr-candidates').style.display, 'none');
  assert.equal(workers[0].message, undefined);
});

test('scan timeout resets the worker', async () => {
  const { context, element, workers } = loadApp();
  await assert.rejects(context.runOCROnCanvas(element('camera-canvas'), 0, 5), /timed out/);
  assert.equal(workers[0].terminated, true);
});

test('late camera permission result releases stream after modal closes', async () => {
  let resolveCamera;
  let stopped = false;
  const { context, element } = loadApp({ navigator: { mediaDevices: {
    getUserMedia: () => new Promise(resolve => { resolveCamera = resolve; })
  } } });
  const opening = element('camera-btn').listeners.click();
  context.closeCamera();
  resolveCamera({ getTracks: () => [{ stop() { stopped = true; } }] });
  await opening;
  assert.equal(stopped, true);
  assert.equal(element('camera-video').srcObject, null);
});

test('ambiguous candidates require selection, then apply using current currency precision', () => {
  const { context, element } = loadApp();
  context.applyRates({ vnd: 750 });
  context.showCandidateOptions([{ value: 75025, confidence: 73, score: 130 }]);
  const [prompt, option] = element('ocr-candidates').children;
  assert.equal(prompt.textContent, 'Choose the correct amount:');
  assert.equal(prompt.id, 'ocr-choice-label');
  assert.equal(option.textContent, context.formatNumber(75025));
  option.listeners.click();
  assert.equal(element('second-currency').value, '75025');
  assert.equal(element('thb').value, '100.03');
  assert.equal(element('ocr-status').style.display, 'flex');
  context.closeCamera(); // clear automatic-close timer
});
