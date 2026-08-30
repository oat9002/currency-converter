importScripts('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');

// Simple worker that runs Tesseract on an ImageBitmap and returns the best numeric result.
self.onmessage = async (e) => {
  const { id, bitmap } = e.data;
  if (!id) return;

  try {
    const psmCandidates = [6, 11];
    let best = { score: -Infinity, text: '', psm: null };

    for (const psm of psmCandidates) {
      try {
        const { data } = await Tesseract.recognize(bitmap, 'eng+tha', {
          tessedit_char_whitelist: '0123456789.,:()฿/ -',
          psm
        });

        const txt = (data && data.text) ? String(data.text) : '';
        const cleaned = (txt || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
        const digits = (cleaned.match(/\d/g) || []).length;
        const avgConf = data.words && data.words.length
          ? data.words.reduce((s, w) => s + (Number(w.confidence) || 0), 0) / data.words.length
          : 0;

        const score = digits * 4 + avgConf * 0.6;
        if (score > best.score) best = { score, text: cleaned, psm };

        // Early exit
        if (digits >= 3 && avgConf >= 80) break;
      } catch (innerErr) {
        // ignore per-psm errors
        console.warn('Worker OCR PSM failed', psm, innerErr);
      }
    }

    postMessage({ id, result: best });
  } catch (err) {
    postMessage({ id, error: String(err) });
  } finally {
    // close bitmap if available
    try { if (bitmap && typeof bitmap.close === 'function') bitmap.close(); } catch (e) {}
  }
};
