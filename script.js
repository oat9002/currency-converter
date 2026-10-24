// Exchange rates
const API_URL = 'https://latest.currency-api.pages.dev/v1/currencies/thb.json';
const STORAGE_KEY = 'currencyConverter_state';
const RATES_TTL_MS = 24 * 60 * 60 * 1000;
const CURRENCIES = { idr: 0, php: 2, jpy: 0, myr: 2, cny: 2, krw: 0, sgd: 2, hkd: 2, vnd: 0 };
const CURRENCY_CODES = Object.keys(CURRENCIES);

// Get elements
const thb = document.getElementById('thb');
const secondCurrency = document.getElementById('second-currency');
const secondCurrencyLabel = document.getElementById('second-currency-label');
const secondCurrencyRate = document.getElementById('second-currency-rate');
const currencyName = secondCurrencyLabel.querySelector('span');
const thbRateElement = document.getElementById('thb-rate');
const currencySelect = document.getElementById('currency-select');
let exchangeRates = normalizeRates();
let inputSource = 'thb';

function normalizeRates(data = {}) {
  return Object.fromEntries(CURRENCY_CODES.map(code => {
    const rate = data?.[code];
    return [code, Number.isFinite(rate) && rate > 0 ? rate : null];
  }));
}

function readStorageState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const state = raw ? JSON.parse(raw) : null;
    return state && typeof state === 'object' && !Array.isArray(state) ? state : {};
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
  exchangeRates = normalizeRates(ratesData);
  updateCurrencyDisplay();
  recalculateInputs();
}

