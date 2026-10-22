  let dragging = null, resizing = null;
  const dragHandle = $('#dragHandle'), resizeHandle = $('#resizeHandle');
  function clampWindow(left, top) {
    const rect = host.getBoundingClientRect(), margin = 12;
    host.style.transform = 'none'; host.style.right = 'auto';
    host.style.left = Math.max(margin, Math.min(left, innerWidth - rect.width - margin)) + 'px';
    host.style.top = Math.max(margin, Math.min(top, innerHeight - rect.height - margin)) + 'px';
  }
  function resizeWindow(left, top, width, height) {
    const availableWidth = Math.max(1, innerWidth - left - 12), availableHeight = Math.max(1, innerHeight - top - 12);
    host.style.width = Math.min(availableWidth, Math.max(Math.min(360, availableWidth), width)) + 'px';
    host.style.height = Math.min(availableHeight, Math.max(Math.min(400, availableHeight), height)) + 'px';
    geometryCustom = true; clampWindow(left, top);
  }
  dragHandle.addEventListener('pointerdown', event => {
    if (host.dataset.docked === 'true' || event.button !== 0 || event.target.closest('button,input,select,a')) return;
    const rect = host.getBoundingClientRect();
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    dragHandle.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  dragHandle.addEventListener('pointermove', event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    geometryCustom = true; clampWindow(dragging.left + event.clientX - dragging.x, dragging.top + event.clientY - dragging.y);
  });
  const finishDrag = event => {
    if (!dragging || dragging.id !== event.pointerId) return;
    dragging = null;
    if (dragHandle.hasPointerCapture?.(event.pointerId)) dragHandle.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) dragHandle.addEventListener(type, finishDrag);
  resizeHandle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const rect = host.getBoundingClientRect();
    resizing = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
    resizeHandle.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  resizeHandle.addEventListener('pointermove', event => {
    if (!resizing || resizing.id !== event.pointerId) return;
    resizeWindow(resizing.left, resizing.top, resizing.width + event.clientX - resizing.x, resizing.height + event.clientY - resizing.y);
  });
  const finishResize = event => {
    if (!resizing || resizing.id !== event.pointerId) return;
    resizing = null;
    if (resizeHandle.hasPointerCapture?.(event.pointerId)) resizeHandle.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) resizeHandle.addEventListener(type, finishResize);
  resizeHandle.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    resizeWindow(rect.left, rect.top, rect.width + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0), rect.height + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0));
  };
  $('#resetPosition').onclick = () => {
    for (const property of ['left', 'right', 'top', 'width', 'height', 'transform']) host.style.removeProperty(property);
    geometryCustom = false; delete host.dataset.dockWidth; host.dataset.layout = 'auto';
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
  };
  window.addEventListener('resize', () => {
    if (!host.isConnected || host.dataset.open !== 'true' || !geometryCustom) return;
    const rect = host.getBoundingClientRect(); clampWindow(rect.left, rect.top);
  });
  host.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || root.querySelector('dialog[open]')) return;
    hideWorkspace();
  });

  const divider = $('#dockDivider'); let dockDrag = null;
  $('#dockToggle').onclick = () => {
    if ($('#dockToggle').disabled) return;
    host.dataset.layout = host.dataset.docked === 'true' ? 'floating' : 'auto';
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    if (host.dataset.docked !== 'true' && geometryCustom) { const rect = host.getBoundingClientRect(); clampWindow(rect.left, rect.top); }
  };
  divider.addEventListener('pointerdown', event => {
    if (event.button !== 0 || host.dataset.docked !== 'true') return;
    dockDrag = { id: event.pointerId, x: event.clientX, width: host.getBoundingClientRect().width };
    divider.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  divider.addEventListener('pointermove', event => {
    if (!dockDrag || dockDrag.id !== event.pointerId) return;
    host.dataset.dockWidth = String(dockDrag.width + dockDrag.x - event.clientX);
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
  });
  const endDockDrag = event => {
    if (!dockDrag || dockDrag.id !== event.pointerId) return;
    dockDrag = null;
    if (divider.hasPointerCapture?.(event.pointerId)) divider.releasePointerCapture(event.pointerId);
  };
  for (const type of ['pointerup','pointercancel','lostpointercapture']) divider.addEventListener(type, endDockDrag);
  divider.onkeydown = event => {
    if (!['ArrowLeft','ArrowRight'].includes(event.key) || host.dataset.docked !== 'true') return;
    event.preventDefault(); host.dataset.dockWidth = String(host.getBoundingClientRect().width + (event.key === 'ArrowLeft' ? 20 : -20));
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
  };
