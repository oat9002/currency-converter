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
