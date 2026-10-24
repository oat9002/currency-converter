// Each currency must name a supported interface language, including the THB base.
globalThis.CurrencyConverterConfig = {
  baseCurrency: 'thb',
  currencies: {
    thb: { precision: 2, language: 'th' },
    idr: { precision: 0, language: 'id' },
    php: { precision: 2, language: 'fil' },
    jpy: { precision: 0, language: 'ja' },
    myr: { precision: 2, language: 'ms' },
    cny: { precision: 2, language: 'zh-Hans' },
    krw: { precision: 0, language: 'ko' },
    sgd: { precision: 2, language: 'en' },
    hkd: { precision: 2, language: 'zh-Hant' },
    vnd: { precision: 0, language: 'vi' }
  },
  languages: {
    th: { name: 'ไทย', locale: 'th-TH' },
    id: { name: 'Bahasa Indonesia', locale: 'id-ID' },
    fil: { name: 'Filipino', locale: 'fil-PH' },
    ja: { name: '日本語', locale: 'ja-JP' },
    ms: { name: 'Bahasa Melayu', locale: 'ms-MY' },
    'zh-Hans': { name: '简体中文', locale: 'zh-CN' },
    ko: { name: '한국어', locale: 'ko-KR' },
    en: { name: 'English', locale: 'en-SG' },
    'zh-Hant': { name: '繁體中文（香港）', locale: 'zh-HK' },
    vi: { name: 'Tiếng Việt', locale: 'vi-VN' }
  }
};
