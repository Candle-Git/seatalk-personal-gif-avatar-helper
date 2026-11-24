  function showSelectionDetails(selected) {
    const details = $('#selectionDetails');
    details.hidden = selected.length !== 1;
    if (details.hidden) return;
    const item = selected[0];
    const form = ({animated:tr('动图'),static:tr('静态图'),unknown:tr('未知')})[effectiveAnimation(item)];
    const noteState = item.metadata?.needsReview ? tr('需复核') : item.metadata ? tr('已备注') : tr('未备注');
    details.textContent = ui('图片形式：'+form+' · 备注状态：'+noteState+' · 检测：'+detectionText(item),
      'Format: '+form+' · Notes: '+noteState+' · Inspection: '+detectionText(item));
  }
  function renderGroupTabs() {
    const active = activeItems(), names = personalGroupNames();
    if (activeGroup && !names.includes(activeGroup)) activeGroup = '';
    const search = $('#search');
    const groupLabel = activeGroup || tr('未分组');
    let scope = activeGroup === null ? ui('搜索全部收藏','Search all favorites')
      : ui('在「' + groupLabel + '」中搜索','Search in ' + groupLabel);
    if ($('#filter').value === 'selected') {
      scope = activeGroup === null ? ui('搜索已选表情','Search selected stickers')
        : ui('搜索「' + groupLabel + '」中的已选表情','Search selected stickers in ' + groupLabel);
    }
    search.placeholder = scope;
    search.setAttribute('aria-label', scope);
    fillGroupTabs($('#allGroups'), $('#groupStrip'), active, names, activeGroup, chooseGroup);
  }
  function fillGroupTabs(all, strip, rows, names, selectedGroup, onChoose) {
    const counts = new Map();
    for (const item of rows) {
      const group = personalGroupFor(item.gifId);
      counts.set(group, (counts.get(group) || 0) + 1);
    }
    all.querySelector('span').textContent = tr('全部') + ' (' + rows.length + ')';
    all.setAttribute('aria-pressed', String(selectedGroup === null));
    const focused = strip.contains(strip.getRootNode().activeElement) ? strip.getRootNode().activeElement.value : null;
    const scrollLeft = strip.scrollLeft;
    const fragment = document.createDocumentFragment();
    for (const group of ['', ...names]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.value = group;
      const label = group || tr('未分组'), total = counts.get(group) || 0;
      button.textContent = label + ' (' + total + ')';
      button.title = button.textContent;
      button.setAttribute('aria-pressed', String(group === selectedGroup));
      button.onclick = () => onChoose(group);
      fragment.append(button);
    }
    strip.replaceChildren(fragment);
    strip.scrollLeft = scrollLeft;
    if (focused !== null) [...strip.children].find(button=>button.value === focused)?.focus({preventScroll:true});
  }
  function chooseGroup(group) {
    if (busy()) return;
    activeGroup = group; selectionAnchor = null;
    if (selectedView) { selectedView = null; $('#filter').value = 'all'; }
    page = 0; render();
    $('#groupTabs [aria-pressed=true]')?.focus({preventScroll:true});
  }
  $('#allGroups').onclick = () => chooseGroup(null);
  function keepGroupFocusVisible(event) {
    const strip = event.currentTarget, button = event.target;
    if (!button.matches('button:focus-visible')) return;
    const bounds = strip.getBoundingClientRect(), tab = button.getBoundingClientRect();
    const inset = 4; // Keep the keyboard focus ring within the scrollable strip.
    if (tab.left < bounds.left + inset) strip.scrollLeft += tab.left - bounds.left - inset;
    else if (tab.right > bounds.right - inset) strip.scrollLeft += tab.right - bounds.right + inset;
  }
  $('#groupStrip').addEventListener('focusin', keepGroupFocusVisible);
  const activeFilters = $('#activeFilters');
  const filterIndicators = ['animation', 'metadataFilter', 'detectionFilter', 'filter'].map(id => {
    const control = $('#' + id), chip = document.createElement('button'), label = document.createElement('span');
    chip.type = 'button';
    chip.dataset.filterId = id;
    chip.innerHTML = stickerIcon('x');
    chip.prepend(label);
    chip.onclick = () => {
      if (busy()) return;
      if (id === 'filter' && selectedView) $('#viewSelected').click();
      else {
        control.value = 'all';
        control.dispatchEvent(new Event('change'));
      }
      (activeFilters.firstElementChild || $('#toolsToggle')).focus({preventScroll:true});
    };
    return {control, chip, label};
  });
  function renderActiveFilters() {
    for (const {control, chip, label} of filterIndicators) {
      if (control.value === 'all') { chip.remove(); continue; }
      const value = control.selectedOptions[0].label;
      label.textContent = value;
      const category = control.getAttribute('aria-label');
      const action = control.id === 'filter' && selectedView ? tr('返回筛选') :
        ui('移除' + category + '筛选「' + value + '」', 'Remove filter (' + category + ' · ' + value + ')');
      chip.title = action;
      chip.setAttribute('aria-label', action);
      if (!chip.isConnected) activeFilters.append(chip);
    }
    const total = activeFilters.childElementCount, badge = $('#toolsCount'), toggle = $('#toolsToggle');
    activeFilters.hidden = badge.hidden = total === 0;
    badge.textContent = total ? String(total) : '';
    const description = total ? ui('工具，' + total + ' 项筛选生效', 'Tools · ' + total + (total === 1 ? ' active filter' : ' active filters')) : tr('工具');
    toggle.title = description;
    toggle.setAttribute('aria-label', description);
  }
  function styleSelection(card, selected) {
    card.classList.toggle('chosen', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  function commitSelection(ids) {
    for (const item of items) item.selected = !item.deleted && ids.has(item.gifId);
    if ($('#filter').value === 'selected') {
      const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll;
    } else {
      for (const card of $('.grid').children) styleSelection(card, ids.has(card.dataset.id));
      count();
    }
  }
  function chooseCard(item, event) {
    if (busy()) return;
    const toggle = event.ctrlKey || event.metaKey;
    const ids = toggle ? new Set(selection().map(sticker => sticker.gifId)) : new Set();
    if (event.shiftKey && selectionAnchor) {
      const order = filtered().map(sticker => sticker.gifId);
      const start = order.indexOf(selectionAnchor), end = order.indexOf(item.gifId);
      if (start >= 0 && end >= 0) {
        for (const id of order.slice(Math.min(start,end), Math.max(start,end) + 1)) ids.add(id);
        commitSelection(ids); return;
      }
    }
    if (toggle && ids.has(item.gifId)) ids.delete(item.gifId);
    else ids.add(item.gifId);
    selectionAnchor = item.gifId;
    commitSelection(ids);
  }
  const scroller = $('main');
  function updateBand() {
    const band = rubberBand;
    if (!band) return;
    const rect = scroller.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, band.clientX - rect.left)) + scroller.scrollLeft;
    const y = Math.min(rect.height, Math.max(0, band.clientY - rect.top)) + scroller.scrollTop;
    if (!band.started && Math.hypot(x - band.x, y - band.y) < 4) return;
    band.started = true;
    const left = Math.min(x, band.x), right = Math.max(x, band.x);
    const top = Math.min(y, band.y), bottom = Math.max(y, band.y);
    const overlay = $('#rubberBand'); overlay.hidden = false;
    Object.assign(overlay.style, {left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    const ids = new Set(band.base);
    for (const row of band.cards) {
      if (row.right > left && row.left < right && row.bottom > top && row.top < bottom) ids.add(row.card.dataset.id);
      styleSelection(row.card, ids.has(row.card.dataset.id));
    }
    band.ids = ids;
  }
  function updateEdgeScroll() {
    const band = rubberBand;
    if (!band || band.frame || !band.started) return;
    const rect = scroller.getBoundingClientRect();
    const speed = band.clientY > rect.bottom - 20 ? 12 : band.clientY < rect.top + 20 ? -12 : 0;
    if (!speed || (speed > 0 ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight : scroller.scrollTop <= 0)) return;
    band.frame = requestAnimationFrame(() => {
      band.frame = 0; scroller.scrollTop += speed; updateBand(); updateEdgeScroll();
    });
  }
  scroller.addEventListener('pointerdown', event => {
    if (busy() || rubberBand || event.button !== 0 || event.pointerType === 'touch' ||
        (event.target !== scroller && event.target !== $('.grid'))) return;
    const rect = scroller.getBoundingClientRect();
    if (event.clientX >= rect.left + scroller.clientWidth || event.clientY >= rect.top + scroller.clientHeight) return;
    const offsetX = scroller.scrollLeft - rect.left, offsetY = scroller.scrollTop - rect.top;
    const base = event.shiftKey ? new Set(selection().map(item => item.gifId)) : new Set();
    const cards = Array.from($('.grid').children, card => {
      const bounds = card.getBoundingClientRect();
      return {card,left:bounds.left+offsetX,right:bounds.right+offsetX,top:bounds.top+offsetY,bottom:bounds.bottom+offsetY};
    });
    rubberBand = {pointerId:event.pointerId,x:event.clientX+offsetX,y:event.clientY+offsetY,
      clientX:event.clientX,clientY:event.clientY,cards,base,ids:base,frame:0,started:false};
    scroller.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  scroller.addEventListener('pointermove', event => {
    if (!rubberBand || rubberBand.pointerId !== event.pointerId) return;
    rubberBand.clientX = event.clientX; rubberBand.clientY = event.clientY;
    updateBand(); updateEdgeScroll();
  });
  scroller.addEventListener('scroll', updateBand, {passive:true});
  function finishBand(commit) {
    const band = rubberBand;
    if (!band) return;
    rubberBand = null;
    cancelAnimationFrame(band.frame); $('#rubberBand').hidden = true;
    if (scroller.hasPointerCapture(band.pointerId)) scroller.releasePointerCapture(band.pointerId);
    if (commit && !busy()) {
      selectionAnchor = null; commitSelection(band.ids);
    } else {
      const ids = new Set(selection().map(item => item.gifId));
      for (const card of $('.grid').children) styleSelection(card, ids.has(card.dataset.id));
    }
  }
  scroller.addEventListener('pointerup', event => {
    if (!rubberBand || rubberBand.pointerId !== event.pointerId) return;
    rubberBand.clientX = event.clientX; rubberBand.clientY = event.clientY;
    updateBand(); finishBand(true);
  });
  for (const type of ['pointercancel','lostpointercapture']) scroller.addEventListener(type, event => {
    if (rubberBand?.pointerId === event.pointerId) finishBand(false);
  });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape' && rubberBand) { event.stopImmediatePropagation(); finishBand(false); }
  }, {capture:true});

  $('#toolsToggle').onclick = () => {
    const panel = $('#toolsPanel'); panel.hidden = !panel.hidden;
    $('#toolsToggle').setAttribute('aria-expanded', String(!panel.hidden));
  };
  $('#previewSelected').onclick = () => {
    const selected = selection();
    if (busy() || selected.length !== 1) return;
    zoomItem = selected[0]; $('#zoom img').src = zoomItem.url; $('#zoom p').textContent = zoomItem.label;
    count(); openDialog($('#zoom'));
  };
  $('#editSelected').onclick = () => {
    const selected = selection();
    if (selected.length === 1) openPersonalEditor(selected[0]);
  };
  function populateOrganizationGroups(select, groupNames, selectedValue = '', {includeKeep = true} = {}) {
    select.replaceChildren(new Option(tr('未分组'), 'ungrouped'));
    if (includeKeep) select.prepend(new Option(ui('保持当前分组','Keep current group'), ''));
    if (groupNames.length) {
      const existing = document.createElement('optgroup');
      existing.label = ui('已有分组','Existing groups');
      for (const name of groupNames) existing.append(new Option(name, 'saved:' + name));
      select.append(existing);
    }
    select.append(new Option(ui('新建分组…','Create group…'), 'new'));
    select.value = selectedValue;
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }
  function readOrganizationGroup(select, newNameInput) {
    if (select.value === 'new') return newNameInput.value.trim();
    if (select.value === 'ungrouped') return '';
    if (select.value.startsWith('saved:')) return select.value.slice(6);
    return undefined;
  }
  function populateGroupChoices(keep = false) {
    const select = $('#organizeGroup');
    populateOrganizationGroups(select, personalGroupNames(), keep ? select.value : '');
    $('#newGroupLabel').hidden = select.value !== 'new';
  }
  function organizationChanges() {
    const changes = {name:$('#batchName').value.trim(), keywords:splitPersonalKeywords($('#batchKeywords').value)};
    const group = readOrganizationGroup($('#organizeGroup'), $('#newGroupName'));
    if (group !== undefined) changes.group = group;
    return changes;
  }
  function organizationImpactMetric(label, value, total) {
    const metric = document.createElement('span'), number = document.createElement('strong');
    metric.className = 'impact-metric';
    number.textContent = String(value);
    metric.append(label + ' ', number);
    if (total) {
      const track = document.createElement('span'), fill = document.createElement('span');
      track.className = 'impact-track';
      track.setAttribute('aria-hidden', 'true');
      fill.style.width = (100 * value / total) + '%';
      track.append(fill);
      metric.append(track);
    }
    return metric;
  }
  function refreshOrganizationImpact() {
    const apply = $('#organizeApply'); apply.disabled = true;
    const impact = $('#organizeImpact');
    impact.dataset.overwrite = 'false';
    apply.textContent = tr('保存整理');
    if (!organizationDraft) return;
    $('#newGroupLabel').hidden = $('#organizeGroup').value !== 'new';
    $('#organizeError').textContent = '';
    try {
      const changes = organizationChanges();
      if ($('#organizeGroup').value === 'new' && !changes.group) {
        impact.textContent = ui('输入新分组名称。','Enter a name for the new group.');
        return;
      }
      const preview = previewPersonalOrganization(organizationDraft.ids, changes);
      if (preview.revision !== organizationDraft.revision) throw Error('METADATA_CHANGED');
      const {selectedCount,movedCount,nameChangedCount,nameOverwriteCount,keywordChangedCount} = preview;
      impact.dataset.overwrite = String(nameOverwriteCount > 0);
      const metrics = [organizationImpactMetric(ui('已选','Selected'), selectedCount)];
      if (changes.name) metrics.push(organizationImpactMetric(ui('改名','Rename'), nameChangedCount, selectedCount));
      if ('group' in changes) metrics.push(organizationImpactMetric(ui('移组','Move'), movedCount, selectedCount));
      if (changes.keywords.length) metrics.push(organizationImpactMetric(ui('加关键字','Add keywords'), keywordChangedCount, selectedCount));
      if (nameOverwriteCount) {
        const warning = document.createElement('span');
        warning.className = 'impact-warning';
        warning.textContent = ui('将覆盖 ' + nameOverwriteCount + ' 个自定义名称',
          'Will replace ' + nameOverwriteCount + (nameOverwriteCount === 1 ? ' custom name' : ' custom names'));
        metrics.push(warning);
        apply.textContent = ui('确认覆盖并保存','Confirm replacement and save');
      } else if (!(nameChangedCount || movedCount || keywordChangedCount)) {
        apply.textContent = ui('完成','Done');
      }
      impact.replaceChildren(...metrics);
      apply.disabled = busy() || !selectedCount;
    } catch (error) {
      impact.replaceChildren();
      $('#organizeError').textContent = metadataMessage(error.message);
    }
  }
  $('#organizeSelected').onclick = () => {
    if (busy() || !personalReady || !selection().length || root.querySelector('dialog[open]')) return;
    try { assertWorkspaceAccount(); } catch (error) { notifyAction(metadataMessage(error.message),'error'); return; }
    const ids = selection().map(item => item.gifId);
    organizationDraft = {ids, revision:personalSnapshot.revision};
    $('#batchName').value = $('#batchKeywords').value = $('#newGroupName').value = '';
    populateGroupChoices(); refreshOrganizationImpact();
    if (openDialog($('#organizeDialog'))) $('#batchName').focus();
  };
  $('#organizeGroup').onchange = () => {
    refreshOrganizationImpact();
    if ($('#organizeGroup').value === 'new') $('#newGroupName').focus();
  };
  $('#newGroupName').oninput = $('#batchName').oninput = $('#batchKeywords').oninput = refreshOrganizationImpact;
  $('#organizeDialog').addEventListener('cancel', event => { if (metadataSaving) event.preventDefault(); });
  $('#organizeDialog').addEventListener('close', () => { if (!$('#organizeDialog').open) organizationDraft = null; });
  $('#organizeApply').onclick = async () => {
    if (busy() || !organizationDraft || !$('#organizeDialog').open || $('#organizeApply').disabled) return;
    refreshOrganizationImpact();
    if ($('#organizeApply').disabled) return;
    $('#organizeApply').disabled = true;
    try {
      const result = await savePersonalOrganization(organizationDraft.ids,organizationChanges(),organizationDraft.revision);
      closeDialog($('#organizeDialog'));
      const summary = [];
      if (result.nameChangedCount) summary.push(ui(result.nameChangedCount + ' 张已改名', result.nameChangedCount + ' renamed'));
      if (result.movedCount) summary.push(ui(result.movedCount + ' 张已移动', result.movedCount + ' moved'));
      if (result.keywordChangedCount) summary.push(ui(result.keywordChangedCount + ' 张已添加关键字', 'Keywords added to ' + result.keywordChangedCount));
      if (summary.length) notifyAction(summary.join(ui('，', ', ')) + ui('。', '.'));
      else notifyAction(ui('已保留所选表情的原设置。','Kept settings for the selected stickers.'));
    } catch (error) {
      $('#organizeError').textContent = metadataMessage(error.message);
      $('#organizeApply').disabled = error.message === 'METADATA_CHANGED';
    }
  };
