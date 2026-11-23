function getFavoritesAccountModuleUrl() {
  const html = document.documentElement;
  const currentBuild = html.getAttribute('data-web-semantic-version') === '3.72.0' &&
    html.getAttribute('data-release-hash') === 'cba35692d';
  const cdn = 'https://static.cdn.haiserve.com/seatalk/fe/static/js/';
  const family = currentBuild ? /^chunk-db-pure-[\w-]+\.js$/ : /^chunk-src-[\w-]+\.js$/;
  const urls = new Set();
  for (const tag of document.head.querySelectorAll('link[rel~="modulepreload"][href],script[type="module"][src]')) {
    const href = tag.href || tag.src;
    if (href.startsWith(cdn) && family.test(href.slice(cdn.length)) && href !== cdn + 'chunk-src-DcOtnrHP.js') urls.add(href);
  }
  if (urls.size !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  return [...urls][0];
}
