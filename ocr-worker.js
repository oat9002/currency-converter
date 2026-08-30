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
function scoreResult(data) {
  const txt = (data && data.text) ? String(data.text) : '';
  const cleaned = (txt || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  const digits = (cleaned.match(/\d/g) || []).length;
  const avgConf = data.words && data.words.length
    ? data.words.reduce((s, w) => s + (Number(w.confidence) || 0), 0) / data.words.length
    : 0;
  const score = digits * 4 + avgConf * 0.6;
  return { score, cleaned, digits, avgConf };
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
        let best = { score: -Infinity, text: '', psm: null };

        for (const psm of psmCandidates) {
          try {
            const { data } = await _workerInstance.recognize(canvas, { psm });
            const { score, cleaned, digits, avgConf } = scoreResult(data);
            if (score > best.score) best = { score, text: cleaned, psm };
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
    // top-level error
    if (msg && msg.id) postMessage({ id: msg.id, error: String(err) });
    else postMessage({ error: String(err) });
  }
};
