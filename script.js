// Exchange rates
const API_URL = 'https://latest.currency-api.pages.dev/v1/currencies/thb.json';
const STORAGE_KEY = 'currencyConverter_state';
const RATES_TTL_MS = 24 * 60 * 60 * 1000;

// Get elements
const thb = document.getElementById('thb');
const secondCurrency = document.getElementById('second-currency');
const secondCurrencyLabel = document.getElementById('second-currency-label');
const secondCurrencyRate = document.getElementById('second-currency-rate');
const currencySelect = document.getElementById('currency-select');
let lastEdited = null;
let exchangeRates = {
  idr: null,
  php: null,
  jpy: null,
  myr: null,
  cny: null,
  krw: null,
  sgd: null,
  hkd: null
};

// Reusable offscreen canvas for preprocessing to reduce allocations
let ocrOffscreen = document.createElement('canvas');
function getOffscreenCanvas(w, h) {
  if (ocrOffscreen.width !== w || ocrOffscreen.height !== h) {
    ocrOffscreen.width = w;
    ocrOffscreen.height = h;
  }
  return ocrOffscreen;
}

// Money regex (hoisted to avoid recreating it on every capture)
const MONEY_RE = /(?:\d{1,3}(?:[\s,\.]\d{3})+|\d+)(?:[.,]\d{1,2})?/g;

function readStorageState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn('Unable to read currency converter storage:', error);
    return {};
  }
}

function writeStorageState(state = {}) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to write currency converter storage:', error);
  }
}

function getCachedRates() {
  try {
    const state = readStorageState();
    const cached = state.rates;
    const timestamp = Number(state.ratesTimestamp);

    if (cached && timestamp && Date.now() - timestamp < RATES_TTL_MS) {
      return cached;
    }
  } catch (error) {
    console.warn('Unable to read cached exchange rates:', error);
  }

  return null;
}

function saveRatesToCache(ratesData) {
  const state = readStorageState();
  state.rates = ratesData;
  state.ratesTimestamp = Date.now();
  writeStorageState(state);
}

function getSelectedRate(currency) {
  return exchangeRates[currency] ?? null;
}

function applyRates(ratesData) {
  exchangeRates = {
    idr: ratesData.idr ?? null,
    php: ratesData.php ?? null,
    jpy: ratesData.jpy ?? null,
    myr: ratesData.myr ?? null,
    cny: ratesData.cny ?? null,
    krw: ratesData.krw ?? null,
    sgd: ratesData.sgd ?? null,
    hkd: ratesData.hkd ?? null
  };
  updateCurrencyDisplay();
}

async function loadExchangeRates() {
  const cachedRates = getCachedRates();
  if (cachedRates) {
    applyRates(cachedRates);
  }

  try {
    const response = await fetch(API_URL);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    const fetchedRates = {
      idr: data?.thb?.idr ?? null,
      php: data?.thb?.php ?? null,
      jpy: data?.thb?.jpy ?? null,
      myr: data?.thb?.myr ?? null,
      cny: data?.thb?.cny ?? null,
      krw: data?.thb?.krw ?? null,
      sgd: data?.thb?.sgd ?? null,
      hkd: data?.thb?.hkd ?? null
    };

    if (fetchedRates.idr && fetchedRates.php && fetchedRates.jpy && fetchedRates.myr && fetchedRates.cny && fetchedRates.krw && fetchedRates.sgd && fetchedRates.hkd) {
      saveRatesToCache(fetchedRates);
      applyRates(fetchedRates);
    }
  } catch (error) {
    console.error('Unable to fetch exchange rates:', error);
  }
}

// Load saved currency selection from localStorage
function loadSavedCurrency() {
  const state = readStorageState();
  const saved = state.selectedCurrency;
  if (saved === 'idr' || saved === 'php' || saved === 'jpy') {
    currencySelect.value = saved;
  }
  updateCurrencyDisplay();
}

// Save currency selection to localStorage
function saveCurrencySelection(currency) {
  const state = readStorageState();
  state.selectedCurrency = currency;
  writeStorageState(state);
}

