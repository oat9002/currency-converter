// Exchange rates
const API_URL = 'https://latest.currency-api.pages.dev/v1/currencies/thb.json';
const STORAGE_KEY = 'currencyConverter_state';
const RATES_TTL_MS = 24 * 60 * 60 * 1000;
const { currencies: CURRENCIES, baseCurrency: BASE_CURRENCY } = CurrencyConverterConfig;
const CURRENCY_CODES = Object.keys(CURRENCIES).filter(code => code !== BASE_CURRENCY);
const I18N = CurrencyConverterI18n;
I18N.setLanguage(I18N.initialLanguage(readStorageState().language, navigator.languages || [navigator.language]));

// Get elements
const thb = document.getElementById('thb');
const secondCurrency = document.getElementById('second-currency');
const secondCurrencyLabel = document.getElementById('second-currency-label');
const secondCurrencyRate = document.getElementById('second-currency-rate');
const currencyName = secondCurrencyLabel.querySelector('span');
const thbRateElement = document.getElementById('thb-rate');
const currencySelect = document.getElementById('currency-select');
const languageSelect = document.getElementById('language-select');
const ratesStatus = document.getElementById('rates-status');
let exchangeRates = normalizeRates();
let inputSource = 'thb';
let rateSourceDate = null;
let rateFetchedAt = null;
let ratesFromCache = false;
let ratesLoading = true;
let ratesRequestFailed = false;
let rateRequestId = 0;

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

function validRateDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

function getCachedRates() {
  const state = readStorageState();
  if (!state.rates || !Object.values(normalizeRates(state.rates)).some(rate => rate !== null)) return null;
  // Expired rates remain useful offline, but their original age must stay visible.
  return { rates: state.rates, date: validRateDate(state.ratesDate), timestamp: Number(state.ratesTimestamp) || null };
}

function saveRatesToCache(ratesData, sourceDate) {
  const state = readStorageState();
  state.rates = ratesData;
  state.ratesDate = sourceDate;
  state.ratesTimestamp = Date.now();
  writeStorageState(state);
  return state.ratesTimestamp;
}

function updateRatesStatus() {
  const available = getSelectedRate(currencySelect.value) !== null;
  const parts = [];
  if (available) {
    const date = rateSourceDate && new Intl.DateTimeFormat(I18N.locale, {
      dateStyle: 'medium', timeZone: 'UTC'
    }).format(new Date(rateSourceDate + 'T00:00:00Z'));
    parts.push(date ? I18N.t('ratesAsOf', { date }) : I18N.t('ratesDateUnknown'));
    if (ratesFromCache) parts.push(I18N.t('ratesCached'));
    const ageFrom = rateSourceDate ? Date.parse(rateSourceDate + 'T00:00:00Z') : rateFetchedAt;
    if (ageFrom && Date.now() - ageFrom > RATES_TTL_MS) parts.push(I18N.t('ratesStale'));
  } else {
    parts.push(I18N.t(ratesLoading ? 'ratesLoading' : 'ratesUnavailable'));
  }
  if (navigator.onLine === false) parts.push(I18N.t('ratesOffline'));
  else if (ratesRequestFailed) parts.push(I18N.t('ratesUpdateFailed'));
  ratesStatus.textContent = parts.join(' · ');
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
  const requestId = ++rateRequestId;
  ratesLoading = true;
  ratesRequestFailed = false;
  const cached = getCachedRates();
  if (cached) {
    rateSourceDate = cached.date;
    rateFetchedAt = cached.timestamp;
    ratesFromCache = true;
    applyRates(cached.rates);
  }
  updateRatesStatus();

  try {
    // Rates have one cache: local storage, with the API's source date preserved.
    const response = await fetch(API_URL, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    const data = await response.json();
    if (requestId !== rateRequestId) return;
    const fetchedRates = normalizeRates(data?.thb);
    if (!Object.values(fetchedRates).some(rate => rate !== null)) throw new Error('No usable exchange rates');
    rateSourceDate = validRateDate(data.date);
    rateFetchedAt = saveRatesToCache(fetchedRates, rateSourceDate);
    ratesFromCache = false;
    applyRates(fetchedRates);
  } catch (error) {
    if (requestId !== rateRequestId) return;
    ratesRequestFailed = true;
    console.error('Unable to fetch exchange rates:', error);
  } finally {
    if (requestId === rateRequestId) {
      ratesLoading = false;
      updateRatesStatus();
    }
  }
}

window.addEventListener('offline', updateRatesStatus);
window.addEventListener('online', loadExchangeRates);

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
  return CURRENCIES[currency]?.precision ?? 2;
}

