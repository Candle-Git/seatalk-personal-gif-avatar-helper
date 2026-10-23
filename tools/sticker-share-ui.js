  let importingBusy = false, importStopped = false, importGeneration = 0, importNeedsReview = false;
  let imported = [], importServices = null, importAccountId = 0;
  const pauseImport = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ownList = () => {
    const list = importServices?.store.getState()?.messages?.customStickers;
    if (!Array.isArray(list)) throw Error('请先打开 SeaTalk 爱心收藏面板');
    return list;
  };
  const alreadySaved = id => ownList().some(item => item.id === id || item.url === id);
  function validPreviewUrl(fileUrl, id) {
    const url = new URL(fileUrl(id));
    if (url.protocol !== 'https:' || url.hostname !== 'f.haiserve.com' ||
        !url.pathname.startsWith('/download/' + id)) throw Error('无法生成安全的表情预览');
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
      if (matches.length !== 1) throw Error('未识别当前收藏服务，请登录 SeaTalk 后刷新');
      return matches[0];
    };
    const [module, constants, accountModule] = await Promise.all([
      import(locate('styles')), import(locate('db-pure')), import(locate('src')),
    ]);
    const one = (values, predicate) => {
      const found = [...new Set(values)].filter(predicate);
      if (found.length !== 1) throw Error('SeaTalk 收藏服务结构已变化，请停止操作并反馈');
      return found[0];
    };
    const values = Object.values(module);
    const actions = one(values, value => value && typeof value.actionAddCustomStickerFromMessage === 'function');
    const store = one(values, value => value && typeof value.getState === 'function' && typeof value.dispatch === 'function');
    const fileUrl = one(values, value => typeof value === 'function' && ['blob:', 'maxWidth', 'gfsToken'].every(word => String(value).includes(word)));
    const tags = one(Object.values(constants), value => value && typeof value === 'object' && typeof value.MESSAGE_CUSTOM_STICKER === 'string');
    const session = one(Object.values(accountModule), value => value && typeof value === 'object' &&
      value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
    return { actions, store, fileUrl, session, tag: tags.MESSAGE_CUSTOM_STICKER,
      accountId: () => {
        const current = [...new Set(Object.values(accountModule))].filter(value => value && typeof value === 'object' && value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
        return current.length === 1 ? current[0].userId : 0;
      } };
  }
  $('#shareOpen').onclick = () => {
    if (busy() || !selection().length || selection().length > 100) return;
    const selected = items.filter(item => item.selected && !item.deleted);
    try {
      $('#shareCode').value = encodeStickerShare(selected.map(({ gifId, label }) => ({ gifId, label })));
      $('#shareStatus').textContent = `共 ${selected.length} 个表情${selectionOutside() ? `，其中 ${selectionOutside()} 个不在当前筛选中` : ''}。请复制完整口令；表情越多，口令越长。`;
      if (openDialog($('#sharing'))) $('#shareCopy').focus();
    } catch (error) { $('#scanStatus').textContent = error.message; }
  };
  $('#shareCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#shareCode').value); $('#shareStatus').textContent = '分享口令已复制，发给朋友即可。'; }
    catch (_) { $('#shareCode').focus(); $('#shareCode').select(); $('#shareStatus').textContent = '请按 ⌘C / Ctrl+C 复制完整口令。'; }
  };
  $('#shareClose').onclick = () => closeDialog($('#sharing'));
  const updateImportButton = () => {
    $('#importConfirm').disabled = importingBusy || importNeedsReview || !imported.some(item => item.selected && item.ready && !item.saved);
  };
  $('#importOpen').onclick = () => {
    if (deleting || importingBusy || scanning) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = error.message; count(); return; }
    if (openDialog($('#importing'))) $('#importCode').focus();
  };
  function cancelImport() {
    if (importingBusy) { importStopped = true; $('#importStatus').textContent = '正在停止后续添加，等待当前表情结果…'; return; }
    importGeneration++; closeDialog($('#importing'));
  }
  $('#importCancel').onclick = cancelImport;
  $('#importing').addEventListener('cancel', event => { event.preventDefault(); cancelImport(); });
  $('#importStop').onclick = () => { importStopped = true; $('#importStatus').textContent = '正在停止后续添加，等待当前表情结果…'; };
  $('#importCode').oninput = () => {
    if (importingBusy) return;
    importGeneration++; imported = []; $('#importPreview').replaceChildren();
    $('#importStatus').textContent = '口令已变化，请重新解析预览。'; updateImportButton();
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
      $('#importStatus').textContent = '正在准备预览…';
      const found = await discoverShareServices();
      if (generation !== importGeneration || !$('#importing').open) return;
      importServices = found;
      const account = importServices.session;
      if (account.loggedIn !== true || !Number.isSafeInteger(account.userId) || account.userId <= 0) throw Error('请先登录 SeaTalk');
      assertWorkspaceAccount(); importAccountId = nativeWorkspaceAccountId(importServices);
      ownList();
      imported = stickers.map(item => ({ ...item, ready: false, selected: false, saved: alreadySaved(item.gifId),
        url: validPreviewUrl(importServices.fileUrl, item.gifId) }));
      for (const item of imported) {
        const card = document.createElement('div'); card.className = 'import-card';
        const image = document.createElement('img'); image.alt = item.label; image.referrerPolicy = 'no-referrer';
        const label = document.createElement('label');
        const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = true;
        check.setAttribute('aria-label', '添加 ' + item.label); item.check = check;
        const status = document.createElement('p'); status.style.fontSize = '12px';
        status.textContent = item.saved ? '已收藏 · 自动跳过' : '等待预览'; item.status = status;
        check.onchange = () => { item.selected = check.checked; updateImportButton(); };
        image.onload = () => {
          if (generation !== importGeneration) return;
          item.width = image.naturalWidth; item.height = image.naturalHeight;
          item.ready = item.width > 0 && item.height > 0 && item.width <= 20000 && item.height <= 20000;
          check.disabled = !item.ready || item.saved || importingBusy;
          status.textContent = item.saved ? '已收藏 · 自动跳过' : item.ready ? '预览就绪 · 可添加' : '图片尺寸无效';
          updateImportButton();
        };
        image.onerror = () => {
          if (generation !== importGeneration) return;
          item.ready = false; item.selected = false; check.checked = false; check.disabled = true;
          status.textContent = '预览不可用 · 不可添加'; updateImportButton();
        };
        label.append(check, item.label); card.append(image, label, status); $('#importPreview').append(card);
        image.src = item.url;
      }
      $('#importStatus').textContent = `共 ${imported.length} 个表情，已收藏 ${imported.filter(item => item.saved).length} 个。请勾选预览成功的表情，确认后添加。`;
    } catch (error) {
      if (generation !== importGeneration) return;
      imported = []; $('#importPreview').replaceChildren();
      $('#importStatus').textContent = error.message; updateImportButton();
    }
  };
  $('#importConfirm').onclick = async () => {
    if (importingBusy || deleting || scanning || importNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#importStatus').textContent = error.message; return; }
    const selected = imported.filter(item => item.selected && item.ready && !item.saved);
    if (!selected.length) return;
    const generation = importGeneration;
    importingBusy = true; importStopped = false;
    for (const id of ['importCode', 'importParse', 'importSelect', 'importConfirm', 'remove', 'scan']) $('#' + id).disabled = true;
    imported.forEach(item => item.check.disabled = true);
    $('#importStop').hidden = false; count();
    try {
      const result = await addSharedStickers(selected, {
        accountId: () => nativeWorkspaceAccountId(importServices),
        active: () => host.isConnected && importGeneration === generation && nativeWorkspaceAccountId(importServices) === importAccountId,
        stopped: () => importStopped,
        has: alreadySaved, pause: pauseImport,
        report: text => $('#importStatus').textContent = text,
        add: item => importServices.actions.actionAddCustomStickerFromMessage({ tag: importServices.tag,
          content: { fileId: item.gifId, width: item.width, height: item.height } }),
      });
      $('#importStatus').textContent = `页面收藏已观察到添加 ${result.added} 个，跳过 ${result.skipped} 个${result.stopped ? '，已停止后续添加' : ''}。请刷新 SeaTalk 核对保存结果。`;
    } catch (error) { importNeedsReview = true; $('#importStatus').textContent = error.message + '；请刷新收藏核对后再操作。'; }
    finally {
      importingBusy = false; $('#importStop').hidden = true;
      for (const id of ['importCode', 'importParse', 'importSelect', 'remove', 'scan']) $('#' + id).disabled = false;
      for (const item of imported) {
        try { item.saved = alreadySaved(item.gifId); } catch (_) { /* Keep uncertain results unconfirmed. */ }
        if (item.saved) {
          item.selected = false; item.check.checked = false; item.status.textContent = '已收藏';
          const existing = items.find(old => old.gifId === item.gifId);
          if (existing) existing.deleted = false;
          else items.push({ gifId: item.gifId, label: item.label, url: item.url, existing: known.has(item.gifId), selected: false, animation: 'unknown' });
        }
        item.check.disabled = item.saved || !item.ready;
      }
      updateImportButton(); render();
    }
  };
  host.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyJ') {
      event.preventDefault(); $('#hiddenTools').hidden = !$('#hiddenTools').hidden;
    }
  });