function getCurrencyLabel(currency) {
  const labels = {
    idr: 'IDR',
    php: 'PHP',
    jpy: 'JPY',
    myr: 'MYR',
    cny: 'CNY',
    krw: 'KRW',
    sgd: 'SGD',
    hkd: 'HKD'
  };

  return labels[currency] || currency.toUpperCase();
}

function getDisplayPrecision(currency) {
  return ['idr', 'jpy', 'krw'].includes(currency) ? 0 : 2;
}

// Update the display based on selected currency
function updateCurrencyDisplay() {
  const selectedCurrency = currencySelect.value;
  const selectedRate = getSelectedRate(selectedCurrency);
  const rateText = selectedRate ? selectedRate.toFixed(2) : '—';
  const inverseRateText = selectedRate ? (1 / selectedRate).toFixed(4) : '—';
  const currencyLabel = getCurrencyLabel(selectedCurrency);
  const sharedRateClasses = 'text-xs text-nm-muted font-normal ml-2';

  secondCurrencyLabel.innerHTML = `${currencyLabel} <span id="second-currency-rate" class="${sharedRateClasses} rate-info"></span>`;

  const thbRateElement = document.getElementById('thb-rate');
  if (thbRateElement) {
    thbRateElement.className = sharedRateClasses;
    thbRateElement.textContent = selectedRate ? `(1 THB = ${rateText} ${currencyLabel})` : '(loading rate...)';
  }

  // Update rate reference after DOM update
  const rateElement = document.getElementById('second-currency-rate');
  if (rateElement) {
    rateElement.className = sharedRateClasses;
    rateElement.textContent = selectedRate ? `(1 ${currencyLabel} = ${inverseRateText} THB)` : '(loading rate...)';
  }

  // Clear the second currency input when switching
  secondCurrency.value = '';
}

// Conversion functions
function convertFromTHB(thbValue, targetCurrency) {
  const rate = getSelectedRate(targetCurrency);
  return rate ? thbValue * rate : 0;
}

function convertToTHB(secondCurrencyValue, sourceCurrency) {
  const rate = getSelectedRate(sourceCurrency);
  return rate ? secondCurrencyValue / rate : 0;
}

// Initialize on page load
loadSavedCurrency();
loadExchangeRates();

// Event listener for currency selection dropdown
currencySelect.addEventListener('change', function() {
  const selectedCurrency = currencySelect.value;
  saveCurrencySelection(selectedCurrency);
  updateCurrencyDisplay();
});

// Event listener for THB input
thb.addEventListener('input', function() {
  if (lastEdited === 'second') return;
  lastEdited = 'thb';
  const val = parseFloat(thb.value);
  if (val) {
    const selectedCurrency = currencySelect.value;
    const converted = convertFromTHB(val, selectedCurrency);
    const precision = getDisplayPrecision(selectedCurrency);
    secondCurrency.value = converted.toFixed(precision);
  } else {
    secondCurrency.value = '';
  }
  lastEdited = null;
});

// Event listener for second currency input
secondCurrency.addEventListener('input', function() {
  if (lastEdited === 'thb') return;
  lastEdited = 'second';
  const val = parseFloat(secondCurrency.value);
  if (val) {
    const selectedCurrency = currencySelect.value;
    const converted = convertToTHB(val, selectedCurrency);
    thb.value = converted.toFixed(2);
  } else {
    thb.value = '';
  }
  lastEdited = null;
});

// Camera functionality
const cameraBtn = document.getElementById('camera-btn');
const cameraModal = document.getElementById('camera-modal');
const cameraVideo = document.getElementById('camera-video');
const cameraCanvas = document.getElementById('camera-canvas');
const closeCameraBtn = document.getElementById('close-camera');
const stopCameraBtn = document.getElementById('stop-camera');
const captureBtn = document.getElementById('capture-btn');
const ocrStatus = document.getElementById('ocr-status');
let stream = null;

// Open camera modal
cameraBtn.addEventListener('click', async function() {
  cameraModal.style.display = 'flex';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'environment', // Use back camera on mobile
        width: { ideal: 1280 },
        height: { ideal: 720 }
      } 
    });
    cameraVideo.srcObject = stream;
  } catch (error) {
    console.error('Error accessing camera:', error);
    alert('Unable to access camera. Please check permissions.');
    cameraModal.style.display = 'none';
  }
});

