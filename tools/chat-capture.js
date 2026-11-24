  function stickerFromChatRow(row) {
    // An ordinary image, emoji reaction or quoted message is never a sticker selection.
    const selector = row.matches('.messages-message-list-item.sticker_c') ? '.messages-message-list-item-sticker-content img'
      : row.matches('.messages-message-list-item.image_c') ? '.messages-message-list-item-image-content img' : null;
    if (!selector) return null;
    const image = row.querySelector(selector);
    if (!image) return null;
    let url;
    try { url = new URL(image.currentSrc || image.src); } catch (_) { return null; }
    const id = url.pathname.match(/^\/download\/([a-zA-Z0-9]{64})(?:_|$)/)?.[1];
    if (!validMetadataId(id) || !isFavoritePreviewUrl(url,id)) return null;
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width > 20000 || height > 20000) return null;
    return {gifId:id, width, height, url:url.href};
  }

  function captureRowsBetween(rows, first, last, bounds) {
    const top = Math.max(bounds.top, Math.min(first, last));
    const bottom = Math.min(bounds.bottom, Math.max(first, last));
    return rows.filter(row => {
      const rect = row.getBoundingClientRect();
      return rect.width && rect.height && rect.bottom >= top && rect.top <= bottom;
    });
  }

  async function startChatStickerCapture() {
    if (busy() || scanning || root.querySelector('dialog[open]')) return;
    await workspaceReady;
    if (busy() || !favoritesSyncServices || !personalReady || importNeedsReview) {
      notifyAction(ui('请先载入收藏和个人设置。若上一次添加未确认，请刷新后核对。','Load favorites and personal settings first. After an unconfirmed addition, refresh and check favorites.'),'info');
      return;
    }
    const services = favoritesSyncServices;
    const lists = [...document.querySelectorAll('.messages-message-detail-view .messages-message-list')].filter(list=>list.getClientRects().length);
    const list = lists.length === 1 && lists[0];
    let account, target;
    try {
      account = assertWorkspaceAccount();
      target = currentStickerSendTarget(services, visibleSendEditor());
      if (!list || !Array.isArray(services.store.getState()?.messages?.customStickers)) throw Error();
      if (!services.store.getState().messages.customStickers.length) liveSource(false);
    } catch (_) {
      notifyAction(ui('请打开普通聊天及原生爱心收藏页，再试一次。','Open a direct or group chat and its Favorites tab, then try again.'),'info');
      return;
    }

    captureActive = true;
    host.dataset.open = host.dataset.managed = 'false';
    host.style.display = 'none'; mini.hidden = true;
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    const panel = document.createElement('aside');
    panel.id = 'spga-chat-capture';
    panel.style.cssText = 'position:fixed;z-index:2147483646;max-width:calc(100vw - 24px);';
    const box = panel.attachShadow({mode:'open'});
    box.innerHTML = `<style>
      :host{font:14px/1.45 system-ui;color:#17243b}*{box-sizing:border-box}
      section{padding:12px;background:white;border:1px solid #bdd3ec;border-radius:12px;box-shadow:0 5px 26px #19315030;min-width:min(330px,90vw);max-width:min(430px,90vw)}
      section{overflow-y:auto;overscroll-behavior:contain}
      .bar,.buttons{display:flex;gap:8px;align-items:center}.bar strong{flex:1}
      button,input,textarea,select{font:inherit}button{border:1px solid #cbd5e1;background:white;border-radius:6px;padding:5px 10px;cursor:pointer}
      button.primary{background:#1263b1;color:white;border-color:#1263b1}button:disabled{opacity:.5;cursor:default}
      p{margin:7px 0;color:#45566a}label,input,textarea,select{display:block;width:100%}label{margin:8px 0}
      input,textarea,select{border:1px solid #cbd5e1;border-radius:5px;padding:5px;background:white;color:inherit}textarea{resize:vertical}
      .images{display:flex;gap:4px;overflow:auto;max-height:58px}.images img{width:44px;height:44px;object-fit:contain}
      [hidden]{display:none!important}.buttons{justify-content:flex-end;margin-top:8px}
    </style><section role="region"><div class="bar"><strong></strong><button id="cancel" type="button"></button></div>
    <p id="help"></p><p id="stats" role="status"></p><div id="review" hidden><div class="images"></div>
    <label><span id="groupLabel"></span><select id="group"></select></label>
    <label id="newGroupField" hidden><span id="newGroupLabel"></span><input id="newGroupName" maxlength="60"></label>
    <label><span id="keywordsLabel"></span><input id="keywords" maxlength="2000"></label><p id="impact"></p></div>
    <div class="buttons"><button id="back" type="button" hidden></button><button class="primary" type="button" id="primary"></button></div></section>`;
    document.body.append(panel);
    const el = selector => box.querySelector(selector);
    el('strong').textContent = ui('从聊天收藏','Collect from chat');
    el('#cancel').textContent = ui('退出','Close');
    el('#help').textContent = ui('拖过消息选取表情（最多 100 张），单击已选表情可取消。','Drag across messages to select up to 100 stickers. Click a selected sticker to deselect it.');
    el('#groupLabel').textContent = tr('移到分组');
    el('#newGroupLabel').textContent = tr('新分组名称');
    el('#keywordsLabel').textContent = tr('追加搜索关键字');
    el('#keywords').placeholder = tr('用逗号分隔，例如：工作，上班，打工人');
    el('#back').textContent = ui('继续选择','Keep selecting');
    const chosen = new Map(), marks = new Map(), listeners = new AbortController();
    const signal = listeners.signal;
    let drag = null, mode = 'select', revision = null, reviewedFresh = new Set();
    let saving = false, stopRequested = false, issued = false, ended = false, unsubscribe;
    function validContext() {
      try { return !ended && list.isConnected && assertWorkspaceAccount() === account &&
        sameStickerSendTarget(target,currentStickerSendTarget(services,visibleSendEditor())); } catch (_) { return false; }
    }
    function position() {
      const rect = list.getBoundingClientRect();
      const form = el('section'), edge = 8;
      const top = Math.max(edge, Math.min(rect.top + edge, innerHeight - edge - form.offsetHeight));
      panel.style.top = top + 'px';
      form.style.maxHeight = Math.max(0, innerHeight - top - edge) + 'px';
      panel.style.right = Math.max(8,window.innerWidth-rect.right+8)+'px';
    }
    function finish() {
      if (ended) return;
      ended = true;
      listeners.abort(); unsubscribe?.(); observer.disconnect();
      if (drag && list.hasPointerCapture?.(drag.id)) list.releasePointerCapture(drag.id);
      selectionStyle.remove(); list.classList.remove('spga-capturing');
      for (const row of marks.keys()) row.classList.remove('spga-capture-picked');
      captureActive = false; panel.remove(); count();
      if (validReturnFocus()) document.getElementById('spga-quick-toggle')?.focus();
    }
    function validReturnFocus() { return host.isConnected && list.isConnected; }
    function changed() {
      if (!validContext()) {
        if (issued) importNeedsReview=true;
        finish();
        notifyAction(issued ? ui('聊天或账号已切换。已提交的表情可能已收藏，请刷新核对。','The chat or account changed. Submitted stickers may already be saved. Reload and check favorites.')
          : ui('聊天或账号已切换，已退出拖选。','The chat or account changed. Selection closed.'),'info');
      } else if (mode === 'select') paint();
    }
    const selectionStyle = document.createElement('style');
    selectionStyle.textContent = '.spga-capturing{cursor:crosshair!important;user-select:none!important}.spga-capturing .spga-capture-picked :is(.messages-message-list-item-sticker-content,.messages-message-list-item-image-content){outline:3px solid #1675c9;outline-offset:1px;border-radius:6px}';
    document.head.append(selectionStyle); list.classList.add('spga-capturing');
    const rows = () => [...list.querySelectorAll('.messages-message-list-item')];
    function paint() {
      for (const row of rows()) {
        const record = stickerFromChatRow(row), picked = !!record && chosen.has(record.gifId);
        row.classList.toggle('spga-capture-picked',picked);
        if (picked) marks.set(row,true); else marks.delete(row);
      }
      for (const row of marks.keys()) if (!list.contains(row)) { row.classList.remove('spga-capture-picked'); marks.delete(row); }
    }
    function saved(id) {
      const stored = services.store.getState().messages.customStickers;
      if (!Array.isArray(stored)) throw Error('CAPTURE_NO_FAVORITES');
      const alias = importedResourceIds.get(id);
      const match = stored.find(row=>row.id===id || row.url===id || (alias && (row.id===alias || row.url===alias)));
      return match && [match.id,match.url].find(validMetadataId) || null;
    }
    function idsForPlan() { return [...new Set([...chosen.keys()].map(id=>saved(id)||id))]; }
    function changes() {
      const group = readOrganizationGroup(el('#group'), el('#newGroupName')), keywords = splitPersonalKeywords(el('#keywords').value);
      if (el('#group').value === 'new' && !group) throw Error('GROUP_NAME_REQUIRED');
      return group === undefined ? {keywords} : {group,keywords};
    }
    function update() {
      const total = chosen.size, freshIds = [...chosen.keys()].filter(id=>!saved(id)), fresh = freshIds.length;
      el('#stats').textContent = ui(`已选 ${total} 张 · 待新增 ${fresh} 张 · 已收藏 ${total-fresh} 张`,`${total} selected · ${fresh} new · ${total-fresh} already saved`);
      if (mode === 'select') {
        el('#primary').textContent = ui('预览所选','Review selection'); el('#primary').disabled = !total;
        return;
      }
      reviewedFresh = new Set(freshIds);
      el('#newGroupField').hidden = el('#group').value !== 'new';
      try {
        const options = changes(), ids = idsForPlan(), plan = planPersonalOrganization(personalSnapshot,ids,options);
        el('#impact').textContent = options.keywords.length ? ui('将为 ' + plan.keywordChangedCount + ' 张添加关键字。', 'Add keywords to ' + plan.keywordChangedCount + ' stickers.') : '';
        let action = ui('完成','Done');
        if (plan.movedCount || plan.keywordChangedCount) action = fresh ? ui('确认收藏与整理','Add and organize') : tr('保存整理');
        else if (fresh) action = ui('确认收藏','Add to favorites');
        el('#primary').textContent = action;
        el('#primary').disabled = saving || !total;
      } catch (error) {
        el('#impact').textContent = error.message === 'GROUP_NAME_REQUIRED' ? ui('输入新分组名称。','Enter a name for the new group.') : metadataMessage(error.message);
        el('#primary').disabled = true;
      }
    }
    function selectRow(row, removing) {
      const item = stickerFromChatRow(row);
      if (!item) return;
      if (removing) chosen.delete(item.gifId);
      else if (chosen.size < 100) chosen.set(item.gifId,item);
    }
    list.addEventListener('pointerdown',event=>{
      if (mode !== 'select' || event.button !== 0 || !event.isPrimary || !validContext()) return;
      const row = event.target.closest('.messages-message-list-item');
      if (!row || !list.contains(row)) return;
      const item = stickerFromChatRow(row);
      drag = {id:event.pointerId, originY:event.clientY, lastY:event.clientY, moved:false, removing:!!item && chosen.has(item.gifId)};
      list.setPointerCapture(event.pointerId);
      event.preventDefault(); event.stopPropagation();
      // Use the actual event target for a click. Virtualized chat rows can overlap while scrolling.
      selectRow(row,drag.removing);
      paint(); update();
    },{capture:true,signal});
    list.addEventListener('pointermove',event=>{
      if (!drag || drag.id!==event.pointerId || !validContext()) return;
      if (!(event.buttons & 1)) { drag=null; return; }
      if (!drag.moved && Math.abs(event.clientY-drag.originY)<5) return;
      if (drag.lastY===event.clientY) return;
      drag.moved=true;
      for (const row of captureRowsBetween(rows(),drag.lastY,event.clientY,list.getBoundingClientRect())) selectRow(row,drag.removing);
      drag.lastY=event.clientY;
      paint(); update();
    },{capture:true,signal});
    function lift(e) { if(drag?.id===e.pointerId) drag=null; }
    for (const event of ['pointerup','pointercancel','lostpointercapture']) list.addEventListener(event,lift,{signal});
    list.addEventListener('click',e=>{if(mode==='select'){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal});
    function review(on) {
      if (!validContext()) { changed(); return; }
      mode = on?'review':'select'; revision = on?personalSnapshot.revision:null;
      el('#review').hidden = el('#back').hidden = on===false;
      el('#help').hidden = on;
      el('.images').replaceChildren();
      if (on) {
        const select = el('#group');
        populateOrganizationGroups(select, personalGroupNames(), select.value);
        for (const item of chosen.values()) { const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.src=item.url;el('.images').append(img); }
      }
      update(); if (on) el('#group').focus();
    }
    async function confirm() {
      if (saving || !validContext() || !chosen.size || mode!=='review' || el('#primary').disabled) return;
      let stopObserving=()=>{};
      try {
        const options=changes(), before=personalSnapshot;
        if (before.revision!==revision) throw Error('METADATA_CHANGED');
        const pending=[...chosen.values()].filter(item=>!saved(item.gifId)).map((item,i)=>({...item,label:'Sticker '+(i+1)}));
        if (pending.some(item=>!reviewedFresh.has(item.gifId))) { update(); return; }
        saving=true; el('#primary').disabled=true;el('#back').disabled=true;
        el('#cancel').textContent=ui('停止后续收藏','Stop remaining');
        el('#group').disabled=el('#newGroupName').disabled=el('#keywords').disabled=true;
        const requireContext = () => { if (!validContext()) throw Error('CAPTURE_CHANGED'); };
        requireContext();
        const result=pending.length ? await addSharedStickers(pending,{
          accountId:()=>nativeWorkspaceAccountId(services), active:validContext,
          stopped:()=>stopRequested, has:id=>!!saved(id), pause:pauseImport,
          report:text=>{el('#stats').textContent=language.locale==='zh'?text:ui('', 'Adding selected stickers…');},
          add:item=>{
            requireContext(); stopObserving();
            stopObserving=observeImportRefresh(item,{services,active:validContext});
            issued=true;
            return services.actions.actionAddCustomStickerFromMessage({tag:services.tag,content:{fileId:item.gifId,width:item.width,height:item.height}});
          }
        }):{added:0};
        requireContext();
        const exact=[...chosen.keys()].map(saved);
        const canonical=[...new Set(result.stopped ? exact.filter(Boolean) : exact)];
        if (canonical.some(id=>!id)) throw Error('CAPTURE_UNCONFIRMED');
        let metadataUpdated = false;
        if (canonical.length && ('group' in options || options.keywords.length)) {
          const mapped=planPersonalOrganization(before,canonical,options);
          if (mapped.movedCount || mapped.keywordChangedCount) {
            requireContext();
            await savePersonalOrganization(canonical,options,revision);
            requireContext();
            metadataUpdated = true;
          }
        }
        finish();
        if (result.stopped) {
          notifyAction(ui(`已停止后续收藏。已新增 ${result.added} 张，已核对 ${canonical.length} 张。`,`Stopped. Added ${result.added} and verified ${canonical.length} favorites.`),'info');
          return;
        }
        const summary = [];
        if (result.added) summary.push(ui(`已新增 ${result.added} 张`,`Added ${result.added}`));
        if (metadataUpdated) summary.push(ui('已保存整理','Changes saved'));
        if (!summary.length) summary.push(ui('所选表情均已收藏','All selected stickers are already saved'));
        notifyAction(summary.join(ui('，',', ')) + ui('。','.'),'success');
      } catch(error) {
        if (issued) importNeedsReview=true;
        if (ended) return;
        const message=error.message.startsWith('METADATA_')?metadataMessage(error.message):
          ui('结果未确认，请刷新并核对收藏。','Result unconfirmed. Reload and check favorites.');
        finish(); notifyAction(message,'error');
      } finally { stopObserving(); }
    }
    el('#primary').onclick=()=>{if(mode==='select')review(true);else void confirm();};
    el('#back').onclick=()=>review(false);
    const cancel=()=>{
      if (!saving) {finish();return;}
      stopRequested=true; el('#cancel').disabled=true;
      el('#stats').textContent=ui('正在等待当前收藏结果…','Waiting for the current sticker…');
    };
    el('#cancel').onclick=cancel;
    el('#group').onchange = () => {
      update();
      if (el('#group').value === 'new') el('#newGroupName').focus();
    };
    el('#keywords').oninput=el('#newGroupName').oninput=update;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel();}},{capture:true,signal});
    window.addEventListener('resize',position,{signal});
    const observer=new MutationObserver(changed);
    observer.observe(list,{childList:true,subtree:true});
    const detail=list.closest('.messages-message-detail-view'); if(detail?.parentElement) observer.observe(detail.parentElement,{childList:true,subtree:false});
    if(typeof services.store.subscribe==='function') unsubscribe=services.store.subscribe(changed);
    position(); update(); el('#cancel').focus();
  }
