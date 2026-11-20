/* Discover only observed SeaTalk modules; never guess a build hash or an account. */
const AVATAR_RESOURCE_DISCOVERY_CODES = [
  'RESOURCE_FILE_URL_MISSING', 'RESOURCE_FILE_URL_AMBIGUOUS',
  'RESOURCE_PROFILE_SERVICE_MISSING', 'RESOURCE_ACCOUNT_MODULE_MISSING',
  'RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED', 'ACCOUNT_MISSING', 'ACCOUNT_AMBIGUOUS',
];

function getLoadedAvatarModuleUrls() {
  const urls = Array.from(document.querySelectorAll('link[href],script[src]'))
    .map(el => el.href || el.src || '');
  // Imported dependencies need not have a link/script element (SeaTalk 3.72).
  if (typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    for (const entry of performance.getEntriesByType('resource')) urls.push(entry.name);
  }
  return urls;
}

async function resolveAvatarResourceServices({ chunkUrl, updater, module, urls, loadModule }) {
  const fileUrls = [...new Set(Object.values(module))].filter(value => typeof value === 'function' &&
    String(value).includes('maxWidth') && String(value).includes('gfsToken') &&
    String(value).includes('blob:'));
  if (!fileUrls.length) throw Error('RESOURCE_FILE_URL_MISSING');
  if (fileUrls.length !== 1) throw Error('RESOURCE_FILE_URL_AMBIGUOUS');
  if (typeof updater?.forceFetchInfo !== 'function') throw Error('RESOURCE_PROFILE_SERVICE_MISSING');

  const expected = new URL(chunkUrl);
  const candidates = new Set();
  for (const value of urls) {
    let url;
    try { url = new URL(value, expected); } catch (_) { continue; }
    if (url.protocol === 'https:' && url.origin === expected.origin &&
        !url.username && !url.password && !url.search && !url.hash &&
        /^\/seatalk\/fe\/static\/js\/chunk-(?:src|db-pure)-[^/]+\.js$/.test(url.pathname)) {
      candidates.add(url.href);
    }
  }
  if (!candidates.size) throw Error('RESOURCE_ACCOUNT_MODULE_MISSING');

  const sessions = new Set();
  for (const url of candidates) {
    let accountModule;
    try { accountModule = await loadModule(url); }
    catch (_) { throw Error('RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED'); }
    for (const value of Object.values(accountModule)) {
      if (value && typeof value === 'object' && value.loggedIn === true &&
          Number.isSafeInteger(value.userId) && value.userId > 0 &&
          typeof value.fileServerToken === 'string' && value.fileServerToken.length > 0) {
        sessions.add(value);
      }
    }
  }
  if (!sessions.size) throw Error('ACCOUNT_MISSING');
  if (sessions.size !== 1) throw Error('ACCOUNT_AMBIGUOUS');
  return { session: [...sessions][0], fileUrl: fileUrls[0] };
}
