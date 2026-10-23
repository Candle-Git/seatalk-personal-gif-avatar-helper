  async function detect(item) {
    const controller = new AbortController(); activeRequests.add(controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    let decoder, reader;
    try {
      const response = await fetch(item.url, { credentials: 'include', signal: controller.signal });
      if (!response.ok || Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw Error('unavailable');
      reader = response.body.getReader(); const chunks = []; let length = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength; if (length > 20 * 1024 * 1024) throw Error('too large');
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
      const type = ascii(0, 3) === 'GIF' ? 'image/gif' : ascii(1, 4) === 'PNG' ? 'image/png' : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : '';
      if (!type || !('ImageDecoder' in window)) throw Error('unsupported');
      decoder = new ImageDecoder({ data: bytes, type }); await decoder.tracks.ready;
      const frames = decoder.tracks.selectedTrack?.frameCount;
      if (!Number.isInteger(frames) || frames < 1) throw Error('unknown');
      if (!scanCancelled && !controller.signal.aborted) item.animation = frames > 1 ? 'animated' : 'static';
    } catch (_) {
      if (!scanCancelled) item.animation = controller.signal.aborted ? 'unknown' : 'failed';
    } finally {
      clearTimeout(timer); decoder?.close(); activeRequests.delete(controller);
      if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }
  $('#scanStop').onclick = () => { scanCancelled = true; activeRequests.forEach(controller => controller.abort()); };
  $('#scan').onclick = async () => {
    if (scanning || busy()) return;
    scanning = true; scanCancelled = false; $('#scanStop').hidden = false; count();
    const queue = activeItems().filter(item => ['unknown', 'failed'].includes(item.animation));
    let next = 0, done = 0;
    const status = () => {
      $('#scanStatus').textContent = queue.length ? ui(`正在识别 ${done} / ${queue.length}，筛选条件和选择都会保留。`, `Inspecting ${done} / ${queue.length}. Filters and selections are kept.`) : tr('已经完成分类，无需重复检测。');
      updateSummary();
    };
    status(); renderEmpty();
    const worker = async () => {
      while (!scanCancelled && next < queue.length && host.isConnected) {
        const item = queue[next++]; await detect(item); done++; status();
        const badge = [...root.querySelectorAll('.badge')].find(element => element.dataset.id === item.gifId);
        if (badge) { badge.textContent = badgeText(item); badge.dataset.kind = effectiveAnimation(item); badge.title = ui('自动检测：','Automatic detection: ')+detectionText(item); }
      }
    };
    try { await Promise.all([worker(), worker(), worker()]); }
    finally {
      scanning = false; $('#scanStop').hidden = true;
      const failures = activeItems().filter(item => item.animation === 'failed').length;
      $('#scanStatus').textContent = scanCancelled ? tr('已停止识别，已完成的分类仍然保留。') : queue.length
        ? ui(`识别完成${failures ? `，${failures} 个未能识别，可再次点击重试` : ''}。`, `Inspection complete.${failures ? ` ${failures} could not be identified. Inspect again to retry.` : ''}`) : tr('已经完成分类，无需重复检测。');
      updateSummary();
      if ($('#animation').value !== 'all' || $('#detectionFilter').value !== 'all') { const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll; }
      else { count(); renderEmpty(); }
    }
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  $('#remove').onclick = () => {
    if (busy() || scanning || deleteNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = tr(error.message); count(); return; }
    pending = selection().map(item => Object.freeze({ gifId: item.gifId, url: item.url, label: item.label }));
    if (!pending.length) return;
    const outside = selectionOutside();
    $('#deleteSummary').textContent = ui(`即将移除 ${pending.length} 个收藏${outside ? `，其中 ${outside} 个不在当前筛选中` : ''}。不会删除聊天消息。`, `Remove ${pending.length} favorites${outside ? `, including ${outside} outside the current filter` : ''}. Chat messages will not be deleted.`);
    $('#deletePreview').replaceChildren();
    for (const item of pending) {
      const image = document.createElement('img'); image.src = item.url; image.alt = item.label; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      $('#deletePreview').append(image);
    }
    $('#deleteProgress').textContent = ''; $('#deleteConfirm').disabled = false; $('#deleteCancel').disabled = false; $('#deleteCancel').textContent = tr('取消');
    if (openDialog($('#deletion'))) $('#deleteCancel').focus();
  };
  $('#deleteCancel').onclick = () => { if (!deleting) closeDialog($('#deletion')); };
  $('#deletion').addEventListener('cancel', event => { if (deleting) { event.preventDefault(); stop = true; $('#deleteProgress').textContent = tr('正在等待当前结果，随后停止。'); } });
  $('#deleteStop').onclick = () => { stop = true; $('#deleteProgress').textContent = tr('正在等待当前结果，随后停止。'); };
  $('#deleteConfirm').onclick = async () => {
    if (deleting || importingBusy || sendingBusy || metadataSaving || !pending.length || deleteNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { deleteNeedsReview = true; $('#deleteProgress').textContent = tr(error.message); count(); return; }
    deleting = true; stop = false; $('#deleteConfirm').disabled = $('#deleteCancel').disabled = true; $('#deleteStop').hidden = false; count();
    let done = 0, error = '';
    try {
      for (const item of pending) {
        if (stop) break;
        assertWorkspaceAccount();
        const current = liveSource();
        if (!current.list.some(sticker => sticker.id === item.gifId)) { error = tr('收藏列表已变化，已停止。'); break; }
        $('#deleteProgress').textContent = ui(`正在移除 ${done + 1} / ${pending.length}…`, `Removing ${done + 1} / ${pending.length}…`);
        assertWorkspaceAccount();
        await current.actions.actionRemoveCustomStickers([item.gifId]);
        assertWorkspaceAccount();
        let absent = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          await pause(500); assertWorkspaceAccount();
          if (!liveSource().list.some(sticker => sticker.id === item.gifId)) { absent = true; break; }
        }
        if (!absent) { error = tr('本次结果未确认，已停止。'); break; }
        const original = items.find(value => value.gifId === item.gifId);
        original.deleted = true; original.selected = false; done++; count();
        await pause(800);
      }
    } catch (_) { error = tr('删除请求未确认，已停止后续操作。'); }
    finally {
      deleting = false; deleteNeedsReview = Boolean(error); $('#deleteStop').hidden = true; $('#deleteCancel').disabled = false;
      $('#deleteCancel').textContent = tr('返回管理');
      $('#deleteProgress').textContent = ui(`页面收藏已观察到移除 ${done} / ${pending.length} 个。${language.textFor(error, 'zh') || (stop ? '已停止后续删除。' : '')}请刷新 SeaTalk 核对保存结果。`, `Removal observed for ${done} / ${pending.length} favorites. ${language.textFor(error, 'en') || (stop ? 'Later removals stopped. ' : '')} Reload SeaTalk to check saved results.`);
      render();
    }
  };
