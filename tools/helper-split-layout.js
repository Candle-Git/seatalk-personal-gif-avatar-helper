/* CSS-only side-by-side layout; native React nodes, zoom and chat content are untouched. */
function planHelperSplit(viewportWidth, kind, preferredWidth, nativeAvailable = true) {
  if (!nativeAvailable || !['favorites', 'avatar'].includes(kind) || !Number.isFinite(viewportWidth)) return null;
  const nativeMin = 900, gap = 36, min = kind === 'favorites' ? 460 : 340;
  const max = Math.min(kind === 'favorites' ? 800 : 460, viewportWidth - nativeMin - gap);
  if (max < min) return null;
  const fallback = kind === 'favorites' ? Math.min(760, viewportWidth * 0.38) : 390;
  const width = Math.round(Math.max(min, Math.min(max, Number.isFinite(preferredWidth) ? preferredWidth : fallback)));
  return { width, nativeWidth: viewportWidth - width - gap, min, max };
}
function installHelperLayout() {
  /* SPLIT_PLAN */
  if (window.__spgaHelperLayout) { window.__spgaHelperLayout.refresh(); return window.__spgaHelperLayout; }
  const root = document.documentElement, style = document.createElement('style');
  style.id = 'spga-helper-split-layout';
  style.textContent = `html[data-spga-dock-kind] #root .home-main-window {
    position:fixed!important;left:12px!important;top:12px!important;right:auto!important;bottom:auto!important;
    width:calc(100vw - var(--spga-dock-width) - 36px)!important;height:calc(100dvh - 24px)!important;
    min-width:0!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;border-radius:7px!important;}
    html[data-spga-dock-kind] #root .misc-info {visibility:hidden!important}
    html[data-spga-dock-kind="favorites"] #st-favorites-curator,
    html[data-spga-dock-kind="avatar"] #seatalk-personal-gif-avatar-panel {
      position:fixed!important;left:auto!important;right:12px!important;top:12px!important;bottom:auto!important;
      width:var(--spga-dock-width)!important;height:calc(100dvh - 24px)!important;max-height:calc(100dvh - 24px)!important;
      max-width:calc(100vw - 24px)!important;transform:none!important;margin:0!important;}`;
  document.head.append(style);
  let frame = 0, last = '';
  const nativeAvailable = () => {
    const nodes = document.querySelectorAll('#root .home-main-window');
    if (nodes.length !== 1) return false;
    const rect = nodes[0].getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(nodes[0]).display !== 'none';
  };
  function refresh() {
    const favorites = document.getElementById('st-favorites-curator'), avatar = document.getElementById('seatalk-personal-gif-avatar-panel');
    const kind = favorites?.dataset.open === 'true' ? 'favorites' : favorites?.dataset.managed !== 'true' && avatar?.classList.contains('spga-open') ? 'avatar' : null;
    const host = kind === 'favorites' ? favorites : avatar;
    const available = nativeAvailable();
    const preferred = host?.dataset.dockWidth ? Number(host.dataset.dockWidth) : undefined;
    const plan = planHelperSplit(innerWidth, kind, preferred, available);
    const docked = Boolean(plan && host?.dataset.layout !== 'floating');
    const stateKey = `${kind}|${innerWidth}|${innerHeight}|${plan?.width}|${docked}`;
    if (stateKey !== last) {
      last = stateKey;
      if (docked) { root.dataset.spgaDockKind = kind; root.style.setProperty('--spga-dock-width', plan.width + 'px'); }
      else { delete root.dataset.spgaDockKind; root.style.removeProperty('--spga-dock-width'); }
    }
    for (const node of [favorites, avatar].filter(Boolean)) {
      const next = String(docked && node === host);
      if (node.dataset.docked !== next) node.dataset.docked = next;
    }
    if (favorites) {
      const text = (zh, en) => favorites.dataset.locale === 'en' ? en : zh;
      const button = favorites.shadowRoot?.getElementById('dockToggle'), divider = favorites.shadowRoot?.getElementById('dockDivider');
      if (button) {
        button.disabled = !planHelperSplit(innerWidth, 'favorites', preferred, available);
        button.textContent = docked && kind === 'favorites' ? text('浮窗', 'Float') : text('分栏', 'Split view');
        button.title = button.disabled ? text('当前页面或窗口宽度不适合分栏，将使用浮窗', 'Split view is unavailable at this window size or on this page; using a floating window') : docked && kind === 'favorites' ? text('切换为可拖动浮窗', 'Switch to a draggable floating window') : text('在右侧分栏，SeaTalk 使用左侧空间', 'Open a sidebar on the right, with SeaTalk on the left');
      }
      if (divider) {
        divider.hidden = !(docked && kind === 'favorites');
        if (plan) { divider.setAttribute('aria-valuemin', String(plan.min)); divider.setAttribute('aria-valuemax', String(Math.floor(plan.max))); divider.setAttribute('aria-valuenow', String(plan.width)); }
      }
    }
    return { kind, docked, plan };
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-open', 'data-managed', 'data-layout', 'data-dock-width'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('spga:layout-change', refresh);
  const api = { refresh, dispose() {
    observer.disconnect(); if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule); window.removeEventListener('spga:layout-change', refresh);
    delete root.dataset.spgaDockKind; root.style.removeProperty('--spga-dock-width'); style.remove(); delete window.__spgaHelperLayout;
  } };
  window.__spgaHelperLayout = api; refresh(); return api;
}
