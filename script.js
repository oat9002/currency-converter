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

// Extract numbers from text
function extractNumbers(text) {
  // Remove all non-numeric characters except dots, commas, and spaces
  // This handles formats like "1,234.56" or "1234.56" or "1 234.56"
  const cleaned = text.replace(/[^\d.,\s]/g, '');
  // Find all number patterns (including decimals and commas)
  const numberPatterns = cleaned.match(/[\d.,]+/g);
  if (!numberPatterns || numberPatterns.length === 0) {
    return null;
  }
  
  // Get the largest number (likely the main amount)
  let largestNumber = null;
  let largestValue = 0;
  
  numberPatterns.forEach(pattern => {
    // Replace comma with nothing (handle thousand separators)
    const numStr = pattern.replace(/,/g, '');
    const num = parseFloat(numStr);
    if (!isNaN(num) && num > largestValue) {
      largestValue = num;
      largestNumber = num;
    }
  });
  
  return largestNumber;
}

// Capture photo and perform OCR
captureBtn.addEventListener('click', async function() {
  const context = cameraCanvas.getContext('2d');
  cameraCanvas.width = cameraVideo.videoWidth;
  cameraCanvas.height = cameraVideo.videoHeight;
  context.drawImage(cameraVideo, 0, 0);
  
  // Show OCR status
  ocrStatus.style.display = 'flex';
  captureBtn.disabled = true;
  
  try {
    // Helper: preprocess - upscale + grayscale
    function preprocessCanvas(srcCanvas, scale = 2) {
      const w = srcCanvas.width * scale;
      const h = srcCanvas.height * scale;
      const tmp = document.createElement('canvas');
      tmp.width = w;
      tmp.height = h;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(srcCanvas, 0, 0, w, h);
      return tmp;
    }

    // Helper: median denoise (grayscale)
    function medianDenoise(canvas, radius = 1) {
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, w, h);
      const data = img.data;
      const out = new Uint8ClampedArray(data.length);
      // convert to grayscale array
      const gray = new Uint8ClampedArray(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const r = data[i], g = data[i+1], b = data[i+2];
        gray[p] = Math.round(0.299*r + 0.587*g + 0.114*b);
      }
      const getIndex = (x,y) => y*w + x;
      const window = [];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          window.length = 0;
          for (let oy = -radius; oy <= radius; oy++) {
            for (let ox = -radius; ox <= radius; ox++) {
              const nx = Math.min(w-1, Math.max(0, x+ox));
              const ny = Math.min(h-1, Math.max(0, y+oy));
              window.push(gray[getIndex(nx, ny)]);
            }
          }
          window.sort((a,b)=>a-b);
          const med = window[Math.floor(window.length/2)];
          const p = getIndex(x,y);
          const v = med;
          out[p*4] = out[p*4+1] = out[p*4+2] = v;
          out[p*4+3] = 255;
        }
      }
      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      return canvas;
    }

    // Helper: adaptive mean threshold using integral image for speed
    function adaptiveBinarize(canvas, blockSize = 25, C = 10) {
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, w, h);
      const data = img.data;
      const gray = new Float64Array(w * h);
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        gray[p] = data[i]; // assume already grayscale
      }
      // build integral image
      const integral = new Float64Array(w * h);
      for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
          const idx = y*w + x;
          rowSum += gray[idx];
          integral[idx] = rowSum + (y>0 ? integral[idx - w] : 0);
        }
      }
      const half = Math.floor(blockSize/2);
      const out = new Uint8ClampedArray(data.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const x1 = Math.max(0, x - half);
          const y1 = Math.max(0, y - half);
          const x2 = Math.min(w-1, x + half);
          const y2 = Math.min(h-1, y + half);
          const area = (x2 - x1 + 1) * (y2 - y1 + 1);
          const A = y1*w + x1;
          const B = y1*w + x2;
          const Cidx = y2*w + x1;
          const D = y2*w + x2;
          const sum = integral[D] - (x1>0 ? integral[B] : 0) - (y1>0 ? integral[Cidx] : 0) + ((x1>0 && y1>0) ? integral[A - w - x1 + 1] : 0);
          // fallback for boundaries (safe but a bit hacky)
          const mean = sum / area;
          const p = y*w + x;
          const v = gray[p] > (mean - C) ? 255 : 0;
          out[p*4] = out[p*4+1] = out[p*4+2] = v;
          out[p*4+3] = 255;
        }
      }
      ctx.putImageData(new ImageData(out, w, h), 0, 0);
      return canvas;
    }

    // Helper: auto-crop to non-white content
    function autoCropToContent(canvas, pad = 0.05) {
      const w = canvas.width, h = canvas.height;
      const ctx = canvas.getContext('2d');
      const img = ctx.getImageData(0, 0, w, h);
      const data = img.data;
      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idx = (y*w + x) * 4;
          const v = data[idx];
          if (v < 250) { // dark pixel
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < minX || maxY < minY) return canvas; // nothing detected
      const padX = Math.round((maxX - minX) * pad);
      const padY = Math.round((maxY - minY) * pad);
      const sx = Math.max(0, minX - padX);
      const sy = Math.max(0, minY - padY);
      const sw = Math.min(w - sx, (maxX - minX) + 2*padX);
      const sh = Math.min(h - sy, (maxY - minY) + 2*padY);
      const out = document.createElement('canvas');
      out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      return out;
    }

    // Run multiple PSM values and pick best by numeric density + confidence
    async function runMultiPSM(canvas) {
      const psmCandidates = [6, 7, 11, 3];
      let best = { score: -Infinity, text: '' };
      for (const psm of psmCandidates) {
        try {
          const { data: result } = await Tesseract.recognize(canvas.toDataURL('image/png'), 'eng', {
            logger: m => {
              if (m.status === 'recognizing text') console.log(`PSM ${psm} progress:`, Math.round(m.progress*100)+'%');
            },
            tessedit_char_whitelist: '0123456789.,',
            psm: psm
          });
          const txt = result.text || '';
          const digits = (txt.match(/[0-9]/g) || []).length;
          let avgConf = 0;
          if (result.words && result.words.length > 0) {
            avgConf = result.words.reduce((s,w)=>s + (w.confidence||0), 0) / result.words.length;
          }
          const score = digits * 2 + (avgConf / 50);
          console.log(`PSM ${psm} -> digits=${digits}, avgConf=${avgConf.toFixed(1)}, score=${score.toFixed(2)}`);
          if (score > best.score) {
            best = { score, text: txt, psm };
          }
        } catch (err) {
          console.warn('Tesseract run failed for psm', psm, err);
        }
      }
      return best;
    }

    // Pipeline: preprocess -> denoise -> adaptive binarize -> crop -> OCR
    const stepCanvas = preprocessCanvas(cameraCanvas, 2);
    medianDenoise(stepCanvas, 1);
    adaptiveBinarize(stepCanvas, 25, 8);
    const cropped = autoCropToContent(stepCanvas);
    const bestResult = await runMultiPSM(cropped);
    const text = bestResult.text || '';
    console.log('OCR Text (best):', bestResult.psm, bestResult.score, text);
    
    // Extract numbers from the OCR text
    const extractedNumber = extractNumbers(text);
    
    if (extractedNumber !== null && !isNaN(extractedNumber)) {
      // Get the selected currency
      const selectedCurrency = currencySelect.value;
      
      // Populate the source currency field with the extracted number
      const precision = getDisplayPrecision(selectedCurrency);
      secondCurrency.value = extractedNumber.toFixed(precision);
      
      // Trigger conversion from source currency to THB
      const val = parseFloat(secondCurrency.value);
      if (val) {
        lastEdited = 'second';
        const converted = convertToTHB(val, selectedCurrency);
        thb.value = converted.toFixed(2);
        lastEdited = null;
      }
      
      // Show success message briefly
      const currencyName = selectedCurrency.toUpperCase();
      ocrStatus.innerHTML = '<span style="color: #4caf50;">✓ Number detected: ' + extractedNumber.toFixed(2) + ' ' + currencyName + '</span>';
      setTimeout(() => {
        closeCamera();
      }, 1500);
    } else {
      ocrStatus.innerHTML = '<span style="color: #ff3b30;">No numbers found. Try again.</span>';
      setTimeout(() => {
        ocrStatus.style.display = 'none';
        captureBtn.disabled = false;
      }, 2000);
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

// Theme toggle functionality
function initThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');
  const body = document.body;

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