// Close camera modal
function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraVideo.srcObject = null;
  cameraModal.style.display = 'none';
  ocrStatus.style.display = 'none';
  ocrStatus.innerHTML = '<div class="ocr-spinner"></div><span>Reading numbers...</span>';
  captureBtn.disabled = false;
}

closeCameraBtn.addEventListener('click', closeCamera);
stopCameraBtn.addEventListener('click', closeCamera);

// Close modal when clicking outside
cameraModal.addEventListener('click', function(e) {
  if (e.target === cameraModal) {
    closeCamera();
  }
});

function normalizeNumericText(rawText) {
  const normalized = (rawText || '')
    .replace(/[๐-๙]/g, ch => '๐๑๒๓๔๕๖๗๘๙'.indexOf(ch) )
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[$€£¥]/g, '')
    .replace(/O/g, '0')
    .replace(/I/g, '1')
    .replace(/l/g, '1')
    .replace(/S/g, '5')
    .replace(/B/g, '8');

  return normalized;
}

function parseMoneyCandidate(rawPattern) {
  if (!rawPattern) return null;

  let pattern = rawPattern.trim();
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
    const commaParts = pattern.split(',');
    if (commaParts.length > 1 && commaParts[commaParts.length - 1].length <= 2) {
      pattern = pattern.replace(/,/g, '.');
    } else {
      pattern = pattern.replace(/,/g, '');
    }
  } else if (pattern.includes('.')) {
    const dotParts = pattern.split('.');
    if (dotParts.length > 1 && dotParts[dotParts.length - 1].length <= 2) {
      // keep decimal as is
    } else {
      pattern = pattern.replace(/\./g, '');
    }
  }

  const value = Number.parseFloat(pattern);
  if (!Number.isFinite(value)) return null;
  if (value <= 0 || value > 10000000) return null;

  return value;
}

function extractNumbers(text) {
  if (!text) return null;

  const normalized = normalizeNumericText(text);
  const moneyMatches = [...normalized.matchAll(/(?:\d{1,3}(?:[\s,\.]\d{3})+|\d+)(?:[.,]\d{1,2})?/g)];
  const candidateValues = [];

  moneyMatches.forEach(match => {
    const parsed = parseMoneyCandidate(match[0]);
    if (parsed !== null) candidateValues.push(parsed);
  });

  if (candidateValues.length === 0) {
    return null;
  }

  // Prefer values that are likely a total/amount, not dates or IDs.
  const sorted = candidateValues
    .filter(v => v >= 0.5 && v <= 9999999 && !(v >= 1900 && v <= 2100))
    .sort((a, b) => b - a);

  if (sorted.length === 0) return null;
  return sorted[0];
}

