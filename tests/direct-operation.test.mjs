import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
const source = fs.readFileSync(new URL('../SeaTalk-Personal-GIF-Avatar-Helper.user.js', import.meta.url), 'utf8');
const A = '77db1154ce5639bf4ef946b0296c75da0b070500000f995617737056080110e5';
const B = 'b85fdeb54f129ea6ee22258515ed0b820b0705000002a37e1780358408011036';
const configEvent = 'seatalk-personal-gif-avatar:set-config';
const statusEvent = 'seatalk-personal-gif-avatar:hook-status';
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function fixture() {
  let now = 1_000, seq = 0;
  const timers = new Map(), listeners = new Map(), events = [], requests = [];
  const successes = [], avatarUrls = [];
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  class CustomEvent { constructor(type, { detail }) { Object.assign(this, { type, detail }); } }
  const win = {
    addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); },
    dispatchEvent(event) { events.push(event); for (const fn of listeners.get(event.type) || []) fn(event); },
    setInterval(fn, ms) { timers.set(++seq, { fn, at: now + ms, ms }); return seq; },
    setTimeout(fn, ms) { timers.set(++seq, { fn, at: now + ms }); return seq; },
    clearInterval(id) { timers.delete(id); }, clearTimeout(id) { timers.delete(id); },
  };
  const uiSource = source
    .replace('function renderPanel() {', 'function renderPanel() { return;')
    .replace('function getCurrentPersonalAvatarUrls() {', 'function getCurrentPersonalAvatarUrls() { return __avatarUrls;')
    .replace('function showSuccessCelebration(gifId, groupName = "") {', 'function showSuccessCelebration(gifId, groupName = "") { __successes.push(gifId); return;');
  const ui = vm.createContext({
    __SPGA_TEST_MODE__: true, __avatarUrls: avatarUrls, __successes: successes,
    navigator: { language: 'en' }, location: { href: 'https://seatalkweb.com/' }, URL,
    Date: Clock, window: win, CustomEvent, GM_setValue() {},
  });
  vm.runInContext(uiSource, ui);
  const api = ui.__SPGA_TEST_API__;
  api.state.pageHookReady = true;
  api.bindHookStatusEvents();
  const backend = {
    updateUserInfo(userId, payload) { return new Promise((resolve, reject) => requests.push({ userId, payload, resolve, reject })); },
  };
  let hook = source.slice(source.indexOf('  function pageHook(events)'), source.indexOf('  function init()'));
  hook = hook.replace('    function isValidGifId(value)', '    globalThis.testRuntime = runtime; runtime.esmUpdater = backend; runtime.esmSessionInfo = { userId: 123 };\n    function isValidGifId(value)');
  const page = vm.createContext({
    backend, Date: Clock, window: win, CustomEvent,
    document: { querySelectorAll: () => [] }, XMLHttpRequest: class { open() {} send() {} },
  });
  vm.runInContext(hook + `\npageHook({configEvent:${JSON.stringify(configEvent)},statusEvent:${JSON.stringify(statusEvent)}});`, page);
  function status(detail) { win.dispatchEvent(new CustomEvent(statusEvent, { detail })); }
  function command(detail) { win.dispatchEvent(new CustomEvent(configEvent, { detail })); }
  function start(gifId) { api.state.selected = { gifId }; api.startAvatarApply(); }
  async function advance(ms) {
    const end = now + ms;
    while (true) {
      const next = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, item] = next; now = item.at;
      if (item.ms) item.at += item.ms; else timers.delete(id);
      item.fn(); await flush();
    }
    now = end; await flush();
  }
  return { api, page, requests, events, successes, avatarUrls, status, command, start, advance };
}

test('slow request stays locked after visual timeout; selected B cannot change submission/result A', async () => {
  const f = fixture(); f.start(A); await flush();
  assert.equal(f.requests[0].payload.avatar, A);
  await f.advance(21_000);
  assert.equal(f.api.state.requestPending, true);
  assert.equal(f.api.state.requestSlow, true);
  f.start(B); await flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.api.state.diagnosticAttempt, 1, 'blocked retry does not create an unsubmitted attempt');
  f.command({ enabled: true, gifId: B });
  f.page.testRuntime.gifId = B; // Reproduces PMO's mutable-runtime scenario too.
  f.requests[0].resolve(); await flush();
  assert.equal(f.api.state.apiConfirmedGifId, A);
  assert.deepEqual(f.successes, [A]);
  assert.equal(f.api.state.requestPending, false);
  const success = f.events.find(e => e.detail.type === 'direct-submitted');
  assert.equal(success.detail.gifId, A); assert.equal(success.detail.attemptId, 1);
  f.start(B); await flush();
  assert.equal(f.requests.length, 2); assert.equal(f.requests[1].payload.avatar, B);
});

