
  let personalSnapshot = {schema:1,revision:0,items:[]}, personalReady = false, personalAccount = null;
  let editorItem = null, personalDraft = null, personalImportGeneration = 0;
  const metadataMessage = code => ({
    METADATA_ACCOUNT_CHANGED: ui('登录账号已变化，未读取或写入其他账号的备注。','The account changed. Notes for other accounts were not accessed.'),
    METADATA_INVALID: ui('备注文件或字段无效，请检查格式与长度。','The metadata file or fields are invalid. Check the format and length.'),
    METADATA_DUPLICATE: ui('文件包含重复的表情标识，未导入。','The file contains duplicate sticker IDs. Nothing was imported.'),
    METADATA_KEYWORDS_LIMIT: ui('合并后关键词超过 30 个，请取消合并或调整关键词。','Merged keywords exceed 30. Disable merging or edit the keywords.'),
    METADATA_CHANGED: ui('另一窗口已修改备注，请重新打开页面后再操作。','Another window changed the notes. Reload this page before continuing.'),
    METADATA_STORAGE_INVALID: ui('本地备注数据无法读取，已停止写入以保留原数据。','Local notes could not be read. Writes stopped to preserve the existing data.'),
    METADATA_SAVE_FAILED: ui('备注未能保存，请检查油猴状态后重试。','Notes could not be saved. Check Tampermonkey before trying again.'),
  })[code] || ui('备注操作未完成，请刷新后核对。','The notes operation did not complete. Reload and check the result.');
  function personalRecords() { return new Map(personalSnapshot.items.map(row=>[row.gifId,row])); }
  function settingsRequest(kind, rows) {
    assertWorkspaceAccount();
    const account = personalAccount;
    if (!account) return Promise.reject(Error('METADATA_SAVE_FAILED'));
    if (globalThis.__SPGA_TEST_MODE__ === true && globalThis.__SPGA_PERSONAL_SETTINGS_FIXTURE__) return Promise.resolve(globalThis.__SPGA_PERSONAL_SETTINGS_FIXTURE__.request({kind,account,revision:personalSnapshot.revision,items:rows})).then(validateSettingsSnapshot);
    return new Promise((resolve,reject)=>{
      const id = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
      const finish = (error,value) => { clearTimeout(timer); window.removeEventListener('spga:settings-response',receive); error?reject(error):resolve(value); };
      const receive = event => {
        if (typeof event.detail !== 'string') return;
        let result; try { result=JSON.parse(event.detail); } catch (_) { return; }
        if (result.id !== id) return;
        if (!result.ok) { finish(Error(result.error)); return; }
        try { finish(null,validateSettingsSnapshot(result.value)); } catch (error) { finish(error); }
      };
      const timer = setTimeout(()=>finish(Error('METADATA_SAVE_FAILED')),6000);
      window.addEventListener('spga:settings-response',receive);
      window.dispatchEvent(new CustomEvent('spga:settings-request',{detail:JSON.stringify({id,kind,account,revision:personalSnapshot.revision,items:rows})}));
    });
  }
  function refreshPersonalLabels() {
    const rows = personalRecords();
    for (const item of items) {
      const record = rows.get(item.gifId); item.metadata = record || null;
      item.label = record?.name || item.originalLabel;
      if (record) item.generatedName = null;
    }
    const scroll=$('main').scrollTop; render(); $('main').scrollTop=scroll;
  }
  async function loadPersonalSettings(services) {
    personalAccount=nativeWorkspaceAccountId(services);
    try {
      const snapshot=await settingsRequest('load'); assertWorkspaceAccount();
      personalSnapshot=snapshot;personalReady=true;refreshPersonalLabels();
    } catch(error) {personalReady=false;$('#scanStatus').textContent=metadataMessage(error.message);count();}
  }
  async function savePersonalRows(rows) {
    if (!personalReady || metadataSaving) throw Error('METADATA_SAVE_FAILED');
    assertWorkspaceAccount(); const normalized=normalizePersonalRows(rows);
    metadataSaving=true;count();
    try {
      const snapshot=await settingsRequest('save',normalized);assertWorkspaceAccount();
      personalSnapshot=snapshot;refreshPersonalLabels();return snapshot;
    } finally {metadataSaving=false;count();}
  }
  function openPersonalEditor(item) {
    if (busy() || !personalReady) return;
    try {assertWorkspaceAccount();}catch(_){$('#scanStatus').textContent=metadataMessage('METADATA_SAVE_FAILED');return;}
    editorItem=item;const record=personalRecords().get(item.gifId);
    $('#personalName').value=record?.name || item.label;
    $('#personalKeywords').value=(record?.keywords || []).join(', ');
    $('#personalVisibleText').value=record?.visibleText || '';
    $('#personalAnimation').value=record?.animationOverride || 'auto';
    $('#personalDetectionStatus').textContent=ui('自动检测：','Automatic detection: ')+detectionText(item);
    $('#personalNote').value=record?.note || '';$('#personalEditorStatus').textContent='';
    if(openDialog($('#personalEditor')))$('#personalName').focus();
  }
  $('#personalSave').onclick=async()=>{
    if(!editorItem || metadataSaving)return;
    try{
      const row=normalizePersonalRecord({gifId:editorItem.gifId,name:$('#personalName').value,keywords:$('#personalKeywords').value.split(/[,，\n]/).map(v=>v.trim()).filter(Boolean),visibleText:$('#personalVisibleText').value,note:$('#personalNote').value,animationOverride:$('#personalAnimation').value,source:'manual',updatedAt:new Date().toISOString(),needsReview:false,confidence:'high',reviewReason:''});
      const records=personalRecords();records.set(row.gifId,row);$('#personalSave').disabled=true;
      await savePersonalRows([...records.values()]);closeDialog($('#personalEditor'));
      $('#scanStatus').textContent=ui('备注已保存，可用名称、关键词或表情文字搜索。','Notes saved. Search by name, keywords or sticker text.');
    }catch(error){$('#personalEditorStatus').textContent=metadataMessage(error.message);}
    finally{$('#personalSave').disabled=false;}
  };
  function downloadMetadata(text,filename) {
    const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=filename;try { document.body.append(link); link.click(); } finally { link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
  }
  $('#settingsOpen').onclick=()=>{
    if(busy())return;
    $('#personalSettingsStatus').textContent=personalReady && workspaceAccountState === 'ready' ? ui(`当前账号已保存 ${personalSnapshot.items.length} 条个人备注。`,`This account has ${personalSnapshot.items.length} saved notes.`) : ui('个人数据暂不可用；语言与窗口布局仍可调整。','Personal data is unavailable. Language and window layout settings remain available.');
    openDialog($('#personalSettings'));
  };
  $('#personalExport').onclick=()=>{
    try{assertWorkspaceAccount();
      const filename='seatalk-personal-settings-'+new Date().toISOString().slice(0,10)+'.json';
      downloadMetadata(exportPersonalSettings(personalSnapshot.items),filename);
      $('#personalSettingsStatus').textContent=ui(`已发起导出 ${personalSnapshot.items.length} 条备注及图片形式设置：${filename}。请查看浏览器下载。`,`Download requested for ${personalSnapshot.items.length} notes and image-format settings: ${filename}. Check browser downloads.`);
      notifyAction($('#personalSettingsStatus').textContent);
    }
    catch(error){$('#personalSettingsStatus').textContent=metadataMessage(error.message);notifyAction($('#personalSettingsStatus').textContent,'error');}
  };
  const importedFormatText = value => ({animated:ui('动图（手动）','Animated (manual)'),static:ui('静态图（手动）','Still image (manual)'),unknown:ui('未知（手动）','Unknown (manual)')})[value];
  function updatePersonalImportCount() {
    const count=personalDraft?.rows.filter(row=>row.check.checked).length || 0;
    $('#personalImportConfirm').disabled=!count || metadataSaving;
    if(personalDraft)$('#personalSettingsStatus').textContent=ui(`文件 ${personalDraft.rows.length} 条，已选 ${count} 条；${personalDraft.reviewCount} 条 AI 候选需复核。`,`File: ${personalDraft.rows.length} notes; ${count} selected; ${personalDraft.reviewCount} AI candidates need review.`);
  }
  $('#personalImportFile').onchange=async()=>{
    if(metadataSaving)return;const generation=++personalImportGeneration;
    const file=$('#personalImportFile').files?.[0];personalDraft=null;$('#personalImportRows').replaceChildren();$('#personalImportPanel').hidden=true;$('#personalImportConfirm').disabled=true;
    if(!file)return;
    try{
      assertWorkspaceAccount();if(file.size>10*1024*1024)throw Error('METADATA_INVALID');
      const parsed=parsePersonalImport(await file.text());assertWorkspaceAccount();if(generation!==personalImportGeneration)return;
      const current=personalRecords(),rows=[];let reviewCount=0;
      for(const row of parsed.items){
        const existing=current.get(row.gifId),line=document.createElement('div');line.className='metadata-import-row';
        const check=document.createElement('input');check.type='checkbox';check.checked=!row.needsReview;check.setAttribute('aria-label',ui('导入备注 ','Import note: ')+row.name);
        const label=document.createElement('label');label.append(check,row.name);
        const detail=document.createElement('p');detail.textContent=ui('本机：','Local: ')+(existing?.name || ui('无备注','No note'))+' → '+ui('导入：','Import: ')+row.name+' · '+row.keywords.join(', ')+(row.animationOverride && row.animationOverride!=='auto'?' · '+ui('图片形式：','Image format: ')+importedFormatText(row.animationOverride):'')+(row.needsReview?' · '+ui('需复核：','Needs review: ')+row.reviewReason:'');
        const mode=document.createElement('select');mode.setAttribute('aria-label',ui('冲突处理 ','Conflict policy: ')+row.name);
        for(const [value,zh,en] of [['keep','保留我的备注','Keep my note'],['replace','使用导入备注','Use imported note']]){const option=document.createElement('option');option.value=value;option.textContent=ui(zh,en);mode.append(option);}
        mode.disabled=!existing;mode.value=existing?'keep':'replace';check.onchange=updatePersonalImportCount;
        line.append(label,detail,mode);$('#personalImportRows').append(line);rows.push({row,check,mode,refreshCopy:()=>{detail.textContent=ui('本机：','Local: ')+(existing?.name || ui('无备注','No note'))+' → '+ui('导入：','Import: ')+row.name+' · '+row.keywords.join(', ')+(row.animationOverride && row.animationOverride!=='auto'?' · '+ui('图片形式：','Image format: ')+importedFormatText(row.animationOverride):'')+(row.needsReview?' · '+ui('需复核：','Needs review: ')+row.reviewReason:'');}});if(row.needsReview)reviewCount++;
      }
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
      const rows=personalRecords();let count=0;
      for(const entry of personalDraft.rows){if(!entry.check.checked)continue;rows.set(entry.row.gifId,mergePersonalRecord(rows.get(entry.row.gifId),entry.row,entry.mode.value==='replace',$('#personalMergeKeywords').checked));count++;}
      $('#personalImportConfirm').disabled=true;await savePersonalRows([...rows.values()]);personalDraft=null;$('#personalImportPanel').hidden=true;$('#personalImportRows').replaceChildren();
      $('#personalSettingsStatus').textContent=ui(`已保存 ${count} 条备注；没有更改 SeaTalk 收藏。`,`Saved ${count} notes. SeaTalk favorites were not changed.`);notifyAction($('#personalSettingsStatus').textContent);
    }catch(error){$('#personalSettingsStatus').textContent=metadataMessage(error.message);notifyAction($('#personalSettingsStatus').textContent,'error');}
    finally{updatePersonalImportCount();}
  };