function getCaptureCanvas() {
  const targetWidth = cameraVideo.videoWidth || 1280;
  const targetHeight = cameraVideo.videoHeight || 720;
  const cropWidth = Math.min(targetWidth, Math.round(targetWidth * 0.82));
  const cropHeight = Math.min(targetHeight, Math.round(targetHeight * 0.42));
  const cropX = (targetWidth - cropWidth) / 2;
  const cropY = (targetHeight - cropHeight) / 2;

  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = cropWidth;
  captureCanvas.height = cropHeight;
  const ctx = captureCanvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(cameraVideo, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return captureCanvas;
}

function enhanceCanvasForOCR(sourceCanvas) {
  const scale = 2;
  const tmp = getOffscreenCanvas(sourceCanvas.width * scale, sourceCanvas.height * scale);
  const ctx = tmp.getContext('2d');
  ctx.clearRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(sourceCanvas, 0, 0, tmp.width, tmp.height);

  const img = ctx.getImageData(0, 0, tmp.width, tmp.height);
  const data = img.data;
  const brightnessThreshold = 210;

  // Convert to grayscale with contrast boost in-place
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let gray = 0.299 * r + 0.587 * g + 0.114 * b;
    gray = Math.max(0, Math.min(255, (gray - 128) * 1.6 + 128));
    const v = gray > brightnessThreshold ? 255 : Math.max(0, gray - 45);
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
  return tmp;
}

// OCR worker integration: run OCR in dedicated Web Worker to avoid blocking main thread
let ocrWorker = null;
let ocrWorkerReady = null;
const _pendingOCR = new Map();
function initOCRWorker() {
  if (ocrWorker) return;
  ocrWorker = new Worker('ocr-worker.js');
  ocrWorkerReady = new Promise((resolve, reject) => {
    ocrWorker._resolveReady = resolve;
    ocrWorker._rejectReady = reject;
  });

  ocrWorker.onmessage = (e) => {
    const data = e.data || {};
    if (data.type === 'ready') {
      ocrWorker._resolveReady();
      return;
    }

    const { id, result, error } = data;
    const entry = _pendingOCR.get(id);
    if (!entry) return;
    _pendingOCR.delete(id);
    if (error) {
      entry.reject(new Error(error));
    } else {
      entry.resolve(result);
    }
  };
  ocrWorker.onerror = (err) => {
    console.error('OCR worker error', err);
    if (ocrWorker && ocrWorker._rejectReady) ocrWorker._rejectReady(err);
  };

  // ask worker to initialize in background
  try { ocrWorker.postMessage({ type: 'init' }); } catch (e) { /* ignore */ }
}

async function runOCROnCanvas(canvas, timeoutMs = 20000) {
  initOCRWorker();
  // wait for worker to be ready (but don't fail immediately)
  try { await Promise.race([ocrWorkerReady, new Promise(res => setTimeout(res, 2000))]); } catch (e) { /* ignore */ }

  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      _pendingOCR.delete(id);
      reject(new Error('OCR timeout'));
    }, timeoutMs);

    _pendingOCR.set(id, {
      resolve: (res) => { clearTimeout(timer); resolve(res); },
      reject: (err) => { clearTimeout(timer); reject(err); }
    });

    try {
      // create transferable ImageBitmap to send to worker
      const bitmap = await createImageBitmap(canvas);
      ocrWorker.postMessage({ type: 'recognize', id, bitmap }, [bitmap]);
    } catch (err) {
      _pendingOCR.delete(id);
      clearTimeout(timer);
      reject(err);
    }
  });
}

// Capture photo and perform OCR
captureBtn.addEventListener('click', async function() {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    ocrStatus.innerHTML = '<span style="color: #ff3b30;">Camera not ready. Try again.</span>';
    setTimeout(() => {
      ocrStatus.style.display = 'none';
      captureBtn.disabled = false;
    }, 2000);
    return;
  }

  const captureCanvas = getCaptureCanvas();
  cameraCanvas.width = captureCanvas.width;
  cameraCanvas.height = captureCanvas.height;
  const context = cameraCanvas.getContext('2d');
  context.drawImage(captureCanvas, 0, 0);

  // Show OCR status
  ocrStatus.style.display = 'flex';
  captureBtn.disabled = true;

  try {
    const enhancedCanvas = enhanceCanvasForOCR(captureCanvas);
    const bestResult = await runOCROnCanvas(enhancedCanvas);
    console.log('OCR result:', bestResult);

    // bestResult may include a candidates array (from worker)
    const candidates = (bestResult && bestResult.candidates) || bestResult.candidates || [];
    const autoAcceptScore = 120; // tunable

    if (candidates && candidates.length > 0) {
      // If top candidate has a strong score, auto-accept
      const top = candidates[0];
      if (top.score >= autoAcceptScore) {
        applyExtractedValue(top.value);
        ocrStatus.innerHTML = '<span style="color: #4caf50;">✓ Number detected: ' + formatNumber(top.value) + '</span>';
        setTimeout(() => closeCamera(), 1200);
      } else {
        // Show UI choices to user
        showCandidateOptions(candidates);
      }
    } else {
      // Fallback to text-based extraction
      const text = bestResult.text || '';
      const extractedNumber = extractNumbers(text);
      if (extractedNumber !== null && !isNaN(extractedNumber)) {
        applyExtractedValue(extractedNumber);
        ocrStatus.innerHTML = '<span style="color: #4caf50;">✓ Number detected: ' + extractedNumber.toFixed(2) + '</span>';
        setTimeout(() => closeCamera(), 1200);
      } else {
        ocrStatus.innerHTML = '<span style="color: #ff3b30;">No usable amount found. Try again.</span>';
        setTimeout(() => {
          ocrStatus.style.display = 'none';
          captureBtn.disabled = false;
        }, 2000);
      }
    }
  } catch (error) {
    console.error('OCR Error:', error);
    ocrStatus.innerHTML = '<span style="color: #ff3b30;">Error reading image. Please try again.</span>';
    setTimeout(() => {
      ocrStatus.style.display = 'none';
      captureBtn.disabled = false;
    }, 2000);
  }
});