// Update the display based on selected currency
function updateCurrencyDisplay() {
  const selectedCurrency = currencySelect.value;
  const selectedRate = getSelectedRate(selectedCurrency);
  const rateText = selectedRate ? I18N.formatNumber(selectedRate, 2) : '—';
  const inverseRateText = selectedRate ? I18N.formatNumber(1 / selectedRate, 4) : '—';
  const currencyLabel = getCurrencyLabel(selectedCurrency);
  currencyName.textContent = currencyLabel;
  thbRateElement.textContent = selectedRate ? I18N.t('exchangeRate', { amount: 1, from: 'THB', rate: rateText, to: currencyLabel }) : I18N.t('rateUnavailable');
  secondCurrencyRate.textContent = selectedRate ? I18N.t('exchangeRate', { amount: 1, from: currencyLabel, rate: inverseRateText, to: 'THB' }) : I18N.t('rateUnavailable');
  updateRatesStatus();
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

currencySelect.replaceChildren(...CURRENCY_CODES.map(code => {
  const option = document.createElement('option');
  option.value = code;
  option.textContent = getCurrencyLabel(code);
  return option;
}));
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
let cameraActive = false;
let cameraSession = 0;
let cameraTimer = null;
let scanStatus = null;
let candidateChoices = [];
let ocrWorker = null;
let nextOCRId = 0;
const pendingOCR = new Map();

cameraBtn.addEventListener('click', async () => {
  if (cameraModal.open) return;
  const session = ++cameraSession;
  cameraActive = true;
  cameraModal.showModal();
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
    alert(I18N.t('cameraError'));
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

function cleanupCamera() {
  cameraActive = false;
  delete cameraModal.dataset.mode;
  ++cameraSession;
  clearTimeout(cameraTimer);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  cameraVideo.srcObject = null;
  ocrStatus.style.display = 'none';
  ocrCandidates.style.display = 'none';
  ocrCandidates.replaceChildren();
  scanStatus = null;
  candidateChoices = [];
  // Keep a ready worker for the next scan, but cancel unfinished work.
  if (pendingOCR.size) resetOCRWorker();
  captureBtn.disabled = false;
}

function closeCamera() {
  cleanupCamera();
  if (cameraModal.open) cameraModal.close();
}

cameraModal.addEventListener('cancel', event => {
  event.preventDefault();
  closeCamera();
});
cameraModal.addEventListener('close', () => {
  if (!cameraModal.open && cameraActive) cleanupCamera();
});

closeCameraBtn.addEventListener('click', closeCamera);
stopCameraBtn.addEventListener('click', closeCamera);
cameraModal.addEventListener('click', event => {
  if (event.target === cameraModal) closeCamera();
});
window.addEventListener('pagehide', () => {
  closeCamera();
  resetOCRWorker();
});

function showScanStatus(key, params = {}, closeAfter = 0) {
  clearTimeout(cameraTimer);
  scanStatus = { key, params };
  ocrStatus.style.display = 'flex';
  ocrStatus.textContent = I18N.t(key, params);
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
  const currency = currencySelect.value;
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
        worker.postMessage({ type: 'recognize', id, image, currency }, canTransfer ? [image] : []);
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
    showScanStatus('cameraNotReady');
    return;
  }
  const session = cameraSession;
  captureBtn.disabled = true;
  ocrCandidates.style.display = 'none';
  showScanStatus('readingFirst');
  try {
    const result = await runOCROnCanvas(getCaptureCanvas(), session);
    if (session !== cameraSession) return;
    const candidates = result?.candidates || [];
    if (!candidates.length) {
      showScanStatus('noAmount');
      captureBtn.disabled = false;
      return;
    }
    const [top, runnerUp] = candidates;
    // A ranking score is not a confidence percentage. Require both confidence and separation.
    if (top.confidence >= 90 && top.score >= 120 && (!runnerUp || top.score - runnerUp.score >= 25)) {
      applyExtractedValue(top.value);
      showScanStatus('detected', { amount: top.value }, 1200);
    } else {
      showCandidateOptions(candidates);
    }
  } catch (error) {
    if (session !== cameraSession) return;
    console.error('OCR error:', error);
    showScanStatus('scanError');
    captureBtn.disabled = false;
  }
});

function formatNumber(n) {
  return I18N.formatNumber(n);
}

function applyExtractedValue(value) {
  secondCurrency.value = Number(value).toFixed(getDisplayPrecision(currencySelect.value));
  inputSource = 'second';
  recalculateInputs();
}

// Render candidate buttons for user to choose
function showCandidateOptions(candidates) {
  candidateChoices = candidates;
  cameraModal.dataset.mode = 'choosing';
  const container = ocrCandidates;
  container.innerHTML = '';
  container.style.display = 'grid';
  ocrStatus.style.display = 'none';

  const prompt = document.createElement('p');
  prompt.id = 'ocr-choice-label';
  prompt.textContent = I18N.t('chooseAmount');
  container.appendChild(prompt);

  candidates.forEach(c => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ocr-choice px-4 py-2 rounded-xl bg-nm-bg text-nm-text border border-white/40 hover:bg-black/5';
    btn.textContent = formatNumber(c.value);
    btn.addEventListener('click', () => {
      container.style.display = 'none';
      applyExtractedValue(c.value);
      showScanStatus('selected', { amount: c.value }, 900);
    });
    container.appendChild(btn);
  });

  const retry = document.createElement('button');
  retry.type = 'button';
  retry.className = 'ocr-retry px-4 py-2 rounded-xl bg-nm-bg text-red-600 border border-white/40 hover:bg-black/5';
  retry.textContent = I18N.t('retry');
  retry.addEventListener('click', () => {
    delete cameraModal.dataset.mode;
    container.style.display = 'none';
    ocrStatus.style.display = 'none';
    captureBtn.disabled = false;
  });
  container.appendChild(retry);
}

