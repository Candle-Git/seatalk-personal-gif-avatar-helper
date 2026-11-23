import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';

const helper = fs.readFileSync(new URL('../tools/avatar-resource-discovery.js', import.meta.url), 'utf8');
const script = fs.readFileSync(new URL('../SeaTalk-Personal-GIF-Avatar-Helper.user.js', import.meta.url), 'utf8');
const resolve = vm.runInNewContext(helper + '\nresolveAvatarResourceServices', { URL });
const ROOT = 'https://static.cdn.haiserve.com/seatalk/fe/static/js/';
const STYLES = ROOT + 'chunk-styles-fixture.js';
const OLD = ROOT + 'chunk-src-old.js';
const NEW = ROOT + 'chunk-db-pure-new.js';
const VIEWER = ROOT + 'chunk-src-DcOtnrHP.js';
const session = () => ({ loggedIn: true, userId: 123, fileServerToken: 'fixture-only' });
const fileUrl = function (id, { maxWidth, gfsToken } = {}) { return id || 'blob:'; };
const updater = { forceFetchInfo() {}, updateUserInfo() {}, onUserInfoChanged: {} };

function fixture(overrides = {}) {
  const account = session(), imports = [];
  const options = {
    chunkUrl: STYLES, updater, module: { fileUrl }, urls: [NEW],
    async loadModule(url) { imports.push(url); return { account }; },
    ...overrides,
  };
  return { account, imports, run: () => resolve(options) };
}

for (const url of [OLD, NEW]) {
  test(`resolves observed ${url === OLD ? 'legacy' : '3.72'} account module without a fixed hash`, async () => {
    const f = fixture({ urls: [STYLES, url, url] });
    const result = await f.run();
    assert.equal(result.session, f.account);
    assert.equal(result.fileUrl, fileUrl);
    assert.deepEqual(f.imports, [url]);
  });
}

test('deduplicates export aliases and repeated declarations of one account module', async () => {
  const account = session(), imports = [];
  const result = await resolve({ chunkUrl: STYLES, updater,
    module: { fileUrl, alias: fileUrl }, urls: [NEW, NEW],
    async loadModule(url) { imports.push(url); return { account, alias: account }; },
  });
  assert.equal(result.session, account);
  assert.deepEqual(imports, [NEW]);
});

test('rejects distinct session objects, even if they report the same account ID', async () => {
  await assert.rejects(fixture({ urls: [NEW], loadModule: async () => ({ one: session(), two: session() }) }).run(),
    { message: 'ACCOUNT_AMBIGUOUS' });
});

test('ignores untrusted origins, unrelated paths and parameterized module URLs without importing them', async () => {
  const f = fixture({ urls: [
    'https://evil.test/seatalk/fe/static/js/chunk-db-pure-new.js',
    ROOT.replace('https:', 'http:') + 'chunk-db-pure-new.js',
    ROOT.replace('static.cdn.haiserve.com', 'static.cdn.haiserve.com.evil.test') + 'chunk-src-old.js',
    'https://static.cdn.haiserve.com/other/chunk-db-pure-new.js',
    ROOT + 'chunk-unrelated.js', NEW + '?token=private', NEW + '#fragment',
    NEW.replace('https://', 'https://user:password@'), 'not a module URL',
  ] });
  await assert.rejects(f.run(), { message: 'RESOURCE_ACCOUNT_MODULE_MISSING' });
  assert.deepEqual(f.imports, []);
});

for (const account of [null, {}, { ...session(), loggedIn: false },
  { ...session(), userId: 0 }, { ...session(), fileServerToken: '' }]) {
  test(`rejects missing or inactive sessions (${JSON.stringify(account)})`, async () => {
    await assert.rejects(fixture({ loadModule: async () => ({ account }) }).run(), { message: 'ACCOUNT_MISSING' });
  });
}

test('reports module import failure without leaking the original error or trying another account', async () => {
  const imports = [];
  const f = fixture({ urls: [OLD], loadModule: async url => {
    imports.push(url); throw Error('https://private.test/?token=secret');
  } });
  await assert.rejects(f.run(), { message: 'RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED' });
  assert.deepEqual(imports, [OLD]);
});

test('inspecting exported functions never calls their custom string conversion', async () => {
  function unrelated() {}
  unrelated.toString = () => { throw Error('application side effect'); };
  const f = fixture({ module: { unrelated, fileUrl } });
  assert.equal((await f.run()).session, f.account);
  assert.deepEqual(f.imports, [NEW]);
});

for (const [overrides, code] of [
  [{ module: {} }, 'RESOURCE_FILE_URL_MISSING'],
  [{ module: { fileUrl, other: function (maxWidth, gfsToken) { return 'blob:'; } } }, 'RESOURCE_FILE_URL_AMBIGUOUS'],
  [{ updater: {} }, 'RESOURCE_PROFILE_SERVICE_MISSING'],
]) {
  test(`fails before account imports when ${code}`, async () => {
    const f = fixture(overrides);
    await assert.rejects(f.run(), { message: code });
    assert.deepEqual(f.imports, []);
  });
}

