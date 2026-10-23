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
  function observeImportRefresh(item) {
    if (globalThis.__SPGA_TEST_MODE__ === true) return () => {};
    const originalFetch=window.fetch, account=importAccountId, generation=importGeneration;
    const allowedHost=new URL(validPreviewUrl(importServices.fileUrl,item.gifId)).hostname;
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
              if(active && generation===importGeneration && account===importAccountId &&
                nativeWorkspaceAccountId(importServices)===account && host.isConnected &&
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
    const links = [...new Set(Array.from(document.querySelectorAll('link[href],script[src]'), e => e.href || e.src || ''))];
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
    const [module, constants, accountModule] = await Promise.all([
      import(locate('styles')), import(locate('db-pure')), import(locate('src')),
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
        {gifId:item.gifId,label:item.label,keywords:item.metadata?.keywords || [],visibleText:item.metadata?.visibleText || ''} : {gifId:item.gifId,label:'Sticker '+(index+1)}));
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
  const updateImportButton = () => {
    $('#importConfirm').disabled = importingBusy || importNeedsReview || !imported.some(item => item.selected && (item.ready && !item.saved || item.saved && $('#shareImportMetadata').checked));
  };
  $('#importOpen').onclick = () => {
    if (deleting || importingBusy || scanning) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = tr(error.message); count(); return; }
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
      for (const item of imported) {
        const card = document.createElement('div'); card.className = 'import-card';
        const image = document.createElement('img'); image.alt = item.label; image.referrerPolicy = 'no-referrer';
        const label = document.createElement('label');
        const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = !(item.saved && $('#shareImportMetadata').checked);
        check.setAttribute('aria-label', tr('添加 ') + item.label); item.check = check;
        const status = document.createElement('p'); status.style.fontSize = '12px';
        status.textContent = item.saved ? ui('已收藏 · 可选择导入备注','Already saved · Can import notes') : tr('等待预览'); item.status = status;
        check.onchange = () => { item.selected = check.checked; updateImportButton(); };
        image.onload = () => {
          if (generation !== importGeneration) return;
          item.width = image.naturalWidth; item.height = image.naturalHeight;
          item.ready = item.width > 0 && item.height > 0 && item.width <= 20000 && item.height <= 20000;
          check.disabled = importingBusy || !(item.saved ? $('#shareImportMetadata').checked : item.ready);
          status.textContent = item.saved ? ui('已收藏 · 可选择导入备注','Already saved · Can import notes') : item.ready ? tr('预览就绪 · 可添加') : tr('图片尺寸无效');
          updateImportButton();
        };
        image.onerror = () => {
          if (generation !== importGeneration) return;
          item.ready = false; if (!item.saved) { item.selected = false; check.checked = false; } check.disabled = !(item.saved && $('#shareImportMetadata').checked);
          status.textContent = item.saved ? ui('已有收藏，可导入备注；预览不可用','Already saved; notes can be imported. Preview unavailable.') : tr('预览不可用 · 不可添加'); updateImportButton();
        };
        const policy=document.createElement('select');policy.setAttribute('aria-label',ui('备注冲突处理 ','Note conflict policy: ')+item.label);
        for(const [value,zh,en] of [['keep','保留我的备注，合并关键词','Keep my note, merge keywords'],['replace','使用分享备注，合并关键词','Use shared note, merge keywords']]){const option=document.createElement('option');option.value=value;option.textContent=ui(zh,en);policy.append(option);}
        policy.disabled=!personalRecords().has(item.gifId);policy.onchange=()=>item.metadataPolicy=policy.value;
        label.append(check, item.label); card.append(image, label, status, policy); $('#importPreview').append(card);
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
    for(const item of imported){item.check.disabled=!(item.saved ? $('#shareImportMetadata').checked : item.ready);if(item.check.disabled){item.selected=false;item.check.checked=false;}}
    updateImportButton();
  };
  $('#importConfirm').onclick = async () => {
    if (importingBusy || deleting || sendingBusy || metadataSaving || scanning || importNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#importStatus').textContent = tr(error.message); return; }
    const selected = imported.filter(item => item.selected && (item.ready && !item.saved || item.saved && $('#shareImportMetadata').checked));
    if (!selected.length) return;
    const generation = importGeneration;
    const metadataRevision=personalSnapshot.revision,metadataPlan=new Map();
    try{
      if($('#shareImportMetadata').checked){
        for(const item of selected){
          const incoming=normalizePersonalRecord({gifId:item.gifId,name:item.label,keywords:item.keywords || [],visibleText:item.visibleText || '',animationOverride:personalRecords().get(savedStickerId(item.gifId) || item.gifId)?.animationOverride || 'auto',source:'shared',updatedAt:new Date().toISOString()});
          metadataPlan.set(item.gifId,mergePersonalRecord(personalRecords().get(savedStickerId(item.gifId) || item.gifId),incoming,item.metadataPolicy==='replace',true));
        }
      }
    }catch(error){$('#importStatus').textContent=metadataMessage(error.message);return;}
    importingBusy = true; importStopped = false;
    let stopObservingRefresh=()=>{};
    for (const id of ['importCode', 'importParse', 'importSelect', 'importConfirm', 'remove', 'scan']) $('#' + id).disabled = true;
    imported.forEach(item => item.check.disabled = true);
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
        for(const [id,row] of metadataPlan){const savedId=savedStickerId(id);if(savedId){const mapped=normalizePersonalRecord({...row,gifId:savedId});const choice=selected.find(item=>item.gifId===id);records.set(savedId,mergePersonalRecord(records.get(savedId),mapped,choice?.metadataPolicy==='replace',true));notes++;}}
        if(notes)await savePersonalRows([...records.values()]);
      }
      $('#importStatus').textContent = ui(`已保存 ${notes} 条备注。`, `Saved ${notes} notes. `) + ui(`页面收藏已观察到添加 ${result.added} 个，跳过 ${result.skipped} 个${result.stopped ? '，已停止后续添加' : ''}。请刷新 SeaTalk 核对保存结果。`, `Addition observed for ${result.added} stickers; ${result.skipped} skipped.${result.stopped ? ' Later additions stopped.' : ''} Reload SeaTalk to check saved results.`); notifyAction($('#importStatus').textContent, result.stopped ? 'info' : 'success');
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
          else items.push({gifId:canonicalId,label:item.label,originalLabel:item.label,url:validPreviewUrl(importServices.fileUrl,canonicalId),existing:known.has(canonicalId),selected:false,animation:'unknown'});
        }
        item.check.disabled = !(item.saved ? $('#shareImportMetadata').checked : item.ready);
      }
      refreshPersonalLabels(); updateImportButton(); render();
    }
  };
  host.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyJ') {
      event.preventDefault(); $('#hiddenTools').hidden = !$('#hiddenTools').hidden;
    }
  });
