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

test('deduplicates export aliases and the same session re-exported across modules', async () => {
  const account = session(), imports = [];
  const result = await resolve({ chunkUrl: STYLES, updater,
    module: { fileUrl, alias: fileUrl }, urls: [OLD, NEW],
    async loadModule(url) { imports.push(url); return { account, alias: account }; },
  });
  assert.equal(result.session, account);
  assert.deepEqual(imports, [OLD, NEW]);
});

test('rejects distinct session objects, even if they report the same account ID', async () => {
  await assert.rejects(fixture({ urls: [OLD, NEW], loadModule: async () => ({ account: session() }) }).run(),
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
  const f = fixture({ urls: [OLD, NEW], loadModule: async url => {
    imports.push(url); throw Error('https://private.test/?token=secret');
  } });
  await assert.rejects(f.run(), { message: 'RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED' });
  assert.deepEqual(imports, [OLD]);
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
function pageFixture({ loaded = true, legacy = false, loadAccount } = {}) {
  let resourceLoaded = loaded;
  const account = session(), events = [], imports = [];
  const runtime = { esmUpdater: null, esmDiscoveryPromise: null };
  const accountUrl = legacy ? OLD : NEW;
  const tags = [{ href: STYLES }, ...(legacy ? [{ href: OLD }] : [])];
  const module = { updater, fileUrl };
  const discovery = script.slice(script.indexOf('    async function discoverAvatarResourceServices()'),
    script.indexOf('    async function applyDirectAvatar('));
  const startup = script.slice(script.indexOf('    async function discoverEsmUpdater('),
    script.indexOf('    async function waitForEsmUpdater('));
  const context = vm.createContext({
    URL, runtime, emit: e => events.push(e), getMainChunkStylesUrls: () => [STYLES],
    document: { querySelectorAll: () => tags },
    performance: { getEntriesByType: type => {
      assert.equal(type, 'resource');
      return resourceLoaded && !legacy ? [{ name: NEW }] : [];
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
    startup.replaceAll('import(', '__import('), context);
  return { account, events, imports, runtime, observeDependency() { resourceLoaded = true; },
    run: () => vm.runInContext('discoverEsmUpdater()', context) };
}

for (const legacy of [false, true]) {
  test(`startup reports ready after checking ${legacy ? 'legacy DOM' : '3.72 performance-only'} dependencies`, async () => {
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