// Exercise the generated page adapter and startup check, including the actual
// DOM + PerformanceResourceTiming collection; only ESM loading is substituted.
function pageFixture({ loaded = true, legacy = false, loadAccount, current = false, preloads, timing } = {}) {
  let resourceLoaded = loaded;
  let now = 0;
  const account = session(), events = [], imports = [];
  const runtime = { esmUpdater: null, esmDiscoveryPromise: null };
  const accountUrl = legacy ? OLD : NEW;
  const declared = preloads ?? [STYLES, ...(legacy ? [OLD] : current ? [NEW] : [])];
  const unrelated = { get userId() { throw Error('must not read unrelated account IDs'); } };
  if (current) Object.defineProperty(unrelated, 'updateUserInfo', {
    get() { throw Error('must not probe methods on unrelated exports'); },
  });
  const module = { unrelated, updater, fileUrl };
  const discovery = script.slice(script.indexOf('    async function discoverAvatarResourceServices()'),
    script.indexOf('    async function applyDirectAvatar('));
  const startup = script.slice(script.indexOf('    async function discoverEsmUpdater('),
    script.indexOf('    async function waitForEsmUpdater('));
  const apply = script.slice(script.indexOf('    async function applyDirectAvatar('),
    script.indexOf('    window.addEventListener(events.configEvent,', script.indexOf('    async function applyDirectAvatar(')));
  const wait = script.slice(script.indexOf('    async function waitForEsmUpdater('),
    script.indexOf('    let groupRevision'));
  const context = vm.createContext({
    URL, runtime, emit: e => events.push(e),
    Date: { now: () => now },
    window: { setTimeout(callback, ms) { now += ms; callback(); } },
    document: {
      documentElement: { getAttribute(key) {
        return current ? { 'data-web-semantic-version': '3.72.0', 'data-release-hash': 'cba35692d' }[key] : null;
      } },
      head: { querySelectorAll(selector) {
        assert.equal(selector, current ? 'link[rel~="modulepreload"][href]'
          : 'link[rel~="modulepreload"][href],script[type="module"][src]');
        return declared.map(href => ({ href }));
      } },
      querySelectorAll() { assert.equal(current, false, 'current build must only inspect head declarations'); return tags; },
    },
    performance: { getEntriesByType: type => {
      assert.equal(current, false, 'current build must never consult resource history');
      assert.equal(type, 'resource');
      return timing ?? (resourceLoaded && !legacy ? [{ name: NEW, initiatorType: 'script' }] : []);
    } },
    __import: async url => {
      imports.push(url);
      if (url === STYLES) return module;
      assert.equal(url, accountUrl);
      if (loadAccount) await loadAccount();
      return { account };
    },
  });
  vm.runInContext(helper + discovery.replaceAll('import(', '__import(') +
    startup.replaceAll('import(', '__import(') + wait + apply, context);
  return { account, events, imports, runtime, elapsed: () => now,
    observeDependency() { resourceLoaded = true; },
    run: (reportFailure = true) => context.discoverEsmUpdater({ reportFailure }),
    resolveAgain: () => context.discoverAvatarResourceServices(),
    apply(operation) {
      runtime.directOperation = operation;
      return context.applyDirectAvatar(operation);
    } };
}

test('known 3.72 release resolves only the two declared modules, ignoring unrelated app exports and chunks', async () => {
  const f = pageFixture({ current: true, preloads: [VIEWER, OLD, STYLES, NEW, STYLES, NEW,
    STYLES.replace('static.cdn.haiserve.com', 'other.example'), NEW + '?v=other',
    ROOT + 'chunk-else-other.js'] });
  assert.equal(await f.run(), true);
  assert.deepEqual(f.imports, [STYLES, NEW]);
});

for (const preloads of [[STYLES, OLD], [NEW], [STYLES, NEW, ROOT + 'chunk-styles-stale.js'],
  [STYLES, NEW, ROOT + 'chunk-db-pure-stale.js']]) {
  test('missing or ambiguous known-build declarations stop before any import: ' +
    preloads.map(url => url.slice(ROOT.length)).join(', '), async () => {
    const f = pageFixture({ current: true, preloads });
    assert.equal(await f.run(), false);
    assert.equal(f.events.at(-1).code, 'RESOURCE_MODULE_DECLARATIONS_INVALID');
    assert.deepEqual(f.imports, []);
  });
}

test('cached styles module is not imported after the document switches builds', async () => {
  const preloads = [STYLES, NEW], f = pageFixture({ current: true, preloads });
  assert.equal(await f.run(), true);
  preloads[0] = ROOT + 'chunk-styles-other.js';
  await assert.rejects(f.resolveAgain(), { message: 'RESOURCE_MODULE_DECLARATIONS_INVALID' });
  assert.deepEqual(f.imports, [STYLES, NEW]);
});

