const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWorker(overrides = {}) {
  const messages = [];
  const context = vm.createContext({
    importScripts() {}, self: {}, postMessage: message => messages.push(message), ...overrides
  });
  vm.runInContext(fs.readFileSync('ocr-worker.js', 'utf8'), context);
  return { context, messages };
}

test('money parser supports grouping, both decimal conventions, Thai digits, and large VND amounts', () => {
  const { context } = loadWorker();
  for (const [raw, expected] of [
    ['1,234.56', 1234.56], ['1.234,56', 1234.56], ['1 234 567,89', 1234567.89],
    ['๑,๒๓๔.๕๐', 1234.5], ['₫250.000.000', 250000000], ['75025 VND', 75025],
    ['0.50', 0.5], ['1234', 1234]
  ]) assert.equal(context.parseMoneyCandidateLocal(raw), expected, raw);
});

test('money parser rejects dates, IDs, malformed separators, and nonpositive amounts', () => {
  const { context } = loadWorker();
  for (const raw of ['24/10/2026', '12:30', 'A123B', '1,23,45', '1.234.56', '-100', '0', 'NaN', '1e3']) {
    assert.equal(context.parseMoneyCandidateLocal(raw), null, raw);
  }
});

test('scoring returns unique candidates and prefers an amount beside a total label', () => {
  const { context } = loadWorker();
  const result = context.scoreResult({ text: 'TOTAL 1,250.00', words: [
    { text: 'TOTAL', bbox: { x0: 0, y0: 50, x1: 60, y1: 70 } },
    { text: '1,250.00', confidence: 95, bbox: { x0: 100, y0: 50, x1: 180, y1: 70 } },
    { text: '1250', confidence: 80, bbox: { x0: 100, y0: 80, x1: 180, y1: 100 } },
    { text: '9999', confidence: 95, bbox: { x0: 100, y0: 0, x1: 180, y1: 20 } },
    { text: '24/10/2026', confidence: 99 }
  ] });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].value, 1250);
  assert.equal(result.candidates[0].confidence, 95);
});

test('text-only results require confirmation and exclude dates', () => {
  const { context } = loadWorker();
  const result = context.scoreResult({ text: '24/10/2026\nTOTAL 250,000' });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].value, 250000);
  assert.equal(result.candidates[0].confidence, 0);
});

test('v5 engine initializes once, changes PSM using parameters, and returns candidates', async () => {
  let initializations = 0;
  const parameters = [];
  const inputs = [];
  const { context, messages } = loadWorker({ Tesseract: { async createWorker(...args) {
    initializations++;
    assert.equal(args[0], 'eng+tha');
    assert.equal(args[1], 1);
    return {
      async setParameters(params) { parameters.push(params); },
      async recognize(input) {
        inputs.push(input);
        return { data: { text: '100.00', words: [{ text: '100.00', confidence: 96 }] } };
      }
    };
  } } });
  const image = { blob: true };
  await context.self.onmessage({ data: { type: 'recognize', id: 1, image } });
  await context.self.onmessage({ data: { type: 'recognize', id: 2, image } });
  assert.equal(initializations, 1);
  assert.equal(inputs.length, 2); // strong result skips second OCR pass
  assert.equal(inputs[0], image); // Blob fallback bypasses OffscreenCanvas
  assert.equal(parameters[1].tessedit_pageseg_mode, '6');
  assert.equal(messages[0].result.candidates[0].value, 100);
});

test('uncertain first pass tries sparse-text mode', async () => {
  const modes = [];
  const { context, messages } = loadWorker({ Tesseract: { async createWorker() { return {
    async setParameters(params) { if (params.tessedit_pageseg_mode) modes.push(params.tessedit_pageseg_mode); },
    async recognize() { return { data: { words: [{ text: '100', confidence: modes.length === 1 ? 20 : 95 }] } }; }
  }; } } });
  await context.self.onmessage({ data: { type: 'recognize', id: 1, image: {} } });
  assert.deepEqual(modes, ['6', '11']);
  assert.equal(messages[0].result.candidates[0].confidence, 95);
});

test('bitmap preprocessing is bounded, reused, and closes inputs', async () => {
  const canvases = [];
  let closed = 0;
  class Bitmap { constructor() { this.width = 4000; this.height = 2000; } close() { closed++; } }
  class Canvas {
    constructor(width, height) { this.width = width; this.height = height; canvases.push(this); }
    getContext() { return { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {} }; }
  }
  const { context } = loadWorker({ ImageBitmap: Bitmap, OffscreenCanvas: Canvas, Tesseract: { async createWorker() { return {
    async setParameters() {}, async recognize() { return { data: { words: [{ text: '100.00', confidence: 99 }] } }; }
  }; } } });
  for (let id = 1; id <= 2; id++) await context.self.onmessage({ data: { type: 'recognize', id, image: new Bitmap() } });
  assert.equal(canvases.length, 1);
  assert.equal(canvases[0].width, 2048);
  assert.equal(canvases[0].height, 1024);
  assert.equal(closed, 2);
});

test('initialization failure is reported and transferred image is closed', async () => {
  let closed = false;
  const { context, messages } = loadWorker({ Tesseract: { async createWorker() { throw new Error('offline'); } } });
  await context.self.onmessage({ data: { type: 'recognize', id: 7, image: { close() { closed = true; } } } });
  assert.equal(messages[0].id, 7);
  assert.match(messages[0].error, /offline/);
  assert.equal(closed, true);
});