// Native language names stay readable even when the current interface is unfamiliar.
function refreshLanguage() {
  document.documentElement.lang = I18N.locale;
  document.title = I18N.t('pageTitle');
  document.querySelector('meta[name="description"]').content = I18N.t('pageDescription');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = I18N.t(element.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-aria-label]').forEach(element => {
    element.setAttribute('aria-label', I18N.t(element.dataset.i18nAriaLabel));
  });
  languageSelect.value = I18N.language;
  updateCurrencyDisplay();
  if (scanStatus && ocrStatus.style.display !== 'none') {
    ocrStatus.textContent = I18N.t(scanStatus.key, scanStatus.params);
  }
  if (ocrCandidates.style.display === 'grid') showCandidateOptions(candidateChoices);
}

languageSelect.replaceChildren(...I18N.supportedLanguages.map(code => {
  const option = document.createElement('option');
  option.value = code;
  option.lang = CurrencyConverterConfig.languages[code].locale;
  option.textContent = CurrencyConverterConfig.languages[code].name;
  return option;
}));
languageSelect.addEventListener('change', () => {
  if (!I18N.setLanguage(languageSelect.value)) return;
  const state = readStorageState();
  state.language = I18N.language;
  writeStorageState(state);
  refreshLanguage();
});
refreshLanguage();

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
