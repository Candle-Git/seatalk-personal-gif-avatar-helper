import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const helper = fs.readFileSync(new URL('../tools/avatar-resource-updater.js', import.meta.url), 'utf8');
const apply = vm.runInNewContext(helper + '\napplyRegisteredAvatar');
const GIF = '77db1154ce5639bf4ef946b0296c75da0b070500000f995617737056080110e5';
const AVATAR = GIF.slice(0, 33) + 'b0305' + GIF.slice(38);
const OLD = '0'.repeat(33) + 'b0301' + '0'.repeat(26);

function fixture(options = {}) {
  const events = [], requests = [], order = [];
  let account = 123, active = true, profileReads = 0;
  const adapters = {
    active: () => active, accountId: () => account,
    async profile(id) {
      assert.equal(id, 123);
      order.push('profile'); profileReads++;
      return options.profile?.(profileReads) ?? { name: 'Original', avatar: OLD };
    },
    async register(id) {
      assert.equal(id, GIF); order.push('register');
      options.afterRegister?.({ changeAccount() { account = 456; }, invalidate() { active = false; } });
      if (options.registerThrow) throw Error('private-token');
      return options.registration ?? { httpStatus: 200, errorCode: null, fileName: AVATAR };
    },
    async sameContent(a, b) {
      order.push('content'); assert.equal(a, GIF); assert.equal(b, AVATAR);
      if (options.contentThrow) throw Error('private-url');
      return options.contentMatches ?? true;
    },
    async update(id, payload) {
      order.push('update'); requests.push({ id, payload });
      if (options.apiError) throw options.apiError;
    },
    report: code => events.push(code),
  };
  return { run: id => apply(id ?? GIF, adapters), events, requests, order };
}

test('registers once, verifies content, rechecks profile, then submits avatar-use ID with original name', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.avatarId, AVATAR);
  assert.deepEqual(f.order, ['profile', 'register', 'content', 'profile', 'update']);
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].id, 123);
  assert.equal(f.requests[0].payload.name, 'Original');
  assert.equal(f.requests[0].payload.avatar, AVATAR);
  assert.deepEqual(f.events, ['RESOURCE_REGISTER_START', 'RESOURCE_REGISTERED',
    'RESOURCE_CONTENT_VERIFIED', 'API_PENDING']);
});

for (const registration of [
  { httpStatus: 200, errorCode: 19 }, { httpStatus: 500, fileName: AVATAR },
  { httpStatus: 200, errorCode: '1' }, { fileName: AVATAR },
]) {
  test(`registration error stops without update or fallback (${JSON.stringify(registration)})`, async () => {
    const f = fixture({ registration });
    await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_REGISTER_ERROR');
    assert.equal(f.requests.length, 0);
    assert.deepEqual(f.order, ['profile', 'register']);
  });
}

test('registration network failure is sanitized and not retried', async () => {
  const f = fixture({ registerThrow: true });
  await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_REGISTER_ERROR' && !e.message.includes('token'));
  assert.equal(f.requests.length, 0);
  assert.equal(f.order.filter(s => s === 'register').length, 1);
});

for (const fileName of [GIF, undefined, AVATAR + '_600', AVATAR.slice(0, 33) + 'b0302' + AVATAR.slice(38)]) {
  test(`invalid or unconverted avatar resource is rejected (${fileName?.slice(33, 38) ?? 'missing'})`, async () => {
    const f = fixture({ registration: { httpStatus: 200, fileName } });
    await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_INVALID');
    assert.equal(f.requests.length, 0);
  });
}

for (const contentThrow of [false, true]) {
  test(`changed or unreadable content never replaces avatar (${contentThrow})`, async () => {
    const f = fixture({ contentMatches: false, contentThrow });
    await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_CONTENT_ERROR');
    assert.equal(f.requests.length, 0);
  });
}

test('account change after registration stops before reading content or updating avatar', async () => {
  const f = fixture({ afterRegister: x => x.changeAccount() });
  await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_ACCOUNT_CHANGED');
  assert.deepEqual(f.order, ['profile', 'register']);
  assert.equal(f.requests.length, 0);
});

test('invalidated operation does not submit a late resource', async () => {
  const f = fixture({ afterRegister: x => x.invalidate() });
  await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_OPERATION_CHANGED');
  assert.equal(f.requests.length, 0);
});

for (const change of ['name', 'avatar']) {
  test(`concurrent profile ${change} change is preserved`, async () => {
    const f = fixture({ profile: n => ({ name: n === 2 && change === 'name' ? 'New name' : 'Original',
      avatar: n === 2 && change === 'avatar' ? AVATAR : OLD }) });
    await assert.rejects(f.run(), e => e.flowCode === 'RESOURCE_PROFILE_CHANGED');
    assert.equal(f.requests.length, 0);
  });
}

test('API error is propagated with no retry', async () => {
  const error = { errorCode: 41 };
  const f = fixture({ apiError: error });
  await assert.rejects(f.run(), e => e === error);
  assert.equal(f.requests.length, 1);
});

test('invalid sticker is rejected before profile read or registration', async () => {
  const f = fixture();
  await assert.rejects(f.run(OLD), e => e.flowCode === 'RESOURCE_INVALID');
  assert.deepEqual(f.order, []);
});

test('UI observes registered avatar ID while keeping the original operation identity', () => {
  const beta = fs.readFileSync(new URL('../SeaTalk-Personal-GIF-Avatar-Helper.user.js', import.meta.url), 'utf8');
  const listeners = new Map(), timers = new Map();
  let seq = 0;
  class CustomEvent { constructor(type, { detail }) { Object.assign(this, { type, detail }); } }
  const window = {
    addEventListener(name, fn) { listeners.set(name, fn); },
    dispatchEvent(e) { listeners.get(e.type)?.(e); },
    setInterval(fn) { timers.set(++seq, fn); return seq; }, clearInterval(id) { timers.delete(id); },
    clearTimeout() {},
  };
  const context = vm.createContext({ window, CustomEvent, __SPGA_TEST_MODE__: true,
    __avatarUrls: ['https://example.test/download/' + AVATAR + '_80'],
    navigator: { language: 'zh' }, location: { href: 'https://seatalkweb.com/' },
    URL, GM_setValue() {} });
  vm.runInContext(beta
    .replace('function renderPanel() {', 'function renderPanel() { return;')
    .replace('function getCurrentPersonalAvatarUrls() {', 'function getCurrentPersonalAvatarUrls() { return __avatarUrls;')
    .replace('function showSuccessCelebration(gifId, groupName = "") {',
      'function showSuccessCelebration(gifId, groupName = "") { return;'), context);
  const api = context.__SPGA_TEST_API__, operation = Object.freeze({ id: 1, gifId: GIF });
  Object.assign(api.state, { activeOperation: operation, requestPending: true, selected: { gifId: GIF } });
  api.bindHookStatusEvents();
  window.dispatchEvent(new CustomEvent('seatalk-personal-gif-avatar:hook-status', {
    detail: { type: 'direct-submitted', attemptId: 1, gifId: GIF, avatarResourceId: AVATAR },
  }));
  assert.equal(api.state.requestPending, false);
  assert.equal(api.state.apiConfirmedGifId, GIF);
  assert.equal(api.state.activeOperation, operation);
  [...timers.values()][0]();
  assert.equal(api.state.diagnosticEvents[0].code, 'VISUAL_SUCCESS');
});
