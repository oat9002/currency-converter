importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

// Worker uses a persistent Tesseract worker (createWorker) and performs preprocessing here.
let _workerInstance = null;
let _initialized = false;

async function ensureWorkerInitialized() {
  if (_initialized && _workerInstance) return;
  _workerInstance = Tesseract.createWorker({
    logger: m => {
      // forward logs to main thread if needed
      // postMessage({ type: 'log', payload: m });
    }
  });

  await _workerInstance.load();
  await _workerInstance.loadLanguage('eng+tha');
  await _workerInstance.initialize('eng+tha');
  // set params for digits and common characters
  await _workerInstance.setParameters({ tessedit_char_whitelist: '0123456789.,:()฿/ -' });
  _initialized = true;
  postMessage({ type: 'ready' });
}

function preprocessBitmapToCanvas(bitmap) {
  // create an offscreen canvas to manipulate (OffscreenCanvas in worker if available)
  const scale = 2;
  let canvas;
  let ctx;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(bitmap.width * scale, bitmap.height * scale);
      ctx = canvas.getContext('2d');
    } else {
      // fallback (shouldn't typically run in worker)
      canvas = self.document ? self.document.createElement('canvas') : null;
      if (!canvas) throw new Error('No canvas available in worker');
      canvas.width = bitmap.width * scale;
      canvas.height = bitmap.height * scale;
      ctx = canvas.getContext('2d');
    }
  } catch (err) {
    throw err;
  }

  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  // simple grayscale + contrast boost + thresholding
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const brightnessThreshold = 210;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
    const v = gray > brightnessThreshold ? 255 : Math.max(0, gray - 45);
    data[i] = data[i+1] = data[i+2] = v;
    data[i+3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  return canvas;
}

// scoring helper
const KEYWORDS = [
  'total', 'amount', 'amt', 'due', 'payable', 'grand total', 'subtotal', 'balance', 'total due',
  'ยอดรวม', 'ยอดชำระ', 'รวม', 'รวมทั้งสิ้น', 'จำนวนเงิน', 'ชำระ', 'เงิน',
  '合計', '總計', '支付', '金额'
];

function normalizeKeywordText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0e00-\u0e7f\u4e00-\u9fff]/g, '')
    .trim();
}

function extractCandidateScore(word, keywordWords) {
  const text = normalizeKeywordText(word.text);
  if (!text) return 0;

  let score = 0;
  if (word.confidence) score += Number(word.confidence) * 0.8;
  if (word.bbox) {
    const { x0, y0, x1, y1 } = word.bbox;
    const width = Math.max(1, x1 - x0);
    const height = Math.max(1, y1 - y0);
    score += Math.min(30, width * 0.1 + height * 0.4);
  }

  // prefer a word near keyword area or near the lower half of the image
  // if the text is numeric-like, we can rank it using OCR confidence and size
  const hasDigit = /\d/.test(text);
  if (hasDigit) score += 12;
  const isKeywordLike = keywordWords.some((kw) => text.includes(kw) || kw.includes(text));
  if (isKeywordLike) score += 50;

  return score;
}

function parseMoneyCandidateLocal(raw) {
  if (!raw) return null;
  let pattern = String(raw).trim();
  if (!pattern) return null;
  pattern = pattern.replace(/\s+/g, '');
  pattern = pattern.replace(/[^\d.,]/g, '');
  if (!pattern) return null;

  if (pattern.includes(',') && pattern.includes('.')) {
    const lastComma = pattern.lastIndexOf(',');
    const lastDot = pattern.lastIndexOf('.');
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandSep = decimalSep === ',' ? '.' : ',';
    pattern = pattern.replace(new RegExp(`\\${thousandSep}`, 'g'), '');
    pattern = pattern.replace(decimalSep, '.');
  } else if (pattern.includes(',')) {
    const parts = pattern.split(',');
    if (parts.length > 1 && parts[parts.length - 1].length <= 2) {
      pattern = pattern.replace(/,/g, '.');
    } else {
      pattern = pattern.replace(/,/g, '');
    }
  } else if (pattern.includes('.')) {
    const parts = pattern.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length > 2) {
      pattern = pattern.replace(/\./g, '');
    }
  }

  const value = Number.parseFloat(pattern);
  if (!Number.isFinite(value)) return null;
  if (value <= 0 || value > 10000000) return null;
  return value;
}

