async function discoverPersonalSettingsAccount() {
  /* FAVORITES_ACCOUNT_MODULE */
  const module = await import(getFavoritesAccountModuleUrl());
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
      const key = 'seatalk-personal-sticker-settings-v1:' + request.account;
      const deadline = Date.now() + 5000;
      const transact = async () => {
        // Verify the live account inside the lock, immediately before reading the account's storage.
        const currentAccount = await unsafeWindow.Function(`return (${discoverPersonalSettingsAccount.toString()})();`)();
        if (currentAccount !== request.account) throw Error('METADATA_ACCOUNT_CHANGED');
        if (Date.now() >= deadline) throw Error('METADATA_SAVE_FAILED');
        const current = validateSettingsSnapshot(GM_getValue(key,{schema:1,revision:0,items:[]}));
        if (request.kind === 'load') return current;
        if (current.revision !== request.revision) throw Error('METADATA_CHANGED');
        const updated = validateSettingsSnapshot({schema:2,revision:current.revision+1,items:request.items,
          groups:request.groups === undefined ? current.groups : request.groups});
        GM_setValue(key,updated);
        return updated;
      };
      const locks = globalThis.navigator?.locks;
      const result = request.kind === 'save' && locks ? await locks.request(key,{ifAvailable:true},lock=>{
        if (!lock) throw Error('METADATA_CHANGED');
        return transact();
      }) : await transact();
      window.dispatchEvent(new CustomEvent('spga:settings-response',{detail:JSON.stringify({id:request.id,ok:true,value:result})}));
    } catch (error) {
      if (request?.id) window.dispatchEvent(new CustomEvent('spga:settings-response',{detail:JSON.stringify({id:request.id,ok:false,error:['METADATA_ACCOUNT_CHANGED','METADATA_CHANGED','METADATA_STORAGE_INVALID','METADATA_INVALID','METADATA_DUPLICATE','METADATA_KEYWORDS_LIMIT'].includes(error.message)?error.message:'METADATA_SAVE_FAILED'})}));
    }
  });
}