test('page busy rejection is explicit, cannot mutate A, and does not queue B', async () => {
  const f = fixture(); f.start(A); await flush();
  f.command({ command: 'apply-direct', enabled: true, attemptId: 2, gifId: B });
  const busy = f.events.find(e => e.detail.type === 'request-busy').detail;
  assert.equal(busy.attemptId, 2); assert.equal(busy.code, 'REQUEST_BUSY');
  f.requests[0].resolve(); await flush();
  assert.equal(f.requests.length, 1); assert.deepEqual(f.successes, [A]);
});

for (const oldResult of ['success', 'failure']) {
  test(`late/duplicate ${oldResult} of A cannot affect B or B diagnostics`, async () => {
    const f = fixture(); f.start(A); await flush();
    f.requests[0].reject({ errorCode: 93 }); await flush();
    f.start(B); await flush();
    const before = JSON.stringify(f.api.state.diagnosticEvents);
    const active = f.api.state.activeOperation;
    f.status({ attemptId: 1, gifId: A, type: oldResult === 'success' ? 'direct-submitted' : 'error', code: 'API_ERROR' });
    assert.equal(f.api.state.activeOperation, active);
    assert.equal(f.api.state.requestPending, true);
    assert.equal(JSON.stringify(f.api.state.diagnosticEvents), before);
    assert.equal(f.successes.length, 0);
    f.requests[1].resolve(); await flush();
    assert.deepEqual(f.successes, [B]);
    assert.equal(f.api.state.diagnosticEvents.find(e => e.code === 'API_SUCCESS').attempt, 2);
  });
}

test('late A failure remains A; retry B succeeds and visual changes cannot prematurely unlock either request', async () => {
  const f = fixture(); f.start(A); await flush();
  f.avatarUrls.push(`https://fixture.invalid/${A}`);
  await f.advance(31_000);
  assert.equal(f.api.state.requestPending, true, 'visual match and 30s timer do not unlock request');
  assert.equal(f.successes.length, 0, 'visual-only evidence does not celebrate API success');
  f.start(B); assert.equal(f.api.state.diagnosticAttempt, 1);
  f.requests[0].reject({ errorCode: 93 }); await flush();
  assert.equal(f.api.state.diagnosticEvents.find(e => e.code === 'API_ERROR').attempt, 1);
  assert.equal(f.api.state.requestPending, false);
  f.start(B); await flush();
  await f.advance(21_000); // Old avatar A is still visible; cannot confirm B.
  assert.equal(f.api.state.requestPending, true);
  assert.equal(f.api.state.diagnosticEvents.some(e => e.attempt === 2 && e.code === 'VISUAL_SUCCESS'), false);
  f.requests[1].resolve(); await flush();
  await f.advance(21_000);
  assert.equal(f.api.state.diagnosticEvents.find(e => e.code === 'VISUAL_PENDING').attempt, 2);
  assert.deepEqual(f.successes, [B]);
});

test('A success followed by B failure does not reuse A success state or celebrate B', async () => {
  const f = fixture(); f.start(A); await flush(); f.requests[0].resolve(); await flush();
  f.start(B); await flush(); f.requests[1].reject({ errorCode: 91 }); await flush();
  assert.equal(f.api.state.apiConfirmedGifId, '');
  assert.equal(f.api.state.requestPending, false);
  assert.equal(f.api.state.diagnosticEvents.find(e => e.code === 'API_ERROR').attempt, 2);
  assert.deepEqual(f.successes, [A]);
});

for (const outcome of ['resolve', 'reject']) {
  test(`superseded page operation cannot emit a late ${outcome} or release a newer slot`, async () => {
    const f = fixture(); f.start(A); await flush();
    const newer = Object.freeze({ id: 2, gifId: B });
    f.page.testRuntime.directOperation = newer;
    f.api.state.activeOperation = newer;
    f.api.state.diagnosticAttempt = 2;
    const before = JSON.stringify(f.api.state.diagnosticEvents);
    f.requests[0][outcome]({ errorCode: 93 }); await flush();
    assert.equal(f.page.testRuntime.directOperation, newer);
    assert.equal(f.api.state.requestPending, true);
    assert.equal(JSON.stringify(f.api.state.diagnosticEvents), before);
    assert.equal(f.successes.length, 0);
  });
}

test('a retry triggered synchronously by terminal delivery is accepted', async () => {
  const f = fixture(); f.start(A); await flush();
  // Hook's terminal dispatch runs UI listeners synchronously. A new apply after
  // that UI update must not be swallowed by the old promise's finally callback.
  // Use a synthetic listener on the same event bridge, after the UI handler.
  const oldDispatch = f.page.window.dispatchEvent;
  f.page.window.dispatchEvent = event => {
    oldDispatch(event);
    if (event.detail.type === 'direct-submitted' && event.detail.attemptId === 1) f.start(B);
  };
  f.requests[0].resolve(); await flush();
  assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].payload.avatar, B);
  assert.equal(f.page.testRuntime.directOperation.id, 2);
});
