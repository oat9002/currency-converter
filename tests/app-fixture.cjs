const fs = require('node:fs');
const vm = require('node:vm');

function loadApp(overrides = {}, initialState = { selectedCurrency: 'vnd' }) {
  const elements = new Map();
  const workers = [];
  let state = { ...initialState };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: id === 'currency-select' ? 'idr' : '', style: {}, children: [], listeners: {},
      querySelector() { return element(id + '-span'); },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      replaceChildren(...children) { this.children = children; if (id.endsWith('-select')) this.value = children[0]?.value || ''; },
      set innerHTML(value) { this.children = []; },
      setAttribute(name, value) { this[name] = value; },
      appendChild(child) { this.children.push(child); },
      toBlob(callback) { callback({ blob: true }); },
      getContext() { return { drawImage() {} }; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100 }; }
    });
    return elements.get(id);
  }
  class Worker {
    constructor() { workers.push(this); }
    postMessage(message) { this.message = message; }
    terminate() { this.terminated = true; }
  }
  const context = vm.createContext({
    console: { error() {}, warn() {} }, setTimeout, clearTimeout, AbortSignal, Worker,
    document: { documentElement: {}, getElementById: element,
      querySelector: () => element('meta-description'),
      querySelectorAll: () => [],
      createElement: () => element('created-' + Math.random()) },
    window: { addEventListener() {} }, navigator: { languages: ['en-SG'] }, alert() {},
    localStorage: { getItem: () => JSON.stringify(state), setItem: (_, raw) => { state = JSON.parse(raw); } },
    // Keep startup fetching pending; tests supply rates deliberately.
    fetch: () => new Promise(() => {}), ...overrides
  });
  for (const file of ['app-config.js', 'translations.js', 'i18n.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
  vm.runInContext(fs.readFileSync('script.js', 'utf8').split('// Theme toggle functionality')[0], context);
  return { context, element, workers, state: () => state };
}

module.exports = { loadApp };
