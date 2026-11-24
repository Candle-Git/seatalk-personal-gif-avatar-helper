/* Mount beside the native sticker control only while a conversation has a composer. */
function installQuickPickerToolbar(onOpen, getLocale) {
  const toolbarSelector = ':scope > .toolbar > .toolbar-left';
  const buttonId = 'spga-quick-toggle';
  const button = document.createElement('button');
  button.type = 'button';
  button.id = buttonId;
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.className = 'icon-container';
  const mascot = document.createElement('img');
  mascot.src = 'data:image/png;base64,__QUICK_PICKER_SEAL__';
  mascot.alt = '';
  mascot.setAttribute('aria-hidden', 'true');
  mascot.draggable = false;
  mascot.width = mascot.height = 28;
  mascot.style.cssText = 'display:block;object-fit:contain;pointer-events:none';
  button.append(mascot);
  const title = () => getLocale() === 'en' ? 'Quick stickers' : '表情快选';
  const homeCopy = () => getLocale() === 'en'
    ? 'Sticker Helper loaded · Find this icon beside the chat input'
    : '表情助手已加载 · 入口在聊天输入框旁';
  const homeSelector = '#root .home-main-window';
  const chatTitleSelector = '.messages-message-detail-view-header .title-wrap > .title';
  const homeHintKey = 'spga:quick-picker:home-hint-seen';
  function readHomeHintSeen() {
    try { return GM_getValue(homeHintKey, false) === true; } catch (_) { return false; }
  }
  function updateLocale() {
    button.title = title();
    button.setAttribute('aria-label', title());
    if (tip?.isConnected) tip.lastChild.textContent = tip.dataset.hint === 'home' ? homeCopy() : title();
  }
  let tip = null, tipTimer = 0, tipShown = false, pending = false;
  let homeTimer = 0, homeHintSeen = readHomeHintSeen();
  function removeTip() {
    clearTimeout(tipTimer);
    tip?.remove();
    tip = null;
  }
  function showTip(kind, position, duration) {
    removeTip();
    tip = document.createElement('span');
    tip.dataset.hint = kind;
    tip.setAttribute('role', 'status');
    if (kind === 'home') {
      const icon = mascot.cloneNode(false);
      icon.style.flex = 'none';
      tip.append(icon);
    }
    tip.append(document.createTextNode(kind === 'home' ? homeCopy() : title()));
    tip.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;padding:6px 10px;border-radius:7px;background:#24364d;color:white;font:13px/1.4 system-ui,sans-serif;box-shadow:0 3px 12px #17203322;' + position;
    document.body.append(tip);
    tipTimer = setTimeout(removeTip, duration);
  }
  function onScreen(node) {
    if (!node || (node.checkVisibility && !node.checkVisibility({opacityProperty:true,visibilityProperty:true}))) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function clearHomeTimer() { clearTimeout(homeTimer); homeTimer = 0; }
  function isIdleHome(home) {
    return !document.hidden && !tipShown && onScreen(home) &&
      ![...home.querySelectorAll('.messages-message-editor,' + chatTitleSelector)].some(onScreen);
  }
  function updateHomeTip(home) {
    if (!isIdleHome(home)) {
      clearHomeTimer();
      if (tip?.dataset.hint === 'home') removeTip();
    } else if (!homeHintSeen && !homeTimer) {
      // Give a conversation restored on startup time to mount before offering a home hint.
      homeTimer = setTimeout(() => {
        homeTimer = 0;
        if (!isIdleHome(document.querySelector(homeSelector))) return;
        homeHintSeen = true;
        if (readHomeHintSeen()) return;
        showTip('home','display:flex;align-items:center;gap:8px;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 28px);box-sizing:border-box;',4000);
        try { GM_setValue(homeHintKey, true); } catch (_) { /* This document still shows the hint only once. */ }
      }, 550);
    }
  }
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const observed = new Set();
  function mount() {
    pending = false;
    const composers = [...document.querySelectorAll('.messages-message-editor')];
    const toolbars = composers.map(editor => editor.querySelector(toolbarSelector)).filter(Boolean);
    const home = !homeHintSeen || tip?.dataset.hint === 'home' ? document.querySelector(homeSelector) : null;
    const sizeTargets = home ? [...toolbars, home] : toolbars;
    for (const item of observed) if (!sizeTargets.includes(item)) { sizeObserver?.unobserve(item); observed.delete(item); }
    for (const item of sizeTargets) if (!observed.has(item)) { sizeObserver?.observe(item); observed.add(item); }
    const visible = toolbars.filter(item => item.getClientRects().length);
    const toolbar = visible.length === 1 ? visible[0] : null;
    if (!toolbar || !toolbar.getClientRects().length) {
      if (button.isConnected) button.remove();
      if (tip?.dataset.hint === 'toolbar') removeTip();
      updateHomeTip(home);
      return;
    }
    clearHomeTimer();
    if (tip?.dataset.hint === 'home' || document.hidden) removeTip();
    if (button.parentElement !== toolbar) {
      const native = toolbar.querySelector(':scope > .icon-container');
      if (native) native.after(button);
      else toolbar.prepend(button);
    }
    if (tipShown || document.hidden || !onScreen(button)) return;
    const rect = button.getBoundingClientRect();
    tipShown = true;
    const left = Math.max(4, Math.min(innerWidth - 108, rect.left)), top = Math.max(4, rect.top - 35);
    showTip('toolbar','white-space:nowrap;left:' + left + 'px;top:' + top + 'px;',3000);
  }
  function schedule() { if (!pending) { pending = true; queueMicrotask(mount); } }
  button.addEventListener('click', event => {
    event.stopPropagation();
    tipShown = true;
    removeTip();
    onOpen();
  });
  updateLocale();
  window.addEventListener('spga:locale-change', updateLocale);
  window.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && tip) removeTip(); });
  // Reconcile native view mounts without polling or inspecting messages.
  const editorParts = '.home-main-window,.messages-message-editor,.messages-message-detail-view-header,.toolbar,.toolbar-left';
  const hasEditorPart = node => node === button || node.nodeType === 1 && (node.matches(editorParts) || !!node.querySelector(editorParts));
  new MutationObserver(records => {
    if (records.some(record => record.target === button.parentNode || [...record.addedNodes, ...record.removedNodes].some(hasEditorPart))) schedule();
  }).observe(document.body, {childList:true, subtree:true});
  // Also covers a mounted toolbar becoming visible without a child-list mutation.
  if (typeof IntersectionObserver === 'function') {
    const canTrackVisibility = typeof IntersectionObserverEntry !== 'undefined' && 'isVisible' in IntersectionObserverEntry.prototype;
    const visibility = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) schedule();
    }, canTrackVisibility ? {trackVisibility:true, delay:100} : {});
    visibility.observe(button);
  }
  mount();
}
