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

    const detail = list.closest('.messages-message-detail-view');
    const toolbarLeft = document.getElementById('spga-quick-toggle')?.closest('.toolbar-left');
    const toolbar = toolbarLeft?.parentElement;
    const editor = toolbar?.closest('.messages-message-editor');
    if (!editor || !detail.contains(editor)) {
      notifyAction(ui('请重新打开当前聊天的表情快选。','Reopen Quick stickers in the current chat.'),'info');
      return;
    }
    dismissActionNotice();
    captureActive = true;
    host.dataset.open = host.dataset.managed = 'false';
    host.style.display = 'none'; mini.hidden = true;
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    const panel = document.createElement('aside');
    panel.id = 'spga-chat-capture';
    const box = panel.attachShadow({mode:'open'});
    box.innerHTML = `<style>
      :host{display:block;min-width:0;max-width:100%;margin:0!important;color:inherit;font:13px/1.4 system-ui,sans-serif}
      *{box-sizing:border-box}[hidden]{display:none!important}
      .bar{display:flex;gap:8px;align-items:center;min-width:0}
      button,input,select,summary{font:inherit;color:inherit}button,summary{cursor:pointer}
      button{border:0;border-radius:7px;background:transparent;min-height:30px;padding:4px 9px;font-weight:550}
      .icon{display:inline-grid;place-items:center;width:30px;flex:none;padding:0}
      button:hover,summary:hover{background:color-mix(in srgb,currentColor 10%,transparent)}
      :focus-visible{outline:2px solid #438ed6;outline-offset:-2px}
      #primary{background:#196c61;color:white;white-space:nowrap}#primary:disabled{opacity:.5;cursor:default}
      #hint{display:inline-flex;align-items:center;gap:6px;flex:1;min-width:0}
      #stats{font-variant-numeric:tabular-nums}
      :host([data-review]){flex:1 1 auto;align-self:stretch;min-height:0;max-height:min(48vh,360px);overflow:auto;overscroll-behavior:contain;padding:6px 10px}
      :host([data-review]) .bar{flex-wrap:wrap;gap:4px 8px}
      .images{display:flex;gap:5px;overflow-x:auto;padding:5px 0}.images img{width:44px;height:44px;object-fit:contain;flex:none}
      details{margin-top:2px}summary{width:max-content;max-width:100%;border-radius:5px;padding:3px}
      .fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,160px),1fr));gap:8px;padding:5px 0}
      label{display:grid;gap:3px}input,select{width:100%;min-width:0;padding:4px;border:1px solid color-mix(in srgb,currentColor 35%,transparent);border-radius:5px;background:transparent}
      select option{background:Canvas;color:CanvasText}#impact{margin:3px 0}#impact:empty{display:none}
    </style><section role="region"><div class="bar">
      <button id="back" class="icon" type="button" hidden>${stickerIcon('prev')}</button>
      <span id="hint">${stickerIcon('collect')}<span id="stats" role="status"></span></span>
      <button type="button" id="primary"></button><button id="cancel" class="icon" type="button">${stickerIcon('x')}</button></div>
      <div id="review" hidden><div class="images"></div><details><summary></summary><div class="fields">
      <label><span id="groupLabel"></span><select id="group"></select></label>
      <label id="newGroupField" hidden><span id="newGroupLabel"></span><input id="newGroupName" maxlength="60"></label>
      <label><span id="keywordsLabel"></span><input id="keywords" maxlength="2000"></label></div></details><p id="impact" role="status"></p></div></section>`;
    const el = selector => box.querySelector(selector);
    function nameButton(selector, label) {
      const button = el(selector);
      button.title = label; button.setAttribute('aria-label',label);
    }
    el('section').setAttribute('aria-label',ui('从聊天收藏','Collect from chat'));
    const hint = ui('拖过消息选择表情，点已选表情可取消。最多 100 张。','Drag across stickers to select up to 100. Click a selected sticker to deselect it.');
    el('#hint').title = hint;
    el('section').setAttribute('aria-description',hint);
    nameButton('#cancel',ui('退出收藏 (Esc)','Exit collection (Esc)'));
    nameButton('#back',ui('继续选择','Keep selecting'));
    el('summary').textContent = ui('分组与关键字','Group and keywords');
    el('#groupLabel').textContent = ui('分组','Group');
    el('#newGroupLabel').textContent = tr('新分组名称');
    el('#keywordsLabel').textContent = ui('关键字','Keywords');
    el('#keywords').placeholder = ui('用逗号分隔','Separate with commas');
    toolbarLeft.append(panel);
    const chosen = new Map(), marks = new Map(), listeners = new AbortController();
    const signal = listeners.signal;
    let drag = null, mode = 'select', revision = null, reviewedFresh = new Set();
    let saving = false, stopRequested = false, issued = false, ended = false, unsubscribe;
    function validContext() {
      try { return !ended && list.isConnected && toolbarLeft.isConnected && editor.contains(panel) && detail.contains(editor) && assertWorkspaceAccount() === account &&
        sameStickerSendTarget(target,currentStickerSendTarget(services,visibleSendEditor())); } catch (_) { return false; }
    }
    function finish() {
      if (ended) return;
      ended = true;
      listeners.abort(); unsubscribe?.(); observer.disconnect();
      if (drag && list.hasPointerCapture?.(drag.id)) list.releasePointerCapture(drag.id);
      editor.classList.remove('spga-capture-positioned');
      selectionStyle.remove(); list.classList.remove('spga-capturing');
      for (const row of marks.keys()) row.classList.remove('spga-capture-picked');
      captureActive = false; panel.remove(); count();
      if (validReturnFocus()) document.getElementById('spga-quick-toggle')?.focus({preventScroll:true});
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
    selectionStyle.textContent = `
      .spga-capturing{cursor:crosshair!important;user-select:none!important}
      .spga-capturing .spga-capture-picked :is(.messages-message-list-item-sticker-content,.messages-message-list-item-image-content){outline:3px solid #1675c9;outline-offset:1px;border-radius:6px}
      .toolbar-left:has(>#spga-chat-capture){flex:1 1 auto;min-width:0}
      .toolbar-left>#spga-chat-capture{width:100%}
      .toolbar:has(>.toolbar-left>#spga-chat-capture)>:not(.toolbar-left),.toolbar-left:has(>#spga-chat-capture)>:not(#spga-chat-capture){display:none!important}
      .spga-capture-positioned{position:relative!important}
      .messages-message-editor:has(>#spga-chat-capture[data-review]){display:flex!important;flex-direction:column!important}
      .messages-message-editor:has(>#spga-chat-capture[data-review])>:not(#spga-chat-capture){position:absolute!important;visibility:hidden!important;pointer-events:none!important}
    `;
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
      const total = chosen.size;
      if (mode === 'select') {
        el('#stats').textContent = ui(`已选 ${total}`,`${total} selected`);
        el('#primary').textContent = ui('预览','Preview'); el('#primary').disabled = !total;
        return;
      }
      const freshIds = [...chosen.keys()].filter(id=>!saved(id)), fresh = freshIds.length;
      el('#stats').textContent = ui(`新增 ${fresh} · 已收藏 ${total-fresh}`,`${fresh} new · ${total-fresh} already saved`);
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
      panel.toggleAttribute('data-review',on);
      el('#hint').title = on ? '' : hint;
      if (on) {
        if (getComputedStyle(editor).position === 'static') editor.classList.add('spga-capture-positioned');
        editor.prepend(panel);
      } else {
        toolbarLeft.append(panel);
        editor.classList.remove('spga-capture-positioned');
      }
      el('.images').replaceChildren();
      if (on) {
        const select = el('#group');
        populateOrganizationGroups(select, personalGroupNames(), select.value);
        for (const item of chosen.values()) { const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.src=item.url;el('.images').append(img); }
      }
      update(); (on ? el('#back') : el('#primary')).focus({preventScroll:true});
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
        nameButton('#cancel',ui('停止后续收藏','Stop remaining'));
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
    document.addEventListener('keydown',e=>{if(e.key==='Escape' && !e.isComposing){e.preventDefault();e.stopPropagation();cancel();}},{capture:true,signal});
    const observer=new MutationObserver(changed);
    observer.observe(list,{childList:true,subtree:true});
    for (const node of [detail.parentElement,editor.parentElement,editor,toolbar,toolbarLeft]) {
      if (node) observer.observe(node,{childList:true});
    }
    if(typeof services.store.subscribe==='function') unsubscribe=services.store.subscribe(changed);
    update(); el('#cancel').focus({preventScroll:true});
  }