function scoreResult(data) {
  const txt = (data && data.text) ? String(data.text) : '';
  const cleaned = (txt || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  const digits = (cleaned.match(/\d/g) || []).length;
  const avgConf = data.words && data.words.length
    ? data.words.reduce((s, w) => s + (Number(w.confidence) || 0), 0) / data.words.length
    : 0;

  const keywordWords = (data.words || [])
    .filter(w => {
      const norm = normalizeKeywordText(w.text);
      return KEYWORDS.some(kw => norm.includes(normalizeKeywordText(kw)) || normalizeKeywordText(kw).includes(norm));
    });

  const candidates = [];

  for (const word of data.words || []) {
    const rawText = String(word.text || '');
    const norm = normalizeKeywordText(rawText);
    if (!norm || !/\d/.test(norm)) continue;
    const candidateText = rawText.replace(/[^\d.,]/g, '');
    const value = parseMoneyCandidateLocal(candidateText);
    if (value === null) continue;

    let score = Number(word.confidence || 0) * 1.2;
    if (word.bbox) {
      const { x0, y0, x1, y1 } = word.bbox;
      const width = Math.max(1, x1 - x0);
      const height = Math.max(1, y1 - y0);
      score += width * 0.12 + height * 0.25;
    }

    if (keywordWords.length) {
      let nearestDistance = Infinity;
      for (const kw of keywordWords) {
        if (!kw.bbox || !word.bbox) continue;
        const xCenter = (word.bbox.x0 + word.bbox.x1) / 2;
        const yCenter = (word.bbox.y0 + word.bbox.y1) / 2;
        const kxCenter = (kw.bbox.x0 + kw.bbox.x1) / 2;
        const kyCenter = (kw.bbox.y0 + kw.bbox.y1) / 2;
        const distance = Math.hypot(xCenter - kxCenter, yCenter - kyCenter);
        nearestDistance = Math.min(nearestDistance, distance);
      }
      if (Number.isFinite(nearestDistance)) {
        score += Math.max(0, 80 - nearestDistance * 0.08);
      }
    }

    if (candidateText.includes(',') || candidateText.includes('.')) score += 15;
    if (candidateText.length >= 3 && candidateText.length <= 8) score += 10;

    candidates.push({ text: candidateText, value, bbox: word.bbox || null, confidence: Number(word.confidence||0), score });
  }

  candidates.sort((a,b)=>b.score - a.score);
  const bestCandidate = candidates.length ? candidates[0].text : null;
  const bestCandidateScore = candidates.length ? candidates[0].score : -Infinity;

  const score = digits * 4 + avgConf * 0.6 + (bestCandidate ? bestCandidateScore * 0.25 : 0);
  return {
    score,
    cleaned,
    digits,
    avgConf,
    bestCandidate,
    candidates
  };
}

self.onmessage = async (e) => {
  const msg = e.data || {};
  try {
    if (msg.type === 'init') {
      await ensureWorkerInitialized();
      return;
    }

    if (msg.type === 'recognize' && msg.bitmap) {
      const { id, bitmap } = msg;
      try {
        await ensureWorkerInitialized();
        const canvas = preprocessBitmapToCanvas(bitmap);

        const psmCandidates = [6, 11];
        let best = { score: -Infinity, text: '', psm: null, candidate: null };

        for (const psm of psmCandidates) {
          try {
            const { data } = await _workerInstance.recognize(canvas, { psm });
            const { score, cleaned, digits, avgConf, bestCandidate } = scoreResult(data);
            if (score > best.score) best = { score, text: cleaned, psm, candidate: bestCandidate || cleaned };
            if (digits >= 3 && avgConf >= 80) break;
          } catch (innerErr) {
            console.warn('worker psm failed', psm, innerErr);
          }
        }

        postMessage({ id, result: best });
      } catch (err) {
        postMessage({ id, error: String(err) });
      } finally {
        try { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); } catch (e) {}
      }
    }
  } catch (err) {
    if (msg && msg.id) postMessage({ id: msg.id, error: String(err) });
    else postMessage({ error: String(err) });
  }
};
