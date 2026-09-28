import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const source = fs.readFileSync(new URL('../SeaTalk-Personal-GIF-Avatar-Helper.user.js', import.meta.url), 'utf8');
const bootstrap = source.slice(source.indexOf('  function injectPageHook() {'), source.indexOf('  function init() {'));
const apply = source.slice(source.indexOf('  function startAvatarApply('), source.indexOf('  function bindPanelEvents()'));

function fixture(mode = 'normal') {
  const listeners = new Map();
  const events = [];
  const bridge = {
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
    dispatchEvent(event) {
      events.push(event);
      for (const fn of listeners.get(event.type) || []) fn(event);
      return true;
    },
  };
  class CustomEvent {
    constructor(type, { detail }) { Object.assign(this, { type, detail }); }
  }
  // Two separate realms sharing only the DOM event bridge, like a userscript sandbox.
  const page = vm.createContext({
    ...bridge, CustomEvent,
    document: { querySelectorAll: () => [], createElement() { throw Error('Inline scripts forbidden'); } },
    XMLHttpRequest: class { open() {} send() {} },
    setInterval: () => 1,
  });
  vm.runInContext('window = globalThis', page);
  const unsafeWindow = mode === 'missing' ? undefined : {
    Function: mode === 'blocked' ? () => { throw Error('CSP private-url'); }
      : mode === 'silent' ? () => () => {} : vm.runInContext('Function', page),
  };
  const sandbox = vm.createContext({
    window: bridge, CustomEvent, unsafeWindow,
    state: { pageHookReady: false, selected: { gifId: 'test' } },
    HOOK_EVENTS: { statusEvent: 'status', configEvent: 'config' },
    t: (_key, { code }) => code,
    isCustomGifStickerId: () => true,
    addDiagnostic: () => {},
  });
  vm.runInContext(bootstrap + apply, sandbox);
  return { page, sandbox, events, listeners };
}

test('starts actual hook in page realm without inserting script; repeat startup is idempotent', () => {
  const { page, sandbox, listeners } = fixture();
  assert.equal(vm.runInContext('injectPageHook()', sandbox), true);
  assert.equal(page.__seatalkPersonalGifAvatarHookInstalled, true);
  assert.equal(sandbox.state.pageHookReady, true);
  assert.equal(listeners.get('config').size, 1);
  assert.equal(vm.runInContext('injectPageHook()', sandbox), true);
  assert.equal(listeners.get('config').size, 1);
  assert.equal(listeners.get('status').size, 0, 'temporary acknowledgement listener removed');
});

for (const [mode, code] of [['missing', 'PAGE_CONTEXT_UNAVAILABLE'], ['blocked', 'PAGE_CONTEXT_EXECUTION_BLOCKED'], ['silent', 'HOOK_NO_ACK']]) {
  test(`${mode}: immediate error, no avatar submission or verification timer`, () => {
    const { sandbox, events, listeners } = fixture(mode);
    // No timer / submit stubs: reaching those paths would throw and fail the test.
    vm.runInContext('startAvatarApply()', sandbox);
    assert.equal(sandbox.state.pageHookReady, false);
    assert.equal(events.at(-1).detail.type, 'compatibility-error');
    assert.equal(events.at(-1).detail.message, code);
    assert.equal(events.some(e => e.type === 'config'), false);
    assert.equal(listeners.get('status').size, 0);
  });
}

test('English diagnostics keep technical detail visible', () => {
  const start = source.indexOf('  function localizeDiagnosticMessage(');
  const end = source.indexOf('  function createDiagnosticsView()', start);
  const context = vm.createContext({ state: { locale: 'en' }, DIAGNOSTIC_CODES: {}, I18N: { zh: {}, en: {} }, t: key => key });
  vm.runInContext(source.slice(start, end), context);
  assert.match(vm.runInContext('localizeDiagnosticMessage({level:"error",message:"HOOK_NO_ACK"})', context), /HOOK_NO_ACK/);
});
