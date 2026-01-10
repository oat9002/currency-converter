// Set your conversion rates here
// Base currency: THB
const RATE_IDR_PER_THB = 535.46;  // 1 THB = 535.46 IDR
const RATE_PHP_PER_THB = 1.88;    // 1 THB = 1.88 PHP

// LocalStorage key
const STORAGE_KEY = 'currencyConverter_selectedCurrency';

// Get elements
const thb = document.getElementById('thb');
const secondCurrency = document.getElementById('second-currency');
const secondCurrencyLabel = document.getElementById('second-currency-label');
const secondCurrencyRate = document.getElementById('second-currency-rate');
const currencySelect = document.getElementById('currency-select');
let lastEdited = null;

// Load saved currency selection from localStorage
function loadSavedCurrency() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'idr' || saved === 'php') {
    currencySelect.value = saved;
  }
  updateCurrencyDisplay();
}

// Save currency selection to localStorage
function saveCurrencySelection(currency) {
  localStorage.setItem(STORAGE_KEY, currency);
}

// Update the display based on selected currency
function updateCurrencyDisplay() {
  const selectedCurrency = currencySelect.value;
  
  if (selectedCurrency === 'idr') {
    secondCurrencyLabel.innerHTML = 'IDR <span id="second-currency-rate" class="rate-info"></span>';
    document.getElementById('thb-rate').textContent = `(1 THB = ${RATE_IDR_PER_THB.toFixed(2)} IDR)`;
  } else if (selectedCurrency === 'php') {
    secondCurrencyLabel.innerHTML = 'PHP <span id="second-currency-rate" class="rate-info"></span>';
    document.getElementById('thb-rate').textContent = `(1 THB = ${RATE_PHP_PER_THB.toFixed(2)} PHP)`;
  }
  
  // Update rate reference after DOM update
  const rateElement = document.getElementById('second-currency-rate');
  if (rateElement) {
    if (selectedCurrency === 'idr') {
      rateElement.textContent = `(1 IDR = ${(1 / RATE_IDR_PER_THB).toFixed(4)} THB)`;
    } else {
      rateElement.textContent = `(1 PHP = ${(1 / RATE_PHP_PER_THB).toFixed(4)} THB)`;
    }
  }
  
  // Clear the second currency input when switching
  secondCurrency.value = '';
}

// Conversion functions
function convertFromTHB(thbValue, targetCurrency) {
  if (targetCurrency === 'idr') {
    return thbValue * RATE_IDR_PER_THB;
  } else if (targetCurrency === 'php') {
    return thbValue * RATE_PHP_PER_THB;
  }
  return 0;
}

function convertToTHB(secondCurrencyValue, sourceCurrency) {
  if (sourceCurrency === 'idr') {
    return secondCurrencyValue / RATE_IDR_PER_THB;
  } else if (sourceCurrency === 'php') {
    return secondCurrencyValue / RATE_PHP_PER_THB;
  }
  return 0;
}

// Initialize on page load
loadSavedCurrency();

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
    if (selectedCurrency === 'idr') {
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
      
      // Populate the source currency field (IDR or PHP) with the extracted number
      if (selectedCurrency === 'idr') {
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
