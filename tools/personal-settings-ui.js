
  let personalSnapshot = {schema:2,revision:0,items:[],groups:[]}, personalReady = false, personalAccount = null;
  let editorItem = null, editorRevision = 0, personalDraft = null, personalImportGeneration = 0;
  const metadataMessage = code => ({
    METADATA_ACCOUNT_CHANGED: ui('登录账号已变化，未读取或写入其他账号的备注。','The account changed. Notes for other accounts were not accessed.'),
    METADATA_FAVORITE_UNAVAILABLE: ui('请返回收藏列表，核对这张表情是否仍在收藏中。','Return to favorites and check that this sticker is still saved.'),
    METADATA_INVALID: ui('备注文件或字段无效，请检查格式与长度。','The metadata file or fields are invalid. Check the format and length.'),
    METADATA_DUPLICATE: ui('文件包含重复的表情标识，未导入。','The file contains duplicate sticker IDs. Nothing was imported.'),
    METADATA_KEYWORDS_LIMIT: ui('合并后关键词超过 30 个，请取消合并或调整关键词。','Merged keywords exceed 30. Disable merging or edit the keywords.'),
    METADATA_CHANGED: ui('另一窗口已修改备注，请重新打开页面后再操作。','Another window changed the notes. Reload this page before continuing.'),
    METADATA_STORAGE_INVALID: ui('本地备注数据无法读取，已停止写入以保留原数据。','Local notes could not be read. Writes stopped to preserve the existing data.'),
    METADATA_SAVE_FAILED: ui('备注未能保存，请检查油猴状态后重试。','Notes could not be saved. Check Tampermonkey before trying again.'),
  })[code] || ui('备注操作未完成，请刷新后核对。','The notes operation did not complete. Reload and check the result.');
  function personalRecords() { return new Map(personalSnapshot.items.map(row=>[row.gifId,row])); }
  let personalMemberships = new Map();
  function personalGroupNames() { return personalSnapshot.groups.map(group=>group.name); }
  function personalGroupFor(id) { return personalMemberships.get(id) || ''; }
  function previewPersonalOrganization(ids, changes) {
    assertWorkspaceAccount();
    if (!personalReady) throw Error('METADATA_SAVE_FAILED');
    return planPersonalOrganization(personalSnapshot,ids,changes);
  }
  async function savePersonalOrganization(ids,changes,expectedRevision) {
    const plan = previewPersonalOrganization(ids,changes);
    if (plan.revision !== expectedRevision) throw Error('METADATA_CHANGED');
    if (plan.movedCount || plan.nameChangedCount || plan.keywordChangedCount) await savePersonalRows(plan.items,plan.groups);
    return plan;
  }
  function adoptPersonalSnapshot(snapshot) {
    if (snapshot.revision < personalSnapshot.revision) return;
    personalSnapshot = snapshot;
    personalMemberships = groupMemberships(snapshot.groups);
    refreshPersonalLabels();
    quickView?.refreshSettings?.();
  }
  function settingsRequest(kind,rows,groups) {
    assertWorkspaceAccount();
    return requestPersonalSettingsBridge(personalAccount,{kind,revision:personalSnapshot.revision,items:rows,groups});
  }
  function refreshPersonalLabels() {
    const rows = personalRecords();
    for (const item of items) {
      const record = rows.get(item.gifId); item.metadata = record || null;
      item.label = record?.name || item.originalLabel;
      if (record?.name) item.generatedName = null;
    }
    const scroll=$('main').scrollTop; render(); $('main').scrollTop=scroll;
  }
  async function loadPersonalSettings(services) {
    personalAccount=nativeWorkspaceAccountId(services);
    try {
      const snapshot=await settingsRequest('load'); assertWorkspaceAccount();
      personalReady=true;adoptPersonalSnapshot(snapshot);
    } catch(error) {personalReady=false;$('#scanStatus').textContent=metadataMessage(error.message);count();}
  }
  function onPersonalSettingsChanged(event) {
    if (!host.isConnected) {
      window.removeEventListener('spga:personal-settings-changed',onPersonalSettingsChanged);
      return;
    }
    let change;
    try { change=JSON.parse(event.detail); } catch (_) { return; }
    if (!change || change.account !== personalAccount || !Number.isSafeInteger(change.revision)) return;
    const revision = change.revision;
    setTimeout(async()=>{
      if (!host.isConnected || !personalReady || revision <= personalSnapshot.revision) return;
      try {
        const fresh=await settingsRequest('load'); assertWorkspaceAccount();
        if (fresh.revision > personalSnapshot.revision) adoptPersonalSnapshot(fresh);
      } catch (_) { /* Account and revision are checked again on every action. */ }
    },0);
  }
  window.addEventListener('spga:personal-settings-changed',onPersonalSettingsChanged);
  async function savePersonalRows(rows,groups = personalSnapshot.groups) {
    if (!personalReady || metadataSaving) throw Error('METADATA_SAVE_FAILED');
    assertWorkspaceAccount(); const normalized=normalizePersonalRows(rows);
    metadataSaving=true;count();
    try {
      const snapshot=await settingsRequest('save',normalized,groups);assertWorkspaceAccount();
      adoptPersonalSnapshot(snapshot);return snapshot;
    } finally {metadataSaving=false;count();}
  }
  function refreshPersonalGroupChoices(selectedValue = $('#personalGroup').value) {
    populateOrganizationGroups($('#personalGroup'), personalGroupNames(), selectedValue, {includeKeep:false});
  }
  function updatePersonalGroupField() {
    const creating = $('#personalGroup').value === 'new';
    const name = $('#personalNewGroupName');
    $('#personalNewGroupField').hidden = !creating;
    name.required = creating;
    const missing = creating && !name.value.trim();
    $('#personalEditorStatus').textContent = missing ? ui('输入新分组名称。','Enter a name for the new group.') : '';
    $('#personalSave').disabled = metadataSaving || missing;
  }
  $('#personalGroup').onchange = () => {
    updatePersonalGroupField();
    if ($('#personalGroup').value === 'new') $('#personalNewGroupName').focus();
  };
  $('#personalNewGroupName').oninput = updatePersonalGroupField;
  function openPersonalEditor(item) {
    if (busy() || !personalReady || root.querySelector('dialog[open]')) return;
    try { assertWorkspaceAccount(); } catch (_) { $('#scanStatus').textContent = metadataMessage('METADATA_ACCOUNT_CHANGED'); return; }
    editorItem = item;
    editorRevision = personalSnapshot.revision;
    const record = personalRecords().get(item.gifId), group = personalGroupFor(item.gifId);
    const name = $('#personalName'), keywords = $('#personalKeywords');
    name.value = record?.name || '';
    name.placeholder = item.originalLabel || item.label || '';
    keywords.value = keywords.defaultValue = (record?.keywords || []).join(', ');
    $('#personalNewGroupName').value = '';
    refreshPersonalGroupChoices(group ? 'saved:' + group : 'ungrouped');
    updatePersonalGroupField();
    $('#personalFormatOptions').open = false;
    $('#personalAnimation').value = record?.animationOverride || 'auto';
    $('#personalDetectionStatus').textContent = ui('自动检测：','Automatic detection: ') + detectionText(item);
    $('#personalReviewField').hidden = !record?.needsReview;
    $('#personalReviewAccept').checked = false;
    if (openDialog($('#personalEditor'))) name.focus();
  }
  $('#personalEditor').addEventListener('cancel', event => { if (metadataSaving) event.preventDefault(); });
  $('#personalEditor').addEventListener('close', () => { if (!$('#personalEditor').open) editorItem = null; });
  $('#personalSave').onclick = async () => {
    if (!editorItem || !$('#personalEditor').open || $('#personalSave').disabled || metadataSaving) return;
    try {
      assertWorkspaceAccount();
      if (editorRevision !== personalSnapshot.revision) throw Error('METADATA_CHANGED');
      const id = editorItem.gifId;
      const stored = favoritesSyncServices?.store?.getState?.()?.messages?.customStickers;
      const favorites = Array.isArray(stored) ? stored : liveSource(false).list;
      if (editorItem.deleted || !favorites.some(entry => entry?.id === id || entry?.url === id)) throw Error('METADATA_FAVORITE_UNAVAILABLE');
      const select = $('#personalGroup'), group = readOrganizationGroup(select, $('#personalNewGroupName'));
      if (select.value === 'new' && !group) { updatePersonalGroupField(); return; }
      const plan = previewPersonalOrganization([id], {group});
      const records = personalRecords(), field = $('#personalKeywords');
      const keywords = field.value === field.defaultValue ? (records.get(id)?.keywords || []) : splitPersonalKeywords(field.value);
      const edited = applyPersonalRecordEdit(records,id,{
        name:$('#personalName').value, keywords, animationOverride:$('#personalAnimation').value, acceptReview:$('#personalReviewAccept').checked
      });
      if (edited || plan.movedCount) await savePersonalRows([...records.values()], plan.groups);
      closeDialog($('#personalEditor'));
      if (edited || plan.movedCount) notifyAction(ui('表情设置已保存。','Sticker settings saved.'));
    } catch (error) {
      $('#personalEditorStatus').textContent = metadataMessage(error.message);
    }
  };
  function downloadMetadata(text,filename) {
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;try { document.body.append(link); link.click(); } finally { link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  }
  $('#settingsOpen').onclick=()=>{
    if(busy())return;
    $('#personalSettingsStatus').textContent=personalReady && workspaceAccountState === 'ready' ? ui(`已为 ${personalSnapshot.items.length} 张表情保存设置，共有 ${personalSnapshot.groups.length} 个分组。`,`Settings saved for ${personalSnapshot.items.length} stickers. Groups: ${personalSnapshot.groups.length}.`) : ui('个人数据暂不可用。你仍可调整语言和窗口布局。','Personal data is unavailable. You can still adjust the language and window layout.');
    openDialog($('#personalSettings'));
  };
  $('#personalExport').onclick=()=>{
    try{assertWorkspaceAccount();
      const filename='seatalk-personal-settings-'+new Date().toISOString().slice(0,10)+'.json';
      downloadMetadata(exportPersonalSettings(personalSnapshot.items,new Date().toISOString(),personalSnapshot.groups),filename);
      $('#personalSettingsStatus').textContent=ui(`已请求下载备份。请在浏览器下载记录中查看 ${filename}。`,`Backup download requested. Look for ${filename} in your browser downloads.`);
      notifyAction($('#personalSettingsStatus').textContent);
    }
    catch(error){$('#personalSettingsStatus').textContent=metadataMessage(error.message);notifyAction($('#personalSettingsStatus').textContent,'error');}
  };
  const importedFormatText = value => ({animated:ui('动图（手动）','Animated (manual)'),static:ui('静态图（手动）','Still image (manual)'),unknown:ui('未知（手动）','Unknown (manual)')})[value];
  function updatePersonalImportCount() {
    const count=personalDraft?.rows.filter(row=>row.check.checked).length || 0;
    $('#personalImportConfirm').disabled=!count || metadataSaving;
    if(personalDraft)$('#personalSettingsStatus').textContent=ui(`文件共 ${personalDraft.rows.length} 项，已选 ${count} 项；${personalDraft.reviewCount} 项需复核。`,`File: ${personalDraft.rows.length} entries; ${count} selected; ${personalDraft.reviewCount} need review.`);
  }
  $('#personalImportFile').onchange=async()=>{
    if(metadataSaving)return;const generation=++personalImportGeneration;
    const file=$('#personalImportFile').files?.[0];personalDraft=null;$('#personalImportRows').replaceChildren();$('#personalImportPanel').hidden=true;$('#personalImportConfirm').disabled=true;
    if(!file)return;
    try{
      assertWorkspaceAccount();
      const parsed=await readPersonalImportFile(file);assertWorkspaceAccount();if(generation!==personalImportGeneration)return;
      const rows = [], localLabels = new Map(items.map(item=>[item.gifId,item.label]));
      let reviewCount = 0;
      const fragment = document.createDocumentFragment();
      for (const entry of personalBackupEntries(parsed,personalSnapshot)) {
        const {record,group,localRecord,localGroup,gifId} = entry;
        const line=document.createElement('div');line.className='metadata-import-row';
        const check=document.createElement('input');check.type='checkbox';check.checked=!entry.needsReview;
        const label=document.createElement('label'),name=document.createElement('span');label.append(check,name);
        const detail=document.createElement('p'),mode=document.createElement('select');
        const keep=document.createElement('option'),replace=document.createElement('option');
        keep.value='keep';replace.value='replace';mode.append(keep,replace);
        mode.disabled=!entry.hasConflict;mode.value=entry.hasConflict?'keep':'replace';check.onchange=updatePersonalImportCount;
        const refreshCopy=()=>{
          const title=record?.name || localLabels.get(gifId) || localRecord?.name || (gifId ? ui('表情 ','Sticker ')+gifId.slice(-8) : group);
          name.textContent=title;
          check.setAttribute('aria-label',ui('导入 ','Import ')+title);mode.setAttribute('aria-label',ui('冲突处理 ','Conflict policy for ')+title);
          keep.textContent=ui('保留本机设置','Keep local settings');replace.textContent=ui('使用导入设置','Use imported settings');
          const fields=[];
          if(record) {
            if(record.name) fields.push(ui('本机：','Local: ')+(localRecord?.name || ui('无名称','No name'))+' → '+record.name);
            if(record.keywords.length) fields.push(record.keywords.join(', '));
            if(record.animationOverride) fields.push(ui('图片形式：','Image format: ')+importedFormatText(record.animationOverride));
            if(record.needsReview) fields.push(tr('需复核'));
          }
          if(group) fields.push(gifId ? ui('分组：','Group: ')+(localGroup || ui('未分组','Ungrouped'))+' → '+group : ui('空分组','Empty group'));
          detail.textContent=fields.join(' · ');
        };
        refreshCopy();line.append(label,detail,mode);fragment.append(line);
        rows.push({...entry,row:{gifId,needsReview:entry.needsReview},check,mode,refreshCopy});
        if(entry.needsReview)reviewCount++;
      }
      $('#personalImportRows').append(fragment);
      personalDraft={rows,reviewCount,revision:personalSnapshot.revision};$('#personalImportPanel').hidden=false;updatePersonalImportCount();
    }catch(error){if(generation===personalImportGeneration)$('#personalSettingsStatus').textContent=metadataMessage(error.message);}
  };
  $('#personalSelectAll').onclick=()=>{if(metadataSaving)return;personalDraft?.rows.forEach(row=>row.check.checked=true);updatePersonalImportCount();};
  $('#personalSelectSafe').onclick=()=>{personalDraft?.rows.forEach(row=>row.check.checked=!row.row.needsReview);updatePersonalImportCount();};
  $('#personalClearImport').onclick=()=>{personalDraft?.rows.forEach(row=>row.check.checked=false);updatePersonalImportCount();};
  $('#personalImportConfirm').onclick=async()=>{
    if(!personalDraft || metadataSaving)return;
    try{
      assertWorkspaceAccount();if(personalDraft.revision!==personalSnapshot.revision)throw Error('METADATA_CHANGED');
      const selected=personalDraft.rows.filter(entry=>entry.check.checked).map(entry=>({...entry,replace:entry.mode.value==='replace'}));
      if(!selected.length)return;
      const merged=mergePersonalBackup(personalSnapshot,selected,$('#personalMergeKeywords').checked);
      const count=selected.length;
      $('#personalImportConfirm').disabled=true;await savePersonalRows(merged.items,merged.groups);personalDraft=null;$('#personalImportPanel').hidden=true;$('#personalImportRows').replaceChildren();
      $('#personalSettingsStatus').textContent=ui(`已恢复 ${count} 项个人设置。`,`Restored ${count} personal settings entries.`);notifyAction($('#personalSettingsStatus').textContent);
    }catch(error){$('#personalSettingsStatus').textContent=metadataMessage(error.message);notifyAction($('#personalSettingsStatus').textContent,'error');}
    finally{updatePersonalImportCount();}
  };
