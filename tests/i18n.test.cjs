const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadApp } = require('./app-fixture.cjs');

function placeholders(value) { return [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort(); }

function loadStartupGuard() {
  const html = fs.readFileSync('index.html', 'utf8');
  const source = html.match(/<script id="language-startup">([\s\S]*?)<\/script>/)[1];
  const root = { dataset: {} };
  const listeners = {};
  let fallback;
  let cancelled = false;
  const context = vm.createContext({
    document: { documentElement: root },
    window: { addEventListener(type, callback) { listeners[type] = callback; } },
    setTimeout(callback, delay) { fallback = callback; assert.equal(delay, 5000); return 1; },
    clearTimeout(id) { assert.equal(id, 1); cancelled = true; }
  });
  vm.runInContext(source, context);
  return { html, root, listeners, fallback, context, cancelled: () => cancelled };
}

test('startup hides the fallback before body parsing and reveals after the initial language is applied', () => {
  for (const [saved, browser, expected] of [
    ['vi', ['th-TH'], 'vi-VN'],
    [null, ['th-TH'], 'th-TH'],
    ['unsupported', ['de-DE'], 'en-SG']
  ]) {
    const guard = loadStartupGuard();
    assert.ok(guard.html.indexOf('id="language-startup"') < guard.html.indexOf('<body'));
    assert.match(guard.html, /html\[data-language-pending\] body\s*\{\s*visibility: hidden;/);
    assert.ok('languagePending' in guard.root.dataset);
    const { context } = loadApp({
      navigator: { languages: browser, onLine: true },
      CurrencyConverterStartup: guard.context.CurrencyConverterStartup
    }, { language: saved });
    assert.equal(context.document.documentElement.lang, expected);
    assert.equal(context.document.title, context.CurrencyConverterI18n.t('pageTitle'));
    assert.ok(!('languagePending' in guard.root.dataset));
    assert.ok(guard.cancelled());
  }
});

test('startup reveals the fallback if scripts fail to load or stall', () => {
  for (const trigger of [guard => guard.listeners.load(), guard => guard.fallback()]) {
    const guard = loadStartupGuard();
    trigger(guard);
    assert.ok(!('languagePending' in guard.root.dataset));
    assert.ok(guard.cancelled());
    assert.doesNotThrow(() => guard.context.CurrencyConverterStartup.reveal());
  }
});

test('every currency has a language and every offered language has a complete translation dictionary', () => {
  const { context, element } = loadApp();
  const { currencies, languages, baseCurrency } = context.CurrencyConverterConfig;
  const messages = context.CurrencyConverterMessages;
  const expectedLanguages = [...new Set(Object.values(currencies).map(currency => currency.language))];
  assert.equal(currencies[baseCurrency].language, 'th');
  assert.deepEqual(element('currency-select').children.map(option => option.value), Object.keys(currencies));
  assert.deepEqual(element('language-select').children.map(option => option.value), expectedLanguages);
  for (const [code, currency] of Object.entries(currencies)) {
    assert.match(code, /^[a-z]{3}$/);
    assert.ok(Number.isInteger(currency.precision) && currency.precision >= 0);
    assert.ok(languages[currency.language], code + ' needs a language definition');
  }
  for (const language of expectedLanguages) {
    assert.ok(languages[language].name.trim());
    assert.match(languages[language].ocr, /^[a-z_]+$/, language + ' needs an OCR model');
    assert.doesNotThrow(() => new Intl.NumberFormat(languages[language].locale));
    assert.ok(messages[language], language + ' needs translations');
    assert.deepEqual(Object.keys(messages[language]).sort(), Object.keys(messages.en).sort(), language);
    for (const [key, value] of Object.entries(messages[language])) {
      assert.ok(typeof value === 'string' && value.trim(), `${language}.${key}`);
      assert.deepEqual(placeholders(value), placeholders(messages.en[key]), `${language}.${key}`);
    }
  }
  const html = fs.readFileSync('index.html', 'utf8');
  for (const match of html.matchAll(/data-i18n(?:-aria-label)?="([^"]+)"/g)) assert.ok(messages.en[match[1]], match[1]);
});

test('language matching respects saved choice, browser order, Chinese scripts, and Filipino alias', () => {
  const { context } = loadApp();
  const i18n = context.CurrencyConverterI18n;
  for (const [requested, expected] of [
    ['zh-TW', 'zh-Hant'], ['zh-HK', 'zh-Hant'], ['zh-Hant-TW', 'zh-Hant'],
    ['zh-CN', 'zh-Hans'], ['zh-SG', 'zh-Hans'], ['th-TH', 'th'], ['tl-PH', 'fil'],
    ['en-US', 'en'], ['ja_JP', 'ja'], ['de-DE', null], [null, null]
  ]) assert.equal(i18n.resolveLanguage(requested), expected);
  assert.equal(i18n.initialLanguage('vi', ['th-TH']), 'vi');
  assert.equal(i18n.initialLanguage('removed-language', ['de-DE', 'ko-KR']), 'ko');
  assert.equal(i18n.initialLanguage(null, ['de-DE']), 'en');
  assert.equal(i18n.setLanguage('unsupported'), false);
});

test('changing language preserves amounts, currency, theme, and cached rates, and saves preference', () => {
  const { context, element, state } = loadApp({}, { selectedCurrency: 'vnd', theme: 'dark', rates: { vnd: 750 }, ratesTimestamp: Date.now() });
  element('thb').value = '100';
  element('thb').listeners.input();
  const originalAmount = element('second-currency').value;
  element('language-select').value = 'vi';
  element('language-select').listeners.change();
  assert.equal(context.document.documentElement.lang, 'vi-VN');
  assert.equal(context.document.title, 'Chuyển đổi tiền tệ');
  assert.equal(state().language, 'vi');
  assert.equal(state().theme, 'dark');
  assert.equal(state().rates.vnd, 750);
  assert.equal(element('currency-select').value, 'vnd');
  assert.equal(element('thb').value, '100');
  assert.equal(element('second-currency').value, originalAmount);
  assert.equal(context.formatNumber(1234.5), '1.234,5');
  const reloaded = loadApp({}, state());
  assert.equal(reloaded.context.document.documentElement.lang, 'vi-VN');
  assert.equal(reloaded.element('language-select').value, 'vi');
});

test('every language renders OCR choices, retry action, status, and rate labels without confidence values', () => {
  const { context, element } = loadApp();
  context.applyRates({ vnd: 750.25 });
  for (const code of context.CurrencyConverterI18n.supportedLanguages) {
    element('language-select').value = code;
    element('language-select').listeners.change();
    const t = context.CurrencyConverterI18n.t;
    context.showCandidateOptions([{ value: 75025, confidence: 73, score: 130 }]);
    const [prompt, amount, retry] = element('ocr-candidates').children;
    assert.equal(prompt.textContent, t('chooseAmount'));
    assert.equal(amount.textContent, context.formatNumber(75025));
    assert.equal(retry.textContent, t('retry'));
    amount.listeners.click();
    assert.equal(element('ocr-status').textContent, t('selected', { amount: 75025 }));
    assert.equal(element('thb').value, '100.00');
    assert.match(element('thb-rate').textContent, /THB.*VND/);
    context.closeCamera();
  }
});

test('visible OCR choices and statuses update when the interface language changes', () => {
  const { context, element } = loadApp();
  context.showCandidateOptions([{ value: 1234.5, confidence: 73, score: 130 }]);
  element('language-select').value = 'id';
  element('language-select').listeners.change();
  assert.equal(element('ocr-candidates').children[0].textContent, 'Pilih nominal yang benar:');
  assert.equal(element('ocr-candidates').children[1].textContent, '1.234,5');
  element('ocr-candidates').style.display = 'none';
  context.showScanStatus('noAmount');
  element('language-select').value = 'vi';
  element('language-select').listeners.change();
  assert.equal(element('ocr-status').textContent, context.CurrencyConverterMessages.vi.noAmount);
});

test('unknown message keys fall back safely, and initial browser language changes metadata', () => {
  const { context, element } = loadApp({ navigator: { languages: ['de-DE', 'th-TH'] } });
  assert.equal(element('language-select').value, 'th');
  assert.equal(context.document.documentElement.lang, 'th-TH');
  assert.equal(context.CurrencyConverterI18n.t('unknownKey'), 'unknownKey');
  assert.equal(context.CurrencyConverterI18n.t('detected', { amount: 100 }), '✓ พบจำนวนเงิน: 100');
});