function formatNumber(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function applyExtractedValue(val) {
  const selectedCurrency = currencySelect.value;
  const precision = getDisplayPrecision(selectedCurrency);
  secondCurrency.value = Number(val).toFixed(precision);
  const numeric = parseFloat(secondCurrency.value);
  if (numeric) {
    lastEdited = 'second';
    const converted = convertToTHB(numeric, selectedCurrency);
    thb.value = converted.toFixed(2);
    lastEdited = null;
  }
}

// Render candidate buttons for user to choose
function showCandidateOptions(candidates) {
  const container = document.getElementById('ocr-candidates');
  container.innerHTML = '';
  container.style.display = 'flex';
  ocrStatus.style.display = 'none';

  candidates.slice(0, 3).forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-4 py-2 rounded-xl bg-nm-bg text-nm-text border border-white/40 hover:bg-black/5';
    btn.textContent = `${formatNumber(c.value)}  — confidence ${Math.round(c.score)}`;
    btn.addEventListener('click', () => {
      container.style.display = 'none';
      applyExtractedValue(c.value);
      ocrStatus.innerHTML = '<span style="color: #4caf50;">✓ Selected: ' + formatNumber(c.value) + '</span>';
      setTimeout(() => closeCamera(), 900);
    });
    container.appendChild(btn);
  });

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'px-4 py-2 rounded-xl bg-nm-bg text-red-600 border border-white/40 hover:bg-black/5';
  retry.textContent = 'None of these — Retry';
  retry.addEventListener('click', () => {
    container.style.display = 'none';
    ocrStatus.style.display = 'none';
    captureBtn.disabled = false;
  });
  container.appendChild(retry);
}

// Theme toggle functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');

  if (!themeToggle || !sunIcon || !moonIcon) {
    console.error('Theme toggle elements not found');
    return;
  }

  // Load saved theme from localStorage
  function loadSavedTheme() {
    const state = readStorageState();
    const savedTheme = state.theme;
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      document.documentElement.classList.remove('dark');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
  }

  // Save theme to localStorage
  function saveTheme(theme) {
    const state = readStorageState();
    state.theme = theme;
    writeStorageState(state);
  }

  // Load theme on init
  loadSavedTheme();

  // Toggle theme function
  function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
      document.documentElement.classList.remove('dark');
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
      saveTheme('light');
    } else {
      document.documentElement.classList.add('dark');
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
      saveTheme('dark');
    }
  }

  // Add both click and touchstart for better iOS support
  themeToggle.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleTheme();
  });
  
  themeToggle.addEventListener('touchstart', function(e) {
    e.preventDefault();
    e.stopPropagation();
    toggleTheme();
  }, { passive: false });
}

// Initialize theme toggle when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initThemeToggle);
} else {
  initThemeToggle();
}

// Service Worker update detection
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('New service worker activated - refreshing page');
    window.location.reload();
  });

  setInterval(() => {
    navigator.serviceWorker.getRegistration().then(registration => {
      if (registration) {
        registration.update().catch(error => {
          console.error('Service Worker update check failed:', error);
        });
      }
    });
  }, 60000); // Check for updates every 60 seconds
}

// Fetch and display version in console
async function loadAndDisplayVersion() {
  try {
    const response = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (response.ok) {
      const data = await response.json();
      console.log('🔄 App Version:', 'v' + data.version);
    }
  } catch (error) {
    console.error('Failed to fetch version:', error);
  }
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadAndDisplayVersion);
} else {
  loadAndDisplayVersion();
}
