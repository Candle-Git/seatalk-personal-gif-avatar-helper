async function discoverPersonalSettingsAccount() {
  const urls = [...new Set(Array.from(document.querySelectorAll('link[href],script[src]'), element => element.href || element.src || ''))].filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'static.cdn.haiserve.com' && /\/seatalk\/fe\/static\/js\/chunk-src-[^/]+\.js$/.test(url.pathname); } catch (_) { return false; }
  });
  if (urls.length !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  const module = await import(urls[0]);
  const sessions = [...new Set(Object.values(module))].filter(value => value && typeof value === 'object' && value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
  if (sessions.length !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  return sessions[0].userId;
}
function installPersonalSettingsBridge() {
  if (window.__spgaSettingsBridgeInstalled) return;
  window.__spgaSettingsBridgeInstalled = true;
  window.addEventListener('spga:settings-request', async event => {
    let request;
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 10 * 1024 * 1024) return;
      request = JSON.parse(event.detail);
      if (!request || !/^[a-z0-9-]{8,80}$/i.test(request.id) || !Number.isSafeInteger(request.account) || request.account <= 0 || !['load','save'].includes(request.kind)) return;
      // Verify the live page account independently; a DOM event cannot choose another account's notes.
      const currentAccount = await unsafeWindow.Function(`return (${discoverPersonalSettingsAccount.toString()})();`)();
      if (currentAccount !== request.account) throw Error('METADATA_ACCOUNT_CHANGED');
      const key = 'seatalk-personal-sticker-settings-v1:' + request.account;
      const current = validateSettingsSnapshot(GM_getValue(key,{schema:1,revision:0,items:[]}));
      let result = current;
      if (request.kind === 'save') {
        if (current.revision !== request.revision) throw Error('METADATA_CHANGED');
        result = validateSettingsSnapshot({schema:1,revision:current.revision+1,items:request.items});
        GM_setValue(key,result);
      }
      window.dispatchEvent(new CustomEvent('spga:settings-response',{detail:JSON.stringify({id:request.id,ok:true,value:result})}));
    } catch (error) {
      if (request?.id) window.dispatchEvent(new CustomEvent('spga:settings-response',{detail:JSON.stringify({id:request.id,ok:false,error:['METADATA_ACCOUNT_CHANGED','METADATA_CHANGED','METADATA_STORAGE_INVALID','METADATA_INVALID','METADATA_DUPLICATE','METADATA_KEYWORDS_LIMIT'].includes(error.message)?error.message:'METADATA_SAVE_FAILED'})}));
    }
  });
}
