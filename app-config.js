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
    th: { name: 'ไทย', locale: 'th-TH', ocr: 'tha' },
    id: { name: 'Bahasa Indonesia', locale: 'id-ID', ocr: 'ind' },
    fil: { name: 'Filipino', locale: 'fil-PH', ocr: 'fil' },
    ja: { name: '日本語', locale: 'ja-JP', ocr: 'jpn' },
    ms: { name: 'Bahasa Melayu', locale: 'ms-MY', ocr: 'msa' },
    'zh-Hans': { name: '简体中文', locale: 'zh-CN', ocr: 'chi_sim' },
    ko: { name: '한국어', locale: 'ko-KR', ocr: 'kor' },
    en: { name: 'English', locale: 'en-SG', ocr: 'eng' },
    'zh-Hant': { name: '繁體中文（香港）', locale: 'zh-HK', ocr: 'chi_tra' },
    vi: { name: 'Tiếng Việt', locale: 'vi-VN', ocr: 'vie' }
  }
};
