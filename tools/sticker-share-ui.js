  let importingBusy = false, importStopped = false, importGeneration = 0, importNeedsReview = false;
  let imported = [], importServices = null, importAccountId = 0;
  const pauseImport = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ownList = () => {
    const list = importServices?.store.getState()?.messages?.customStickers;
    if (!Array.isArray(list)) throw Error(tr('请先打开 SeaTalk 爱心收藏面板'));
    return list;
  };
  const importedResourceIds = new Map();
  function savedStickerId(id) {
    const expected=importedResourceIds.get(id) || id;
    const match=ownList().find(item=>item.id===id || item.url===id || item.id===expected || item.url===expected);
    if (!match) return null;
    return [match.id,match.url].find(value=>validMetadataId(value)) || null;
  }
  const alreadySaved = id => savedStickerId(id) !== null;
  // Observe only the exact resource refresh performed by this confirmed native add.
  // Requests and responses pass through unchanged; no credentials or response bodies are stored.
  function observeImportRefresh(item, capture = null) {
    if (globalThis.__SPGA_TEST_MODE__ === true) return () => {};
    const services=capture?.services || importServices;
    const account=nativeWorkspaceAccountId(services), generation=importGeneration;
    const contextActive=capture?.active || (()=>generation===importGeneration && account===importAccountId);
    const originalFetch=window.fetch;
    const allowedHost=new URL(validPreviewUrl(services.fileUrl,item.gifId)).hostname;
    let active=true;
    const wrapped=function(input,init) {
      let matching=false;
      try {
        const request=input instanceof Request ? input : null;
        const url=new URL(request ? request.url : String(input),location.href);
        const headers=new Headers(init?.headers ?? request?.headers);
        matching=url.protocol==='https:' && url.hostname===allowedHost && url.pathname==='/refresh/' &&
          String(init?.method ?? request?.method ?? 'GET').toUpperCase()==='POST' && headers.get('fid')===item.gifId;
      } catch (_) { /* Leave unrelated requests untouched. */ }
      const response=originalFetch.apply(this,arguments);
      if (!matching) return response;
      return response.then(async result=>{
        if (active && result.ok) {
          try {
            const text=await result.clone().text();
            if(text.length<=65536) {
              const payload=JSON.parse(text);
              if(active && contextActive() &&
                nativeWorkspaceAccountId(services)===account && host.isConnected &&
                (!payload.ErrorCode || Number(payload.ErrorCode)===0) && validMetadataId(payload.FileName)) {
                assertWorkspaceAccount(); importedResourceIds.set(item.gifId,payload.FileName);
              }
            }
          } catch (_) { /* Missing evidence remains unconfirmed. */ }
        }
        return result;
      });
    };
    window.fetch=wrapped;
    return ()=>{active=false;if(window.fetch===wrapped)window.fetch=originalFetch;};
  }
  function validPreviewUrl(fileUrl, id) {
    const url = new URL(fileUrl(id));
    if (url.protocol !== 'https:' || url.hostname !== 'f.haiserve.com' ||
        !url.pathname.startsWith('/download/' + id)) throw Error(tr('无法生成安全的表情预览'));
    return url.href;
  }
  async function discoverShareServices() {
    if (globalThis.__SPGA_TEST_MODE__ === true && globalThis.__SPGA_SHARE_FIXTURE_SERVICES__) {
      return globalThis.__SPGA_SHARE_FIXTURE_SERVICES__;
    }
    const links = [...new Set(Array.from(document.head.querySelectorAll('link[rel~="modulepreload"][href],script[type="module"][src]'), e => e.href || e.src || ''))];
    const locate = name => {
      const matches = links.filter(value => {
        try { const url = new URL(value); return url.protocol === 'https:' &&
          url.hostname === 'static.cdn.haiserve.com' &&
          new RegExp('/seatalk/fe/static/js/chunk-' + name + '-[^/]+\\.js$').test(url.pathname); }
        catch (_) { return false; }
      });
      if (matches.length !== 1) throw Error(tr('未识别当前收藏服务，请登录 SeaTalk 后刷新'));
      return matches[0];
    };
    const accountUrl = getFavoritesAccountModuleUrl();
    const [module, constants, accountModule] = await Promise.all([
      import(locate('styles')), import(locate('db-pure')), import(accountUrl),
    ]);
    const one = (values, predicate) => {
      const found = [...new Set(values)].filter(predicate);
      if (found.length !== 1) throw Error(tr('SeaTalk 收藏服务结构已变化，请停止操作并反馈'));
      return found[0];
    };
    const values = Object.values(module);
    const actions = one(values, value => value && typeof value.actionAddCustomStickerFromMessage === 'function');
    const store = one(values, value => value && typeof value.getState === 'function' && typeof value.dispatch === 'function');
    const fileUrl = one(values, value => typeof value === 'function' && ['blob:', 'maxWidth', 'gfsToken'].every(word => String(value).includes(word)));
    const tags = one(Object.values(constants), value => value && typeof value === 'object' && typeof value.MESSAGE_CUSTOM_STICKER === 'string');
    const session = one(Object.values(accountModule), value => value && typeof value === 'object' &&
      value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
    const senders = [...new Set(values)].filter(value => typeof value === 'function' &&
      ['customSticker','MESSAGE_CUSTOM_STICKER','senderId','recipientId','sendMessage'].every(word => String(value).includes(word)));
    const sendSticker = typeof actions.actionSendStickerMessage === 'function' ? payload => actions.actionSendStickerMessage(payload) : senders.length === 1 ? senders[0] : null;
    return { actions, store, fileUrl, session, sendSticker, tag: tags.MESSAGE_CUSTOM_STICKER,
      accountId: () => {
        const current = [...new Set(Object.values(accountModule))].filter(value => value && typeof value === 'object' && value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
        return current.length === 1 ? current[0].userId : 0;
      } };
  }
  $('#shareOpen').onclick = () => {
    if (busy() || !selection().length || selection().length > 100) return;
    const selected = items.filter(item => item.selected && !item.deleted);
    try {
      $('#shareCode').value = encodeStickerShare(selected.map((item,index) => $('#shareIncludeMetadata').checked ?
        {gifId:item.gifId,label:item.label,keywords:item.metadata?.keywords || []} : {gifId:item.gifId,label:'Sticker '+(index+1)}));
      $('#shareStatus').textContent = ui(`共 ${selected.length} 个表情${selectionOutside() ? `，其中 ${selectionOutside()} 个不在当前筛选中` : ''}。请复制完整口令；表情越多，口令越长。`, `${selected.length} stickers${selectionOutside() ? `, including ${selectionOutside()} outside the current filter` : ''}. Copy the complete code; more stickers make it longer.`);
      if (openDialog($('#sharing'))) $('#shareCopy').focus();
    } catch (error) { $('#scanStatus').textContent = tr(error.message); }
  };
  $('#shareIncludeMetadata').onchange = () => $('#shareOpen').onclick();
  $('#shareCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#shareCode').value); $('#shareStatus').textContent = tr('分享口令已复制，发给朋友即可。'); notifyAction($('#shareStatus').textContent); }
    catch (_) { $('#shareCode').focus(); $('#shareCode').select(); $('#shareStatus').textContent = tr('请按 ⌘C / Ctrl+C 复制完整口令。'); notifyAction($('#shareStatus').textContent, 'info'); }
  };
  $('#shareClose').onclick = () => closeDialog($('#sharing'));
  const hasSharedDetails = item => Array.isArray(item.keywords);
  const importDetails = item => hasSharedDetails(item) && $('#shareImportMetadata').checked;
  const canSelectImport = item => item.saved ? importDetails(item) : item.ready;
  const updateImportButton = () => {
    $('#shareImportMetadata').closest('label').hidden = !imported.some(hasSharedDetails);
    $('#shareImportMetadata').disabled = importingBusy;
    $('#importConfirm').disabled = importingBusy || importNeedsReview || !imported.some(item => item.selected && canSelectImport(item));
  };
  $('#importOpen').onclick = () => {
    if (deleting || importingBusy || scanning) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = tr(error.message); count(); return; }
    updateImportButton();
    if (openDialog($('#importing'))) $('#importCode').focus();
  };
  function cancelImport() {
    if (importingBusy) { importStopped = true; $('#importStatus').textContent = tr('正在停止后续添加，等待当前表情结果…'); return; }
    importGeneration++; closeDialog($('#importing'));
  }
  $('#importCancel').onclick = cancelImport;
  $('#importing').addEventListener('cancel', event => { event.preventDefault(); cancelImport(); });
  $('#importStop').onclick = () => { importStopped = true; $('#importStatus').textContent = tr('正在停止后续添加，等待当前表情结果…'); };
  $('#importCode').oninput = () => {
    if (importingBusy) return;
    importGeneration++; imported = []; $('#importPreview').replaceChildren();
    $('#importStatus').textContent = tr('口令已变化，请重新解析预览。'); updateImportButton();
  };
  $('#importSelect').onclick = () => {
    if (importingBusy) return;
    imported.forEach(item => { if (item.ready && !item.saved) { item.selected = true; item.check.checked = true; } });
    updateImportButton();
  };
  $('#importParse').onclick = async () => {
    if (importingBusy) return;
    const generation = ++importGeneration;
    importNeedsReview = false;
    imported = []; $('#importPreview').replaceChildren(); updateImportButton();
    try {
      const stickers = decodeStickerShare($('#importCode').value);
      $('#importStatus').textContent = tr('正在准备预览…');
      const found = await discoverShareServices();
      if (generation !== importGeneration || !$('#importing').open) return;
      importServices = found;
      const account = importServices.session;
      if (account.loggedIn !== true || !Number.isSafeInteger(account.userId) || account.userId <= 0) throw Error(tr('请先登录 SeaTalk'));
      assertWorkspaceAccount(); importAccountId = nativeWorkspaceAccountId(importServices);
      ownList();
      imported = stickers.map(item => ({ ...item, ready: false, selected: false, saved: alreadySaved(item.gifId), metadataPolicy:'keep',
        url: validPreviewUrl(importServices.fileUrl, item.gifId) }));
      updateImportButton();
      for (const item of imported) {
        const card = document.createElement('div'); card.className = 'import-card';
        const image = document.createElement('img'); image.alt = item.label; image.referrerPolicy = 'no-referrer';
        const label = document.createElement('label');
        const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = !canSelectImport(item);
        check.setAttribute('aria-label', tr('添加 ') + item.label); item.check = check;
        const status = document.createElement('p'); status.style.fontSize = '12px';
        const savedStatus = hasSharedDetails(item) ? ui('已收藏 · 可导入名称和关键字','Already saved · Can import name and keywords') : tr('已收藏');
        status.textContent = item.saved ? savedStatus : tr('等待预览'); item.status = status;
        check.onchange = () => { item.selected = check.checked; updateImportButton(); };
        image.onload = () => {
          if (generation !== importGeneration) return;
          item.width = image.naturalWidth; item.height = image.naturalHeight;
          item.ready = item.width > 0 && item.height > 0 && item.width <= 20000 && item.height <= 20000;
          check.disabled = importingBusy || !canSelectImport(item);
          status.textContent = item.saved ? savedStatus : item.ready ? tr('预览就绪 · 可添加') : tr('图片尺寸无效');
          updateImportButton();
        };
        image.onerror = () => {
          if (generation !== importGeneration) return;
          item.ready = false; if (!item.saved) { item.selected = false; check.checked = false; } check.disabled = importingBusy || !canSelectImport(item);
          status.textContent = item.saved ? savedStatus : tr('预览不可用 · 不可添加'); updateImportButton();
        };
        label.append(check, item.label); card.append(image, label, status);
        if (hasSharedDetails(item) && personalRecords().has(savedStickerId(item.gifId) || item.gifId)) {
          const policy = document.createElement('select'); policy.setAttribute('aria-label',ui('重名处理 ','Name conflict for ')+item.label);
          policy.append(new Option(ui('保留我的名称，合并关键字','Keep my name and merge keywords'),'keep'),
            new Option(ui('使用分享名称，合并关键字','Use shared name and merge keywords'),'replace'));
          policy.disabled = !importDetails(item);
          policy.onchange = () => item.metadataPolicy = policy.value;
          item.policy = policy; card.append(policy);
        }
        $('#importPreview').append(card);
        image.src = item.url;
      }
      $('#importStatus').textContent = ui(`共 ${imported.length} 个表情，已收藏 ${imported.filter(item => item.saved).length} 个。请勾选预览成功的表情，确认后添加。`, `${imported.length} stickers; ${imported.filter(item => item.saved).length} already saved. Select stickers with ready previews, then confirm adding them.`);
    } catch (error) {
      if (generation !== importGeneration) return;
      imported = []; $('#importPreview').replaceChildren();
      $('#importStatus').textContent = tr(error.message); updateImportButton();
    }
  };
  $('#shareImportMetadata').onchange=()=>{
    for(const item of imported){
      item.check.disabled=importingBusy || !canSelectImport(item);
      if(item.check.disabled){item.selected=false;item.check.checked=false;}
      if(item.policy)item.policy.disabled=importingBusy || !importDetails(item);
    }
    updateImportButton();
  };
  $('#importConfirm').onclick = async () => {
    if (importingBusy || deleting || sendingBusy || metadataSaving || scanning || importNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#importStatus').textContent = tr(error.message); return; }
    const selected = imported.filter(item => item.selected && canSelectImport(item));
    if (!selected.length) return;
    const generation = importGeneration;
    const metadataRevision=personalSnapshot.revision,metadataPlan=new Map();
    try{
      if(selected.some(importDetails)){
        const current=personalRecords();
        for(const item of selected.filter(importDetails)){
          const savedId=savedStickerId(item.gifId) || item.gifId;
          const shared={label:item.label,keywords:[...item.keywords]};
          const replace=item.metadataPolicy==='replace', now=new Date().toISOString();
          mergeSharedPersonalRecord(current.get(savedId),shared,savedId,replace,now);
          metadataPlan.set(item.gifId,{shared,replace,now});
        }
      }
    }catch(error){$('#importStatus').textContent=metadataMessage(error.message);return;}
    importingBusy = true; importStopped = false;
    let stopObservingRefresh=()=>{};
    for (const id of ['importCode', 'importParse', 'importSelect', 'importConfirm', 'remove', 'scan']) $('#' + id).disabled = true;
    imported.forEach(item => { item.check.disabled = true; if(item.policy)item.policy.disabled=true; });
    $('#shareImportMetadata').disabled = true;
    $('#importStop').hidden = false; count();
    try {
      const newStickers=selected.filter(item=>!alreadySaved(item.gifId));
      const result = newStickers.length ? await addSharedStickers(newStickers, {
        accountId: () => nativeWorkspaceAccountId(importServices),
        active: () => host.isConnected && importGeneration === generation && nativeWorkspaceAccountId(importServices) === importAccountId,
        stopped: () => importStopped,
        has: alreadySaved, pause: pauseImport,
        report: text => $('#importStatus').textContent = ui(text, text.replace(/^正在添加 (\d+) \/ (\d+)…$/, 'Adding $1 / $2…')),
        add: item => {
          stopObservingRefresh();stopObservingRefresh=observeImportRefresh(item);
          return importServices.actions.actionAddCustomStickerFromMessage({tag:importServices.tag,
            content:{fileId:item.gifId,width:item.width,height:item.height}});
        },
      }) : {added:0,skipped:0,stopped:false};
      let notes=0;
      if(metadataPlan.size && !result.stopped){
        assertWorkspaceAccount();if(personalSnapshot.revision!==metadataRevision)throw Error('METADATA_CHANGED');
        const records=personalRecords();
        for(const [id,plan] of metadataPlan){
          const savedId=savedStickerId(id);
          if(!savedId)continue;
          records.set(savedId,mergeSharedPersonalRecord(records.get(savedId),plan.shared,savedId,plan.replace,plan.now));
          notes++;
        }
        if(notes)await savePersonalRows([...records.values()]);
      }
      const details = notes ? ui('已导入 ' + notes + ' 张表情的名称和关键字。', 'Imported names and keywords for ' + notes + (notes === 1 ? ' sticker. ' : ' stickers. ')) : '';
      $('#importStatus').textContent = details + ui(`页面收藏已观察到添加 ${result.added} 个，跳过 ${result.skipped} 个${result.stopped ? '，已停止后续添加' : ''}。请刷新 SeaTalk 核对保存结果。`, `Addition observed for ${result.added} stickers; ${result.skipped} skipped.${result.stopped ? ' Later additions stopped.' : ''} Reload SeaTalk to check saved results.`); notifyAction($('#importStatus').textContent, result.stopped ? 'info' : 'success');
    } catch (error) { importNeedsReview = true; $('#importStatus').textContent = error.message.startsWith('METADATA_') ? metadataMessage(error.message) : tr(error.message); notifyAction($('#importStatus').textContent, 'error'); }
    finally {
      stopObservingRefresh();
      importingBusy = false; $('#importStop').hidden = true;
      for (const id of ['importCode', 'importParse', 'importSelect', 'remove', 'scan']) $('#' + id).disabled = false;
      for (const item of imported) {
        try { item.saved = alreadySaved(item.gifId); } catch (_) { /* Keep uncertain results unconfirmed. */ }
        if (item.saved) {
          item.selected = false; item.check.checked = false; item.status.textContent = tr('已收藏');
          const canonicalId=savedStickerId(item.gifId);
          const existing = items.find(old => old.gifId === canonicalId);
          if (existing) existing.deleted = false;
          else {
            const native = ownList().find(entry => entry.id === canonicalId || entry.url === canonicalId);
            const number = items.length+1, providedName = known.get(canonicalId) || native?.name;
            const generatedName = providedName ? null : ui('收藏 '+number,'Favorite '+number);
            const originalLabel = String(providedName || generatedName).slice(0,80);
            items.push({gifId:canonicalId,label:originalLabel,originalLabel,generatedName,number,url:validPreviewUrl(importServices.fileUrl,canonicalId),existing:known.has(canonicalId),selected:false,animation:'unknown'});
          }
        }
        item.check.disabled = !canSelectImport(item);
        if(item.policy)item.policy.disabled=!importDetails(item);
      }
      refreshPersonalLabels(); updateImportButton(); render();
    }
  };
  host.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyJ') {
      event.preventDefault(); $('#hiddenTools').hidden = !$('#hiddenTools').hidden;
    }
  });
