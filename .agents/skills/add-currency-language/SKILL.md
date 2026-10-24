---
name: add-currency-language
description: Add a supported currency to this currency converter together with its corresponding interface language, translations, formatting, and validation. Use when adding currencies or maintaining their language mappings in this repository.
---

# Add a currency and its language

A currency addition is complete only when its corresponding interface language is available. Include the THB base currency when checking language coverage.

## Source of truth

- `app-config.js` defines `baseCurrency`, each currency's `precision` and `language`, and each language's native `name` and BCP 47 `locale`.
- `translations.js` contains complete interface dictionaries. English defines the required keys and interpolation placeholders.
- `i18n.js` derives offered languages from currency mappings; `script.js` derives target currency options, exchange-rate normalization, and precision from the same registry. `ocr-worker.js` derives recognized currency-code affixes from it as well.

## Making an addition

1. Verify that the existing THB exchange-rate API returns a finite positive rate for the new lowercase ISO currency code. Add its precision and language mapping in `app-config.js`.
2. Reuse an existing language when appropriate. Otherwise add its native display name and locale, plus a complete dictionary in `translations.js`. Do not silently substitute English for the requested new language. Preserve every interpolation placeholder (`{amount}`, `{from}`, `{rate}`, `{to}`) and translate page metadata, accessible labels, camera states, OCR choice instructions, and retry actions.
3. If the language needs a regional/script alias, extend `resolveLanguage` in `i18n.js` and test it. CNY uses Simplified Chinese; HKD uses Traditional Chinese for Hong Kong. Language selection remains independent of currency selection and persists in `currencyConverter_state.language`.
4. Keep editable number inputs machine-readable (`toFixed` with a decimal point). Localize displayed rates and OCR amounts through the existing `Intl.NumberFormat` helpers. Keep confidence values internal and retain the visible instruction to choose an OCR amount. UI language does not automatically require downloading an additional OCR recognition model.
5. Run `npm test` and `npm run build`. The i18n tests must verify every currency has a language and every offered language has all keys and matching placeholders. Add meaningful conversion, persistence, or alias coverage needed by the addition. Check the new language in the browser, including long labels and a narrow viewport.
6. Update `version.json` and the cache version in `sw.js` together so cached clients receive the change. Keep any new runtime files in `PRECACHE_URLS`. Preserve unrelated working changes. Commit, push, or deploy only when requested.