test('cached account module is not used after its declaration changes', async () => {
  const preloads = [STYLES, NEW], f = pageFixture({ current: true, preloads });
  assert.equal(await f.run(), true);
  preloads[1] = ROOT + 'chunk-db-pure-other.js';
  await assert.rejects(f.resolveAgain(), { message: 'RESOURCE_MODULE_DECLARATIONS_INVALID' });
  assert.deepEqual(f.imports, [STYLES, NEW]);
});

test('another release prefers its declared module even with unrelated script or fetch records', async () => {
  const f = pageFixture({ legacy: true, timing: [
    { name: VIEWER, initiatorType: 'fetch' }, { name: NEW, initiatorType: 'script' }] });
  assert.equal(await f.run(), true);
  assert.deepEqual(f.imports, [STYLES, OLD]);
});

test('another release can use one db-pure script dependency alongside fetch-only media viewer assets', async () => {
  const f = pageFixture({ timing: [
    { name: VIEWER, initiatorType: 'fetch' }, { name: ROOT + 'chunk-db-pure-prefetched.js', initiatorType: 'other' },
    { name: NEW, initiatorType: 'script' }] });
  assert.equal(await f.run(), true);
  assert.deepEqual(f.imports, [STYLES, NEW]);
});

test('another release with only prefetched or generic src records stops before any import', async () => {
  const f = pageFixture({ timing: [
    { name: VIEWER, initiatorType: 'fetch' }, { name: OLD, initiatorType: 'script' },
    { name: NEW, initiatorType: 'fetch' }, { name: NEW, initiatorType: 'other' }] });
  assert.equal(await f.run(), false);
  assert.equal(f.events.at(-1).code, 'RESOURCE_ACCOUNT_MODULE_MISSING');
  assert.deepEqual(f.imports, []);
});

for (const [label, preloads, timing] of [
  ['conflicting declarations', [STYLES, OLD, NEW], []],
  ['known viewer declared alone', [STYLES, VIEWER], [{ name: NEW, initiatorType: 'script' }]],
  ['multiple style modules', [STYLES, ROOT + 'chunk-styles-stale.js', NEW], []],
  ['multiple db-pure dependencies', [STYLES], [NEW, ROOT + 'chunk-db-pure-other.js'].map(name => ({ name, initiatorType: 'script' }))],
]) {
  test('another release with ' + label + ' fails before any module evaluation', async () => {
    const f = pageFixture({ preloads, timing });
    assert.equal(await f.run(), false);
    assert.equal(f.events.at(-1).code, 'RESOURCE_MODULE_DECLARATIONS_INVALID');
    assert.deepEqual(f.imports, []);
  });
}

for (const legacy of [false, true]) {
  test(`startup reports ready after checking ${legacy ? 'legacy DOM' : 'performance-only'} dependencies`, async () => {
    const f = pageFixture({ legacy });
    assert.equal(await f.run(), true);
    assert.equal(f.events.at(-1).type, 'ready');
    assert.equal(f.runtime.esmUpdater, updater);
    assert.ok(f.imports.includes(legacy ? OLD : NEW));
  });
}

test('startup never reports ready for updater alone; a later observed dependency allows a new check', async () => {
  const f = pageFixture({ loaded: false });
  assert.equal(await f.run(), false);
  assert.equal(f.events.some(e => e.type === 'ready'), false);
  assert.equal(f.events.at(-1).code, 'RESOURCE_ACCOUNT_MODULE_MISSING');
  assert.equal(f.runtime.esmUpdater, null);
  assert.equal(f.runtime.esmDiscoveryPromise, null);
  f.observeDependency();
  assert.equal(await f.run(), true);
  assert.equal(f.events.at(-1).type, 'ready');
});

test('background checks stay quiet until the late account module is ready', async () => {
  const f = pageFixture({ loaded: false });
  assert.equal(await f.run(false), false);
  assert.equal(await f.run(false), false);
  assert.equal(f.events.length, 0);
  f.observeDependency();
  assert.equal(await f.run(false), true);
  assert.equal(f.events.length, 1);
  assert.equal(f.events[0].type, 'ready');
});

test('requested update reports the discovery error once, scoped to the attempt, after waiting', async () => {
  const f = pageFixture({ loaded: false });
  const operation = { id: 2, gifId: 'fixture-avatar' };
  await f.apply(operation);
  assert.equal(f.elapsed(), 5000);
  assert.deepEqual(f.events.map(event => event.type), ['waiting', 'error']);
  const result = f.events[1];
  assert.equal(result.code, 'RESOURCE_ACCOUNT_MODULE_MISSING');
  assert.equal(result.attemptId, operation.id);
  assert.equal(result.gifId, operation.gifId);
  assert.equal(f.runtime.directOperation, null);
  assert.equal(await f.run(false), false);
  assert.equal(f.events.length, 2);
});

test('does not publish a cached updater or ready status while account discovery is pending', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const f = pageFixture({ loadAccount: () => pending });
  const check = f.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.runtime.esmUpdater, null);
  assert.equal(f.events.some(e => e.type === 'ready'), false);
  release();
  assert.equal(await check, true);
  assert.equal(f.runtime.esmUpdater, updater);
  assert.equal(f.events.at(-1).type, 'ready');
});
