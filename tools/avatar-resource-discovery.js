/* Discover only observed SeaTalk modules; never guess a build hash or an account. */
const AVATAR_RESOURCE_DISCOVERY_CODES = [
  'RESOURCE_FILE_URL_MISSING', 'RESOURCE_FILE_URL_AMBIGUOUS',
  'RESOURCE_PROFILE_SERVICE_MISSING', 'RESOURCE_MODULE_DECLARATIONS_INVALID', 'RESOURCE_ACCOUNT_MODULE_MISSING',
  'RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED', 'ACCOUNT_MISSING', 'ACCOUNT_AMBIGUOUS',
];

const AVATAR_CDN_MODULE = /^https:\/\/static\.cdn\.haiserve\.com\/seatalk\/fe\/static\/js\/chunk-(styles|src|db-pure)-[A-Za-z0-9_-]+\.js$/;
// This is an entry dependency of the standalone media viewer. Evaluating it
// mounts a second application in #root, even when the viewer was only prefetched.
const MEDIA_VIEWER_MODULE = 'https://static.cdn.haiserve.com/seatalk/fe/static/js/chunk-src-DcOtnrHP.js';

function getAvatarModuleCandidates() {
  const html = document.documentElement;
  const declaredBuild = html?.getAttribute('data-web-semantic-version') === '3.72.0' &&
    html.getAttribute('data-release-hash') === 'cba35692d';
  const styles = new Set(), accounts = new Set();
  let viewerDeclared = false;
  const selector = declaredBuild ? 'link[rel~="modulepreload"][href]'
    : 'link[rel~="modulepreload"][href],script[type="module"][src]';
  for (const el of document.head.querySelectorAll(selector)) {
    const url = el.href || el.src;
    const family = typeof url === 'string' && AVATAR_CDN_MODULE.exec(url)?.[1];
    if (family === 'styles') styles.add(url);
    if (url === MEDIA_VIEWER_MODULE) viewerDeclared = true;
    else if (family === 'db-pure' || (!declaredBuild && family === 'src')) accounts.add(url);
  }
  if ((declaredBuild && styles.size !== 1) || styles.size > 1 ||
      (!accounts.size && (declaredBuild || viewerDeclared))) throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');
  if (styles.size && !accounts.size && typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    // On other builds, accept only an actual script dependency from the narrow
    // db-pure family. Fetch, preload and historical chunk-src entries are not
    // evidence that the main app evaluated them.
    for (const entry of performance.getEntriesByType('resource')) {
      if (entry.initiatorType === 'script' && AVATAR_CDN_MODULE.exec(entry.name)?.[1] === 'db-pure') accounts.add(entry.name);
    }
  }
  if (styles.size && !accounts.size) throw Error('RESOURCE_ACCOUNT_MODULE_MISSING');
  if (accounts.size > 1) throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');
  return { styles: [...styles], accounts: [...accounts], declaredBuild };
}

function findAvatarUpdater(module, declaredBuild) {
  return Object.values(module).find(value => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
    // In this build ContactService stores its dispatcher as an own data field.
    // Looking up arbitrary method names first can touch unrelated lazy exports.
    if (declaredBuild && !Object.getOwnPropertyDescriptor(value, 'onUserInfoChanged')?.value) return false;
    return typeof value.updateUserInfo === 'function' && (value.onUserInfoChanged || value.onUserInfosChanged);
  });
}

async function resolveAvatarResourceServices({ chunkUrl, updater, module, urls, loadModule }) {
  const fileUrls = [...new Set(Object.values(module))].filter(value => {
    if (typeof value !== 'function') return false;
    const source = Function.prototype.toString.call(value);
    return source.includes('maxWidth') && source.includes('gfsToken') && source.includes('blob:');
  });
  if (!fileUrls.length) throw Error('RESOURCE_FILE_URL_MISSING');
  if (fileUrls.length !== 1) throw Error('RESOURCE_FILE_URL_AMBIGUOUS');
  if (typeof updater?.forceFetchInfo !== 'function') throw Error('RESOURCE_PROFILE_SERVICE_MISSING');

  if (AVATAR_CDN_MODULE.exec(chunkUrl)?.[1] !== 'styles') throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');
  const candidates = new Set(urls.filter(url => url !== MEDIA_VIEWER_MODULE &&
    ['src', 'db-pure'].includes(AVATAR_CDN_MODULE.exec(url)?.[1])));
  if (!candidates.size) throw Error('RESOURCE_ACCOUNT_MODULE_MISSING');
  if (candidates.size !== 1) throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');

  const sessions = new Set();
  let accountModule;
  try { accountModule = await loadModule([...candidates][0]); }
  catch (_) { throw Error('RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED'); }
  for (const value of Object.values(accountModule)) {
    if (value && typeof value === 'object' && value.loggedIn === true &&
        Number.isSafeInteger(value.userId) && value.userId > 0 &&
        typeof value.fileServerToken === 'string' && value.fileServerToken.length > 0) {
      sessions.add(value);
    }
  }
  if (!sessions.size) throw Error('ACCOUNT_MISSING');
  if (sessions.size !== 1) throw Error('ACCOUNT_AMBIGUOUS');
  return { session: [...sessions][0], fileUrl: fileUrls[0] };
}
