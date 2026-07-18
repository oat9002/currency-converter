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
  jpy: null
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
  if (currency === 'idr') return exchangeRates.idr;
  if (currency === 'php') return exchangeRates.php;
  if (currency === 'jpy') return exchangeRates.jpy;
  return null;
}

function applyRates(ratesData) {
  exchangeRates = {
    idr: ratesData.idr ?? null,
    php: ratesData.php ?? null,
    jpy: ratesData.jpy ?? null
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
      jpy: data?.thb?.jpy ?? null
    };

    if (fetchedRates.idr && fetchedRates.php && fetchedRates.jpy) {
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

// Update the display based on selected currency
function updateCurrencyDisplay() {
  const selectedCurrency = currencySelect.value;
  const selectedRate = getSelectedRate(selectedCurrency);
  const rateText = selectedRate ? selectedRate.toFixed(2) : '—';
  const inverseRateText = selectedRate ? (1 / selectedRate).toFixed(4) : '—';
  const currencyLabel = selectedCurrency.toUpperCase();
  
  if (selectedCurrency === 'idr') {
    secondCurrencyLabel.innerHTML = 'IDR <span id="second-currency-rate" class="rate-info"></span>';
  } else if (selectedCurrency === 'php') {
    secondCurrencyLabel.innerHTML = 'PHP <span id="second-currency-rate" class="rate-info"></span>';
  } else if (selectedCurrency === 'jpy') {
    secondCurrencyLabel.innerHTML = 'JPY <span id="second-currency-rate" class="rate-info"></span>';
  }

  const thbRateElement = document.getElementById('thb-rate');
  if (thbRateElement) {
    thbRateElement.textContent = selectedRate ? `(1 THB = ${rateText} ${currencyLabel})` : '(loading rate...)';
  }
  
  // Update rate reference after DOM update
  const rateElement = document.getElementById('second-currency-rate');
  if (rateElement) {
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
    if (selectedCurrency === 'idr' || selectedCurrency === 'jpy') {
      secondCurrency.value = converted.toFixed(0);
    } else {
      secondCurrency.value = converted.toFixed(2);
    }
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
    // Convert canvas to image data for Tesseract
    const imageData = cameraCanvas.toDataURL('image/png');
    
    // Perform OCR using Tesseract.js
    const { data: { text } } = await Tesseract.recognize(imageData, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          // You can update progress here if needed
          console.log('OCR progress:', Math.round(m.progress * 100) + '%');
        }
      }
    });
    
    console.log('OCR Text:', text);
    
    // Extract numbers from the OCR text
    const extractedNumber = extractNumbers(text);
    
    if (extractedNumber !== null && !isNaN(extractedNumber)) {
      // Get the selected currency
      const selectedCurrency = currencySelect.value;
      
      // Populate the source currency field (IDR, PHP, or JPY) with the extracted number
      if (selectedCurrency === 'idr' || selectedCurrency === 'jpy') {
        secondCurrency.value = extractedNumber.toFixed(0);
      } else {
        secondCurrency.value = extractedNumber.toFixed(2);
      }
      
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
