  function quickFavoriteRows(source, records, presetNames, fallbackName) {
    const seenIds = new Set(), rows = [];
    for (const entry of source) {
      const gifId = [entry?.id, entry?.url].find(validMetadataId);
      if (!gifId || seenIds.has(gifId)) continue;
      seenIds.add(gifId);
      const record = records.get(gifId);
      const label = record?.name || presetNames.get(gifId) || entry.name || fallbackName(rows.length + 1);
      rows.push({gifId, label, metadata:record ? {...record,name:label} : {name:label}});
    }
    return rows;
  }
  function filterQuickFavorites(rows, query, newestFirst) {
    const matches = rows.filter(row => !query || personalMetadataMatches(row.metadata,query));
    return newestFirst ? matches : matches.reverse();
  }

  let quickView = null, quickOldestFirst = false;
  function closeQuickPicker(returnFocus = false) {
    if (!quickView) return;
    const view = quickView;
    quickView = null;
    view.unsubscribe?.();
    view.cleanup();
    view.panel.remove();
    view.anchor.setAttribute('aria-expanded','false');
    if (returnFocus && view.anchor.isConnected) view.anchor.focus();
  }
  function currentQuickList(services) {
    const stored = services.store.getState()?.messages?.customStickers;
    if (Array.isArray(stored) && stored.length) return {rows:stored, verified:true};
    try { return {rows:liveSource(false).list, verified:true}; }
    catch (_) { return {rows:[], verified:false}; }
  }
  function acceptQuickStickerClick(event, button, previous) {
    if (!event.isTrusted || event.detail > 1 || !button || button.disabled) return false;
    // A native list refresh can replace the clicked cell between two mouse clicks.
    // Chrome may start a new click count for the replacement under the pointer.
    if (event.detail === 1 && previous && !previous.button.isConnected &&
        event.timeStamp - previous.time < 700 &&
        Math.abs(event.clientX - previous.x) <= 4 && Math.abs(event.clientY - previous.y) <= 4) return false;
    return true;
  }
  function quickTargetMatches(view) {
    try {
      return !!view.services && nativeWorkspaceAccountId(view.services) === view.account &&
        sameStickerSendTarget(view.target,currentStickerSendTarget(view.services,visibleSendEditor()));
    } catch (_) { return false; }
  }
  async function sendQuickSticker(view, item) {
    if (view !== quickView || busy() || sendUncertain || !view.target) return;
    if (!quickTargetMatches(view)) { closeQuickPicker(); return; }
    const draft = {services:view.services, target:view.target, account:view.account, items:[item], invalid:false};
    // Latch even a transient switch away and back, including after the popup closes.
    const watch = () => { if (!quickTargetMatches(view)) draft.invalid = true; };
    const unsubscribe = draft.services.store.subscribe(watch);
    sendingBusy = true;
    count();
    view.status.textContent = ui('正在发送…','Sending…');
    view.grid.setAttribute('aria-busy','true');
    try {
      const result = await transmitStickerDraft(draft, {
        stopped:() => quickView !== view,
        beforeIssue:() => { if (quickView !== view || !quickTargetMatches(view)) throw Error('SEND_TARGET_CHANGED'); },
        progress:() => {},
      });
      if (result.sent && quickView === view) view.status.textContent = ui('已发送','Sent');
    } catch (error) {
      const message = sendMessage(sendUncertain ? 'SEND_UNCONFIRMED' : error.message);
      if (quickView === view) view.status.textContent = message;
      else if (sendUncertain || error.message === 'SEND_FAILED') notifyAction(message,'error');
    } finally {
      unsubscribe();
      sendingBusy = false;
      view.grid.removeAttribute('aria-busy');
      count();
    }
  }
  function openQuickPicker() {
    if (quickView) { closeQuickPicker(true); return; }
    if (busy() || root.querySelector('dialog[open]')) return;
    const anchor = document.getElementById('spga-quick-toggle');
    if (!anchor?.isConnected || !anchor.getClientRects().length) return;
    if (host.dataset.open === 'true' && !hideWorkspace()) return;
    if (!mini.hidden) mini.hidden = true;
    const panel = document.createElement('section');
    panel.id = 'st-quick-stickers';
    panel.lang = language.locale;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label', ui('表情快选','Quick stickers'));
    const quickRoot = panel.attachShadow({mode:'open'});
    quickRoot.innerHTML = `<style>
      :host{display:block;position:fixed;z-index:2147483646;width:min(378px,calc(100vw - 16px));font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#263447}
      *{box-sizing:border-box}.picker{display:flex;flex-direction:column;max-height:inherit;border:1px solid #d7e0ea;border-radius:12px;background:#fff;box-shadow:0 9px 32px #24364d2e;overflow:hidden}
      header,.searchbar,footer{display:flex;align-items:center;gap:8px;padding:8px 12px}header{background:#f3f6fa}header strong{font-size:15px}#target{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#667085;font-size:12px}
      button,input{font:inherit;color:inherit}button{background:transparent;border:0;border-radius:6px;padding:5px;cursor:pointer}button:hover,button:focus-visible{background:#edf4fd;color:#0866c6}button:focus-visible,input:focus-visible{outline:2px solid #3783cc;outline-offset:1px}
      .icon-action,#collect{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:34px;min-height:34px}.st-icon{flex:none;pointer-events:none}
      .search-field{position:relative;flex:1;min-width:0}.search-field>.st-icon{position:absolute;inset-inline-start:9px;top:50%;transform:translateY(-50%);color:#667085}
      .search-field input{width:100%;height:34px;border:1px solid #ccd6e2;border-radius:7px;padding:6px 8px;padding-inline-start:35px;background:#fff}#sort{border:1px solid #ccd6e2}
      #groupTabs{display:flex;align-items:center;gap:4px;padding:0 10px 4px;flex:none}#groupTabs[hidden]{display:none}
      #groupStrip{display:flex;min-width:0;gap:4px;overflow-x:auto;overscroll-behavior-x:contain;padding:3px;scrollbar-width:thin}
      #groupTabs button{flex:none;max-width:100%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border:1px solid #e1e7ee;border-radius:16px;background:white;color:#46556b;font-size:12px;min-height:28px;padding:3px 9px}
      #groupTabs button:hover,#groupStrip [aria-pressed=true]{background:#eaf3ff;color:#0757a6;border-color:#a9c9ee}
      #groupTabs #allGroups{background:#edf7f5;border-color:#acd6cf;color:#176258;font-weight:600}#groupTabs #allGroups[aria-pressed=true]{background:#14695e;border-color:#14695e;color:white}
      main{min-height:0;overflow:auto;overscroll-behavior:contain;padding:3px 10px;scrollbar-gutter:stable}#stickers{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}.sticker{min-width:0;aspect-ratio:1;display:grid;place-items:center;touch-action:manipulation}.sticker img{width:100%;height:100%;object-fit:contain;pointer-events:none}
      #status{flex:1;min-width:0;margin:0;color:#53657a;font-size:12px;overflow-wrap:anywhere}footer{flex-wrap:wrap;border-top:1px solid #e8edf2}footer button{color:#0866c6;font-weight:550}#collect{gap:5px}#collect:disabled{opacity:.5;cursor:default}
    </style><div class="picker"><header><strong></strong><span id="target"></span><button id="manage" class="icon-action" type="button">${stickerIcon('grid')}</button><button id="close" class="icon-action" type="button">${stickerIcon('x')}</button></header>
    <div class="searchbar"><label class="search-field">${stickerIcon('search')}<input type="search"></label><button id="sort" class="icon-action" type="button"></button></div>
    <div id="groupTabs" role="group" hidden><button id="allGroups" type="button"><span></span></button><div id="groupStrip"></div></div>
    <main><div id="stickers"></div></main><footer><p id="status" role="status" aria-live="polite"></p><button id="collect" type="button">${stickerIcon('collect')}<span></span></button></footer></div>`;
    const el = selector => quickRoot.querySelector(selector);
    const search = el('input'), sort = el('#sort'), grid = el('#stickers'), scroller = el('main'), status = el('#status');
    const groupTabs = el('#groupTabs'), allTab = el('#allGroups'), strip = el('#groupStrip');
    groupTabs.setAttribute('aria-label',tr('收藏分组'));
    function labelAction(button, label) {
      button.title = label;
      button.setAttribute('aria-label', label);
    }
    function renderSort() {
      const label = quickOldestFirst
        ? ui('最早在前，点击切换为最新在前','Oldest first. Switch to newest first')
        : ui('最新在前，点击切换为最早在前','Newest first. Switch to oldest first');
      sort.innerHTML = stickerIcon(quickOldestFirst ? 'sort-asc' : 'sort-desc');
      labelAction(sort, label);
    }
    el('strong').textContent = ui('表情快选','Quick stickers');
    search.placeholder = ui('搜索全部收藏','Search all favorites');
    search.setAttribute('aria-label',search.placeholder);
    renderSort();
    labelAction(el('#close'),ui('关闭','Close'));
    labelAction(el('#manage'),ui('管理表情','Manage stickers'));
    el('#collect span').textContent = ui('从聊天收藏','Collect from chat');
    status.textContent = ui('正在读取收藏…','Loading favorites…');
    const titles = [...document.querySelectorAll('.messages-message-detail-view-header .title-wrap > .title')].filter(node=>node.getClientRects().length);
    const openingTitle = titles.length === 1 ? titles[0] : null;
    const openingText = openingTitle?.textContent.trim() || '';
    const openingServices = favoritesSyncServices;
    let openingTarget = null, openingAccount = 0;
    if (openingServices) {
      try {
        openingTarget = currentStickerSendTarget(openingServices,visibleSendEditor());
        openingAccount = nativeWorkspaceAccountId(openingServices);
      } catch (_) { /* Management remains available without a sendable chat. */ }
    }
    const view = {panel,anchor,toolbar:anchor.parentElement,grid,status,services:null,account:0,target:null,unsubscribe:null,cleanup:()=>{}};
    quickView = view;
    anchor.setAttribute('aria-expanded','true');
    document.body.append(panel);

    function position() {
      if (!anchor.isConnected || !anchor.getClientRects().length) { closeQuickPicker(); return; }
      const rect = anchor.getBoundingClientRect();
      const below = innerHeight - rect.bottom, above = rect.top;
      const placeAbove = above >= below;
      panel.style.maxHeight = Math.max(100, Math.min(440, (placeAbove ? above : below) - 12)) + 'px';
      panel.style.left = Math.max(8,Math.min(innerWidth - panel.offsetWidth - 8,rect.left)) + 'px';
      if (placeAbove) { panel.style.bottom = (innerHeight - rect.top + 5) + 'px'; panel.style.top = 'auto'; }
      else { panel.style.top = (rect.bottom + 5) + 'px'; panel.style.bottom = 'auto'; }
    }
    function outside(event) {
      const path = event.composedPath();
      if (!path.includes(panel) && !path.includes(anchor)) closeQuickPicker();
    }
    function escape(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeQuickPicker(true); }
    }
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('keydown',escape,true);
    window.addEventListener('resize',position);
    window.addEventListener('scroll',position,true);
    function openingChatChanged() {
      return !anchor.isConnected || anchor.parentElement !== view.toolbar ||
        (openingTitle && (!openingTitle.isConnected || openingTitle.textContent.trim() !== openingText));
    }
    const titleWatch = new MutationObserver(() => { if (!view.target && quickView === view) closeQuickPicker(); });
    if (openingTitle) titleWatch.observe(openingTitle,{characterData:true,childList:true,subtree:true});
    const remount = new MutationObserver(() => { if (!host.isConnected || openingChatChanged()) closeQuickPicker(); });
    remount.observe(document.body,{childList:true,subtree:true});
    view.cleanup = () => {
      document.removeEventListener('pointerdown',outside,true); document.removeEventListener('keydown',escape,true);
      window.removeEventListener('resize',position); window.removeEventListener('scroll',position,true); remount.disconnect(); titleWatch.disconnect();
    };
    el('#close').onclick = () => closeQuickPicker(true);
    el('#manage').onclick = () => { if (!busy()) { closeQuickPicker(); revealWorkspace(); } };
    el('#collect').onclick = () => {
      if (busy() || !quickTargetMatches(view)) return;
      closeQuickPicker(); startChatStickerCapture();
    };
    el('#collect').disabled = true;
    position(); search.focus({preventScroll:true});

    let all = [], matches = [], loaded = 0, verified = false, lastSource = null;
    let selectedGroup = null;
    const byId = new Map();
    function chooseQuickGroup(group) {
      if (group === selectedGroup) return;
      selectedGroup = group;
      allTab.setAttribute('aria-pressed',String(group === null));
      for (const button of strip.children) button.setAttribute('aria-pressed',String(button.value === group));
      showMatches();
    }
    allTab.onclick = () => chooseQuickGroup(null);
    strip.addEventListener('focusin',keepGroupFocusVisible);
    function appendPage() {
      const end = Math.min(matches.length, loaded + 50);
      const fragment = document.createDocumentFragment();
      for (; loaded < end; loaded++) {
        const item = matches[loaded], button = document.createElement('button'), image = document.createElement('img');
        button.type = 'button'; button.className = 'sticker'; button.dataset.id = item.gifId;
        button.title = item.label; button.setAttribute('aria-label',item.label);
        image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.draggable = false;
        try { image.src = validPreviewUrl(view.services.fileUrl,item.gifId); }
        catch (_) { button.disabled = true; }
        button.append(image); fragment.append(button);
      }
      grid.append(fragment);
    }
    function showMatches() {
      const label = selectedGroup || tr('未分组');
      search.placeholder = selectedGroup === null ? ui('搜索全部收藏','Search all favorites') : ui('在「' + label + '」中搜索','Search in ' + label);
      search.setAttribute('aria-label',search.placeholder);
      const rows = selectedGroup === null ? all : all.filter(row => personalGroupFor(row.gifId) === selectedGroup);
      matches = filterQuickFavorites(rows,search.value,!quickOldestFirst);
      loaded = 0; scroller.scrollTop = 0; grid.replaceChildren(); appendPage();
      if (sendUncertain) status.textContent = sendMessage('SEND_UNCONFIRMED');
      else if (!verified) status.textContent = ui('请在原生表情面板打开一次爱心「收藏」，然后重新打开快选。','Open the Favorites heart in SeaTalk’s sticker picker once, then reopen Quick stickers.');
      else if (!matches.length && selectedGroup !== null) status.textContent = search.value
        ? ui('本组没有匹配的表情','No matching stickers in this group') : ui('这个分组还没有表情','No stickers in this group yet');
      else if (!matches.length) status.textContent = search.value ? ui('没有匹配的表情','No matching stickers') : ui('还没有收藏的表情','No favorites yet');
      else status.textContent = ui('点表情即可发送','Click a sticker to send');
    }
    function refresh(list, settingsChanged = false) {
      const settingsReady = personalReady && personalAccount === view.account;
      const next = quickFavoriteRows(list.rows,settingsReady ? personalRecords() : new Map(),known,n => ui('收藏 ' + n,'Favorite ' + n));
      const unchanged = lastSource && verified === list.verified && next.length === all.length &&
        next.every((row,index) => row.gifId === all[index].gifId && row.label === all[index].label);
      lastSource = list.rows;
      if (unchanged && !settingsChanged) return;
      verified = list.verified; all = next;
      const groups = settingsReady ? personalGroupNames() : [];
      const lostGroup = selectedGroup !== null && (!settingsReady || (selectedGroup !== '' && !groups.includes(selectedGroup)));
      const groupHadFocus = strip.contains(quickRoot.activeElement);
      if (lostGroup) selectedGroup = null;
      groupTabs.hidden = !settingsReady;
      if (settingsReady) fillGroupTabs(allTab, strip, all, groups, selectedGroup, chooseQuickGroup);
      if (lostGroup && groupHadFocus) (settingsReady ? allTab : search).focus({preventScroll:true});
      byId.clear(); for (const row of all) byId.set(row.gifId,row);
      showMatches();
    }
    search.oninput = showMatches;
    sort.onclick = () => { quickOldestFirst = !quickOldestFirst; renderSort(); showMatches(); };
    scroller.onscroll = () => { if (loaded < matches.length && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 90) appendPage(); };
    grid.addEventListener('keydown', event => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    let previousClick = null;
    grid.addEventListener('click', event => {
      const button = event.target.closest('button[data-id]');
      if (!acceptQuickStickerClick(event,button,previousClick)) return;
      previousClick = {button,time:event.timeStamp,x:event.clientX,y:event.clientY};
      event.stopPropagation();
      const item = byId.get(button.dataset.id);
      if (item) void sendQuickSticker(view,item);
    });
    Promise.resolve(workspaceReady).then(() => {
      if (view !== quickView) return;
      if (openingChatChanged()) { closeQuickPicker(); return; }
      assertWorkspaceAccount();
      const services = favoritesSyncServices;
      if (!services || typeof services.sendSticker !== 'function' || typeof services.store.subscribe !== 'function') throw Error('SEND_SERVICE_UNAVAILABLE');
      view.services = services; view.account = nativeWorkspaceAccountId(services);
      view.target = currentStickerSendTarget(services,visibleSendEditor());
      if (openingServices && (!sameStickerSendTarget(openingTarget,view.target) || openingAccount !== view.account)) { closeQuickPicker(); return; }
      if (!openingServices && !openingText) {
        view.target = null;
        status.textContent = ui('请重新打开快选，核对当前会话。','Reopen Quick stickers to verify the current chat.');
        return;
      }
      titleWatch.disconnect();
      el('#target').textContent = ui('发给 ','To ') + view.target.name;
      el('#target').title = view.target.name; el('#collect').disabled = false;
      view.refreshSettings = () => {
        if (quickView !== view) return;
        if (!quickTargetMatches(view)) { closeQuickPicker(); return; }
        refresh(currentQuickList(services),true);
      };
      refresh(currentQuickList(services));
      view.unsubscribe = services.store.subscribe(() => {
        if (!quickTargetMatches(view)) { closeQuickPicker(); return; }
        const stored = services.store.getState()?.messages?.customStickers;
        if (Array.isArray(stored) && stored !== lastSource && (stored.length || verified)) refresh(currentQuickList(services));
      });
    }).catch(error => {
      if (view === quickView) status.textContent = sendMessage(error.message);
    });
  }
  host.__openQuick = openQuickPicker;