async function loadExchangeRates() {
  const cachedRates = getCachedRates();
  if (cachedRates) {
    applyRates(cachedRates);
  }

  try {
    const response = await fetch(API_URL, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const data = await response.json();
    const fetchedRates = normalizeRates(data?.thb);

    if (Object.values(fetchedRates).some(rate => rate !== null)) {
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
  if (Object.prototype.hasOwnProperty.call(exchangeRates, saved)) {
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
  return currency.toUpperCase();
}

function getDisplayPrecision(currency) {
  return CURRENCIES[currency] ?? 2;
}

// Update the display based on selected currency
function updateCurrencyDisplay() {
  const selectedCurrency = currencySelect.value;
  const selectedRate = getSelectedRate(selectedCurrency);
  const rateText = selectedRate ? selectedRate.toFixed(2) : '—';
  const inverseRateText = selectedRate ? (1 / selectedRate).toFixed(4) : '—';
  const currencyLabel = getCurrencyLabel(selectedCurrency);
  currencyName.textContent = currencyLabel;
  thbRateElement.textContent = selectedRate ? `(1 THB = ${rateText} ${currencyLabel})` : '(rate unavailable)';
  secondCurrencyRate.textContent = selectedRate ? `(1 ${currencyLabel} = ${inverseRateText} THB)` : '(rate unavailable)';
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

// Keep the last edited amount when selection or exchange rates change.
function recalculateInputs() {
  const fromTHB = inputSource === 'thb';
  const source = fromTHB ? thb : secondCurrency;
  const target = fromTHB ? secondCurrency : thb;
  const value = Number.parseFloat(source.value);
  const currency = currencySelect.value;
  if (!Number.isFinite(value) || !getSelectedRate(currency)) {
    target.value = '';
    return;
  }
  const converted = fromTHB ? convertFromTHB(value, currency) : convertToTHB(value, currency);
  target.value = converted.toFixed(fromTHB ? getDisplayPrecision(currency) : 2);
}

loadSavedCurrency();
loadExchangeRates();

currencySelect.addEventListener('change', () => {
  saveCurrencySelection(currencySelect.value);
  updateCurrencyDisplay();
  recalculateInputs();
});
thb.addEventListener('input', () => {
  inputSource = 'thb';
  recalculateInputs();
});
secondCurrency.addEventListener('input', () => {
  inputSource = 'second';
  recalculateInputs();
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
const ocrCandidates = document.getElementById('ocr-candidates');
let stream = null;
let cameraSession = 0;
let cameraTimer = null;
let ocrWorker = null;
let nextOCRId = 0;
const pendingOCR = new Map();

cameraBtn.addEventListener('click', async () => {
  if (cameraModal.style.display === 'flex') return;
  const session = ++cameraSession;
  cameraModal.style.display = 'flex';
  captureBtn.disabled = true;
  try {
    const cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    if (session !== cameraSession) {
      cameraStream.getTracks().forEach(track => track.stop());
      return;
    }
    stream = cameraStream;
    cameraVideo.srcObject = stream;
    captureBtn.disabled = false;
  } catch (error) {
    if (session !== cameraSession) return;
    console.error('Error accessing camera:', error);
    closeCamera();
    alert('Unable to access camera. Please check permissions.');
  }
});

function resetOCRWorker(error = new Error('Scan cancelled')) {
  if (ocrWorker) ocrWorker.terminate();
  ocrWorker = null;
  for (const entry of pendingOCR.values()) {
    clearTimeout(entry.timer);
    entry.reject(error);
  }
  pendingOCR.clear();
}

function closeCamera() {
  ++cameraSession;
  clearTimeout(cameraTimer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  cameraVideo.srcObject = null;
  cameraModal.style.display = 'none';
  ocrStatus.style.display = 'none';
  ocrCandidates.style.display = 'none';
  ocrCandidates.replaceChildren();
  // Keep a ready worker for the next scan, but cancel unfinished work.
  if (pendingOCR.size) resetOCRWorker();
  captureBtn.disabled = false;
}

closeCameraBtn.addEventListener('click', closeCamera);
stopCameraBtn.addEventListener('click', closeCamera);
cameraModal.addEventListener('click', event => {
  if (event.target === cameraModal) closeCamera();
});
window.addEventListener('pagehide', () => {
  closeCamera();
  resetOCRWorker();
});

function showScanStatus(message, closeAfter = 0) {
  clearTimeout(cameraTimer);
  ocrStatus.style.display = 'flex';
  ocrStatus.textContent = message;
  if (closeAfter) cameraTimer = setTimeout(closeCamera, closeAfter);
}

function getCaptureCanvas() {
  const width = cameraVideo.videoWidth;
  const height = cameraVideo.videoHeight;
  // Match the guide drawn over the object-contain video, including letterboxing.
  const videoRect = cameraVideo.getBoundingClientRect();
  const guideRect = document.getElementById('camera-guide').getBoundingClientRect();
  const scale = Math.min(videoRect.width / width, videoRect.height / height);
  const left = videoRect.left + (videoRect.width - width * scale) / 2;
  const top = videoRect.top + (videoRect.height - height * scale) / 2;
  const x = Math.max(0, (guideRect.left - left) / scale);
  const y = Math.max(0, (guideRect.top - top) / scale);
  const right = Math.min(width, (guideRect.right - left) / scale);
  const bottom = Math.min(height, (guideRect.bottom - top) / scale);
  const cropWidth = right - x;
  const cropHeight = bottom - y;
  if (!(cropWidth > 0 && cropHeight > 0)) throw new Error('Camera guide is outside the video');
  // Bound the transferred image; the worker handles upscaling and enhancement once.
  const outputScale = Math.min(1, 1600 / Math.max(cropWidth, cropHeight));
  cameraCanvas.width = Math.max(1, Math.round(cropWidth * outputScale));
  cameraCanvas.height = Math.max(1, Math.round(cropHeight * outputScale));
  cameraCanvas.getContext('2d').drawImage(cameraVideo, x, y, cropWidth, cropHeight,
    0, 0, cameraCanvas.width, cameraCanvas.height);
  return cameraCanvas;
}

function initOCRWorker() {
  if (ocrWorker) return ocrWorker;
  const worker = new Worker('ocr-worker.js');
  ocrWorker = worker;
  worker.onmessage = ({ data }) => {
    if (ocrWorker !== worker) return;
    const entry = pendingOCR.get(data.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingOCR.delete(data.id);
    if (data.error) {
      resetOCRWorker(new Error(data.error));
      entry.reject(new Error(data.error));
    } else {
      entry.resolve(data.result);
    }
  };
  worker.onerror = () => {
    if (ocrWorker === worker) resetOCRWorker(new Error('Unable to load OCR worker. Please retry.'));
  };
  worker.onmessageerror = () => {
    if (ocrWorker === worker) resetOCRWorker(new Error('Unable to read OCR response. Please retry.'));
  };
  return worker;
}

function runOCROnCanvas(canvas, session, timeoutMs = 60000) {
  const worker = initOCRWorker();
  const id = ++nextOCRId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resetOCRWorker(new Error('Scan timed out. Please retry.')), timeoutMs);
    pendingOCR.set(id, { resolve, reject, timer });
    // Transfer pixels when possible; PNG Blob input also works without OffscreenCanvas.
    const canTransfer = typeof createImageBitmap === 'function' && typeof OffscreenCanvas !== 'undefined';
    const imagePromise = canTransfer ? Promise.resolve().then(() => createImageBitmap(canvas)) : new Promise((res, rej) => {
      canvas.toBlob(blob => blob ? res(blob) : rej(new Error('Unable to capture image')), 'image/png');
    });
    imagePromise.then(image => {
      if (!pendingOCR.has(id) || session !== cameraSession) {
        if (typeof image.close === 'function') image.close();
        return;
      }
      try {
        worker.postMessage({ type: 'recognize', id, image }, canTransfer ? [image] : []);
      } catch (error) {
        if (typeof image.close === 'function') image.close();
        throw error;
      }
    }).catch(error => {
      if (pendingOCR.has(id)) resetOCRWorker(error);
    });
  });
}

captureBtn.addEventListener('click', async () => {
  if (captureBtn.disabled) return;
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    showScanStatus('Camera not ready. Try again.');
    return;
  }
  const session = cameraSession;
  captureBtn.disabled = true;
  ocrCandidates.style.display = 'none';
  showScanStatus('Reading numbers… The first scan may take longer.');
  try {
    const result = await runOCROnCanvas(getCaptureCanvas(), session);
    if (session !== cameraSession) return;
    const candidates = result?.candidates || [];
    if (!candidates.length) {
      showScanStatus('No usable amount found. Try again.');
      captureBtn.disabled = false;
      return;
    }
    const [top, runnerUp] = candidates;
    // A ranking score is not a confidence percentage. Require both confidence and separation.
    if (top.confidence >= 90 && top.score >= 120 && (!runnerUp || top.score - runnerUp.score >= 25)) {
      applyExtractedValue(top.value);
      showScanStatus('✓ Number detected: ' + formatNumber(top.value), 1200);
    } else {
      showCandidateOptions(candidates);
    }
  } catch (error) {
    if (session !== cameraSession) return;
    console.error('OCR error:', error);
    showScanStatus('Unable to read image. Please retry.');
    captureBtn.disabled = false;
  }
});

function formatNumber(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function applyExtractedValue(value) {
  secondCurrency.value = Number(value).toFixed(getDisplayPrecision(currencySelect.value));
  inputSource = 'second';
  recalculateInputs();
}

// Render candidate buttons for user to choose
function showCandidateOptions(candidates) {
  const container = ocrCandidates;
  container.innerHTML = '';
  container.style.display = 'flex';
  ocrStatus.style.display = 'none';

  candidates.slice(0, 3).forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'px-4 py-2 rounded-xl bg-nm-bg text-nm-text border border-white/40 hover:bg-black/5';
    btn.textContent = `${formatNumber(c.value)}  — confidence ${Math.round(c.confidence)}`;
    btn.addEventListener('click', () => {
      container.style.display = 'none';
      applyExtractedValue(c.value);
      showScanStatus('✓ Selected: ' + formatNumber(c.value), 900);
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
