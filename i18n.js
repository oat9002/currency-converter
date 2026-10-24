// Small, local dictionaries work offline and do not need a translation service.
(() => {
  const { currencies, languages } = CurrencyConverterConfig;
  const supportedLanguages = [...new Set(Object.values(currencies).map(currency => currency.language))];
  let language = 'en';
  const formatters = new Map();

  function resolveLanguage(requested) {
    if (typeof requested !== 'string') return null;
    const normalized = requested.replace(/_/g, '-').toLowerCase();
    const exact = supportedLanguages.find(code => code.toLowerCase() === normalized ||
      languages[code].locale.toLowerCase() === normalized);
    if (exact) return exact;
    if (/^zh(?:-|$)/.test(normalized)) {
      return /(?:^|-)(hant|hk|mo|tw)(?:-|$)/.test(normalized) ? 'zh-Hant' : 'zh-Hans';
    }
    const base = normalized.split('-')[0];
    if (base === 'tl') return 'fil';
    return supportedLanguages.includes(base) ? base : null;
  }

  function initialLanguage(saved, browserLanguages = []) {
    return resolveLanguage(saved) || Array.from(browserLanguages).map(resolveLanguage).find(Boolean) || 'en';
  }

  function setLanguage(requested) {
    const resolved = resolveLanguage(requested);
    if (!resolved) return false;
    language = resolved;
    return true;
  }

  function formatNumber(value, precision = null) {
    const key = `${language}:${precision}`;
    if (!formatters.has(key)) {
      formatters.set(key, new Intl.NumberFormat(languages[language].locale, {
        minimumFractionDigits: precision ?? 0,
        maximumFractionDigits: precision ?? 2
      }));
    }
    return formatters.get(key).format(Number(value));
  }

  function t(key, params = {}) {
    const template = CurrencyConverterMessages[language]?.[key] ?? CurrencyConverterMessages.en[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (match, name) => {
      const value = params[name];
      return value === undefined ? match : typeof value === 'number' ? formatNumber(value) : String(value);
    });
  }

  globalThis.CurrencyConverterI18n = {
    supportedLanguages, resolveLanguage, initialLanguage, setLanguage, formatNumber, t,
    get language() { return language; },
    get locale() { return languages[language].locale; }
  };
})();
