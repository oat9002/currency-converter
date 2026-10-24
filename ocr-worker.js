// Tesseract is loaded only in this worker, on the first scan.
importScripts('app-config.js', 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js');

let workerPromise = null;
let processingCanvas = null;

function ensureWorkerInitialized() {
  if (!workerPromise) {
    workerPromise = (async () => {
      // v5 creates, loads, and initializes the engine in one asynchronous call.
      const worker = await Tesseract.createWorker('eng+tha', 1);
      // Keep receipt labels: a digit-only whitelist prevented total-keyword scoring.
      await worker.setParameters({ preserve_interword_spaces: '1' });
      return worker;
    })();
  }
  return workerPromise;
}

function preprocessBitmapToCanvas(bitmap) {
  const scale = Math.min(2, 2048 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  if (!processingCanvas) processingCanvas = new OffscreenCanvas(width, height);
  if (processingCanvas.width !== width) processingCanvas.width = width;
  if (processingCanvas.height !== height) processingCanvas.height = height;
  const ctx = processingCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  // One bounded grayscale/contrast pass; retain antialiased edges for small text.
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114;
    const value = Math.max(0, Math.min(255, (gray - 128) * 1.3 + 128));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return processingCanvas;
}

function normalizeKeywordText(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9\u0e00-\u0e7f\u4e00-\u9fff]/g, '');
}

const KEYWORDS = ['total', 'amount', 'amt', 'due', 'payable', 'balance',
  'ยอดรวม', 'ยอดชำระ', 'รวมทั้งสิ้น', 'จำนวนเงิน', '合計', '總計', '支付', '金额']
  .map(normalizeKeywordText);

function normalizeDigits(value) {
  return String(value || '').replace(/[๐-๙]/g, digit => '๐๑๒๓๔๕๖๗๘๙'.indexOf(digit))
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
}

const CURRENCY_PATTERN = Object.keys(CurrencyConverterConfig.currencies).join('|');
const LEADING_CURRENCY = new RegExp(`^(?:${CURRENCY_PATTERN})\\s*`, 'i');
const TRAILING_CURRENCY = new RegExp(`\\s*(?:${CURRENCY_PATTERN})$`, 'i');

function parseMoneyCandidateLocal(raw) {
  let pattern = normalizeDigits(raw).trim()
    .replace(LEADING_CURRENCY, '')
    .replace(TRAILING_CURRENCY, '')
    .replace(/^[฿$€£¥₫₱₩]+|[฿$€£¥₫₱₩]+$/g, '').trim();
  // Validate the entire token: dates, IDs, and malformed separator groups aren't amounts.
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(pattern) &&
      !/^\d{1,3}(?:([.,\s])\d{3})(?:\1\d{3})*(?:[.,]\d{1,2})?$/.test(pattern)) return null;
  pattern = pattern.replace(/\s/g, '');
  const decimal = pattern.match(/[.,]\d{1,2}$/);
  if (decimal) {
    if (pattern.slice(0, -decimal[0].length).includes(decimal[0][0])) return null;
    pattern = pattern.slice(0, -decimal[0].length).replace(/[.,]/g, '') + '.' + decimal[0].slice(1);
  } else {
    pattern = pattern.replace(/[.,]/g, '');
  }
  const value = Number(pattern);
  return Number.isFinite(value) && value > 0 && value <= 1e12 ? value : null;
}

function scoreResult(data = {}) {
  const text = normalizeDigits(data.text);
  const words = data.words || [];
  const keywordWords = words.filter(word => {
    const normalized = normalizeKeywordText(word.text);
    return normalized && KEYWORDS.some(keyword => normalized.includes(keyword));
  });
  const byValue = new Map();
  for (const word of words) {
    const value = parseMoneyCandidateLocal(word.text);
    if (value === null) continue;
    const confidence = Math.max(0, Math.min(100, Number(word.confidence) || 0));
    let score = confidence * 1.2;
    if (word.bbox) {
      const { x0, y0, x1, y1 } = word.bbox;
      // Cap size bonuses so large low-confidence digits cannot dominate.
      score += Math.min(30, Math.max(0, x1 - x0) * 0.12 + Math.max(0, y1 - y0) * 0.25);
      for (const keyword of keywordWords) {
        if (!keyword.bbox) continue;
        const box = keyword.bbox;
        const height = Math.max(1, y1 - y0, box.y1 - box.y0);
        const distanceY = Math.abs((y0 + y1 - box.y0 - box.y1) / 2);
        // Prefer an amount on the same line as "total", independent of image scale.
        if (distanceY <= height && x0 >= box.x0) {
          score += 50;
          break;
        }
      }
    }
    if (/[.,]/.test(word.text)) score += 15;
    const candidate = { value, text: word.text, confidence, score };
    if (!byValue.has(value) || byValue.get(value).score < score) byValue.set(value, candidate);
  }
  // Some engine outputs have only plain text. Always ask the user to confirm these.
  if (!words.length) {
    const withoutDates = text.replace(/\d+(?:[/:\-]\d+)+/g, ' ');
    for (const match of withoutDates.matchAll(/(?:\d{1,3}(?:[, .]\d{3})+|\d+)(?:[.,]\d{1,2})?/g)) {
      const value = parseMoneyCandidateLocal(match[0]);
      if (value !== null) byValue.set(value, { value, text: match[0], confidence: 0, score: 0 });
    }
  }
  const candidates = [...byValue.values()].sort((a, b) => b.score - a.score);
  return { text, candidates, score: candidates[0]?.score ?? -1 };
}

self.onmessage = async ({ data: message }) => {
  if (message?.type !== 'recognize' || !message.image) return;
  const { id, image } = message;
  try {
    const worker = await ensureWorkerInitialized();
    const isBitmap = typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap;
    const input = isBitmap ? preprocessBitmapToCanvas(image) : image;
    let best = { score: -1, text: '', candidates: [] };
    for (const psm of [6, 11]) {
      await worker.setParameters({ tessedit_pageseg_mode: String(psm) });
      const { data } = await worker.recognize(input, {}, { text: true, blocks: true, hocr: false, tsv: false });
      const result = scoreResult(data);
      if (result.score > best.score) best = result;
      const [top, runnerUp] = best.candidates;
      if (top?.confidence >= 90 && top.score >= 120 && (!runnerUp || top.score - runnerUp.score >= 25)) break;
    }
    postMessage({ id, result: best });
  } catch (error) {
    postMessage({ id, error: error.message || String(error) });
  } finally {
    if (typeof image.close === 'function') image.close();
  }
};
