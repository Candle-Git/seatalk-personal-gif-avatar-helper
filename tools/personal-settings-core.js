/* Metadata only. This module never stores preview URLs, credentials or account identifiers in exports. */
function validMetadataId(id) { return typeof id === 'string' && /^[a-zA-Z0-9]{64}$/.test(id) && ['b0701','b0702','b0705'].includes(id.slice(33,38)); }
function metadataText(value, max, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) throw Error('METADATA_INVALID');
  return value.trim();
}
function mergePersonalKeywords(...lists) {
  const words = new Map();
  for (const list of lists) {
    if (!Array.isArray(list)) throw Error('METADATA_INVALID');
    for (const word of list) {
      const text = metadataText(word,60), key = text.normalize('NFKC').toLocaleLowerCase();
      if (!text) throw Error('METADATA_INVALID');
      if (!words.has(key)) words.set(key,text);
      if (words.size > 30) throw Error('METADATA_KEYWORDS_LIMIT');
    }
  }
  return [...words.values()];
}
function splitPersonalKeywords(text) {
  return mergePersonalKeywords(text.split(/[,，\n]/).map(word => word.trim()).filter(Boolean));
}
function normalizePersonalRecord(row, candidate = false) {
  const allowed = ['gifId','name','keywords','visibleText','note','source','updatedAt','confidence','needsReview','reviewReason','animationOverride', ...(candidate ? ['index'] : [])];
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !allowed.includes(key)) || !validMetadataId(row.gifId)) throw Error('METADATA_INVALID');
  const name = metadataText(row.name,80), visibleText = metadataText(row.visibleText ?? '',500,true), note = metadataText(row.note ?? '',1000,true);
  const keywords = mergePersonalKeywords(row.keywords);
  const source = candidate ? 'ai' : row.source ?? 'manual';
  if (!['manual','shared','ai'].includes(source) || row.needsReview !== undefined && typeof row.needsReview !== 'boolean') throw Error('METADATA_INVALID');
  const confidence = row.confidence ?? 'high';
  if (!['high','medium','low'].includes(confidence)) throw Error('METADATA_INVALID');
  const animationOverride = row.animationOverride ?? 'auto';
  if (!['auto','unknown','animated','static'].includes(animationOverride)) throw Error('METADATA_INVALID');
  if (!name && (source !== 'manual' || !(keywords.length || visibleText || note || animationOverride !== 'auto'))) throw Error('METADATA_INVALID');
  const reviewReason = metadataText(row.reviewReason ?? '',500,true);
  const updatedAt = row.updatedAt ?? '';
  if (typeof updatedAt !== 'string' || updatedAt.length > 40 || updatedAt && !Number.isFinite(Date.parse(updatedAt))) throw Error('METADATA_INVALID');
  return {gifId:row.gifId,name,keywords,visibleText,note,source,updatedAt,confidence,needsReview:row.needsReview ?? false,reviewReason,...(animationOverride === 'auto' ? {} : {animationOverride})};
}
function applyPersonalRecordEdit(records, gifId, {name,keywords,animationOverride,acceptReview}, now = new Date().toISOString()) {
  const previous = records.get(gifId), oldKeywords = previous?.keywords || [];
  const nextName = metadataText(name,80);
  const sameKeywords = keywords.length === oldKeywords.length && keywords.every((word,index) => word === oldKeywords[index]);
  if (nextName === (previous?.name || '') && sameKeywords && animationOverride === (previous?.animationOverride || 'auto') && !(acceptReview && previous?.needsReview)) return false;
  if (!nextName && !keywords.length && animationOverride === 'auto' && !previous?.visibleText && !previous?.note) {
    return records.delete(gifId);
  }
  records.set(gifId,normalizePersonalRecord({
    ...previous,gifId,name:nextName,keywords,animationOverride,source:'manual',updatedAt:now,needsReview:false,confidence:'high',reviewReason:''
  }));
  return true;
}
function normalizePersonalRows(rows, candidate = false) {
  if (!Array.isArray(rows) || rows.length > 10000) throw Error('METADATA_INVALID');
  const result = [], ids = new Set();
  for (const row of rows) {
    const normalized = normalizePersonalRecord(row,candidate);
    if (ids.has(normalized.gifId)) throw Error('METADATA_DUPLICATE');
    ids.add(normalized.gifId); result.push(normalized);
  }
  return result;
}
const maxPersonalImportChars = 10 * 1024 * 1024;
async function readPersonalImportFile(file) {
  // UTF-8 needs up to three bytes per UTF-16 code unit (two units for supplementary characters).
  if (file.size > 3 * maxPersonalImportChars) throw Error('METADATA_INVALID');
  return parsePersonalImport(await file.text());
}
function parsePersonalImport(text) {
  if (typeof text !== 'string' || text.length > maxPersonalImportChars) throw Error('METADATA_INVALID');
  let doc; try { doc = JSON.parse(text); } catch (_) { throw Error('METADATA_INVALID'); }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw Error('METADATA_INVALID');
  const fields = ['gifId','name','keywords','source','confidence','needsReview','animationOverride'];
  const backup = doc.kind === 'seatalk-personal-settings';
  if (backup) {
    if (doc.schema !== 3 || Object.keys(doc).some(key => !['kind','schema','exportedAt','items','groups'].includes(key))) throw Error('METADATA_INVALID');
  } else {
    if (!doc.metadata || typeof doc.metadata !== 'object' || Array.isArray(doc.metadata) || Object.keys(doc).some(key => !['metadata','items'].includes(key))) throw Error('METADATA_INVALID');
    fields.push('index');
  }
  if (!Array.isArray(doc.items) || doc.items.length > 10000 || doc.items.some(row => !row || typeof row !== 'object' || Object.keys(row).some(key => !fields.includes(key)))) throw Error('METADATA_INVALID');
  const items = normalizePersonalRows(doc.items,!backup);
  return backup ? {kind:'backup',items,groups:normalizePersonalGroups(doc.groups)} : {kind:'candidates',items};
}
function exportPersonalSettings(rows, now = new Date().toISOString(), groups = []) {
  const items = [];
  for (const row of normalizePersonalRows(rows)) {
    const {gifId,name,keywords,source,confidence,needsReview,animationOverride} = row;
    if (name || keywords.length || animationOverride) {
      items.push({gifId,name,keywords,source,confidence,needsReview,...(animationOverride ? {animationOverride} : {})});
    }
  }
  const backup = {kind:'seatalk-personal-settings',schema:3,exportedAt:now,items,groups:normalizePersonalGroups(groups)};
  const readable = JSON.stringify(backup,null,2);
  // Indentation alone can push a valid account snapshot past the text limit for imports.
  if (readable.length <= maxPersonalImportChars) return readable;
  const compact = JSON.stringify(backup);
  if (compact.length > maxPersonalImportChars) throw Error('METADATA_INVALID');
  return compact;
}
function mergePersonalRecord(current, incoming, replace = false, mergeKeywords = true) {
  const next = normalizePersonalRecord(incoming);
  if (!current) return next;
  const previous = normalizePersonalRecord(current);
  const result = replace ? {...next,note:previous.note,visibleText:previous.visibleText} : {...previous};
  if (mergeKeywords) result.keywords = mergePersonalKeywords(previous.keywords,next.keywords);
  return normalizePersonalRecord(result);
}
function mergeSharedPersonalRecord(current, shared, gifId, replace, now = new Date().toISOString()) {
  const incoming = normalizePersonalRecord({
    gifId, name:shared.label, keywords:shared.keywords || [], animationOverride:current?.animationOverride || 'auto',
    source:'shared', updatedAt:now
  });
  const merged = mergePersonalRecord(current,incoming,replace,true);
  if (!merged.name) merged.name = incoming.name;
  return merged;
}
function personalMetadataMatches(row, query) {
  const terms = String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const searchable = [row.name,...(row.keywords || []),row.visibleText || '',row.note || ''].join(' ').normalize('NFKC').toLocaleLowerCase();
  return terms.every(term=>searchable.includes(term));
}
function personalGroupKey(name) { return name.normalize('NFKC').toLowerCase(); }

function normalizePersonalGroups(groups) {
  if (!Array.isArray(groups) || groups.length > 1000) throw Error('METADATA_INVALID');
  const names = new Set(), ids = new Set();
  return groups.map(group => {
    if (!group || typeof group !== 'object' || Object.keys(group).some(key => !['name','gifIds'].includes(key)) || !Array.isArray(group.gifIds)) throw Error('METADATA_INVALID');
    const name = metadataText(group.name, 60), key = personalGroupKey(name);
    if (!name || names.has(key)) throw Error('METADATA_INVALID');
    names.add(key);
    for (const id of group.gifIds) {
      if (!validMetadataId(id) || ids.has(id) || ids.size >= 10000) throw Error('METADATA_INVALID');
      ids.add(id);
    }
    return {name, gifIds:[...group.gifIds]};
  });
}

function validateSettingsSnapshot(value) {
  if (!value || ![1,2].includes(value.schema) || !Number.isSafeInteger(value.revision) || value.revision < 0) throw Error('METADATA_STORAGE_INVALID');
  const fields = value.schema === 1 ? ['schema','revision','items'] : ['schema','revision','items','groups'];
  if (Object.keys(value).some(key => !fields.includes(key))) throw Error('METADATA_STORAGE_INVALID');
  return {schema:2, revision:value.revision, items:normalizePersonalRows(value.items), groups:value.schema === 1 ? [] : normalizePersonalGroups(value.groups)};
}

function groupMemberships(groups) {
  const membership = new Map();
  for (const group of groups) for (const id of group.gifIds) membership.set(id,group.name);
  return membership;
}

// Preview and save all organization changes against the same settings revision.
function planPersonalOrganization(snapshot, ids, changes, now = new Date().toISOString()) {
  if (!Array.isArray(ids) || !changes || typeof changes !== 'object' ||
      Object.keys(changes).some(key => !['group','name','keywords'].includes(key))) throw Error('METADATA_INVALID');
  const selected = new Set(ids);
  if (selected.size > 10000 || [...selected].some(id => !validMetadataId(id))) throw Error('METADATA_INVALID');
  const {revision,items,groups} = validateSettingsSnapshot(snapshot);
  const name = metadataText(changes.name ?? '',80);
  const keywords = mergePersonalKeywords(changes.keywords === undefined ? [] : changes.keywords);
  let group = changes.group === undefined ? undefined : metadataText(changes.group,60);
  const records = new Map(items.map(row => [row.gifId,row]));
  let movedCount = 0, nameChangedCount = 0, nameOverwriteCount = 0, keywordChangedCount = 0;
  if (group !== undefined && selected.size) {
    const previous = groupMemberships(groups);
    let destination = groups.find(entry => personalGroupKey(entry.name) === personalGroupKey(group));
    if (group && !destination) { destination = {name:group,gifIds:[]}; groups.push(destination); }
    if (destination) group = destination.name;
    const moved = new Set([...selected].filter(id => (previous.get(id) || '') !== group));
    movedCount = moved.size;
    if (movedCount) {
      for (const entry of groups) entry.gifIds = entry.gifIds.filter(id => !moved.has(id));
      if (destination) destination.gifIds.push(...moved);
    }
  }
  if (name || keywords.length) {
    for (const id of selected) {
      const existing = records.get(id);
      const changeName = name && name !== existing?.name;
      const oldKeywords = existing?.keywords || [];
      const combined = keywords.length ? mergePersonalKeywords(oldKeywords, keywords) : oldKeywords;
      const changeKeywords = combined.length !== oldKeywords.length;
      if (!changeName && !changeKeywords) continue;
      const row = existing ? {...existing} : {gifId:id,name:'',keywords:[],source:'manual'};
      if (changeName) {
        if (row.name) nameOverwriteCount++;
        nameChangedCount++;
        row.name = name;
      }
      if (changeKeywords) {
        keywordChangedCount++;
        row.keywords = combined;
      }
      records.set(id,normalizePersonalRecord({...row,updatedAt:now}));
    }
  }
  const result = validateSettingsSnapshot({schema:2,revision,items:[...records.values()],groups});
  return {...result,group,selectedCount:selected.size,movedCount,nameChangedCount,nameOverwriteCount,keywordChangedCount};
}

function personalBackupEntries(parsed, snapshot) {
  const localRecords = new Map(snapshot.items.map(row => [row.gifId,row]));
  const localGroups = groupMemberships(snapshot.groups);
  const incomingGroups = groupMemberships(parsed.groups || []);
  const records = new Map(parsed.items.map(row => [row.gifId,row]));
  const ids = new Set([...records.keys(),...incomingGroups.keys()]);
  const entries = [...ids].map(gifId => {
    const record = records.get(gifId), group = incomingGroups.get(gifId);
    const localRecord = localRecords.get(gifId), localGroup = localGroups.get(gifId);
    const hasConflict = Boolean(record && localRecord || group && localGroup && personalGroupKey(group) !== personalGroupKey(localGroup));
    return {gifId,record,group,localRecord,localGroup,needsReview:!!record?.needsReview,hasConflict};
  });
  for (const group of parsed.groups || []) {
    if (!group.gifIds.length) entries.push({group:group.name,hasConflict:false,needsReview:false});
  }
  return entries;
}

function mergePersonalBackup(snapshot, entries, mergeKeywords) {
  const records = new Map(snapshot.items.map(row => [row.gifId,row]));
  const groups = new Map(snapshot.groups.map(({name,gifIds}) => [personalGroupKey(name),{name,ids:new Set(gifIds)}]));
  const memberships = groupMemberships(snapshot.groups);
  for (const {gifId,record,group,replace} of entries) {
    if (record) records.set(gifId,mergePersonalRecord(records.get(gifId),record,replace,mergeKeywords));
    if (!group) continue;
    const key = personalGroupKey(group), existing = memberships.get(gifId);
    if (existing && personalGroupKey(existing) !== key && !replace) continue;
    if (!groups.has(key)) groups.set(key,{name:group,ids:new Set()});
    if (!gifId) continue;
    if (existing) groups.get(personalGroupKey(existing)).ids.delete(gifId);
    const destination = groups.get(key);
    destination.ids.add(gifId);
    memberships.set(gifId,destination.name);
  }
  return validateSettingsSnapshot({schema:2,revision:snapshot.revision,items:[...records.values()],
    groups:[...groups.values()].map(({name,ids}) => ({name,gifIds:[...ids]}))});
}

async function requestPersonalSettingsBridge(account, request) {
  if (!Number.isSafeInteger(account) || account <= 0) return Promise.reject(Error('METADATA_ACCOUNT_CHANGED'));
  const completed = result => {
    if (request.kind === 'save') window.dispatchEvent(new CustomEvent('spga:personal-settings-changed',{detail:JSON.stringify({account,revision:result.revision})}));
    return result;
  };
  if (globalThis.__SPGA_TEST_MODE__ === true && globalThis.__SPGA_PERSONAL_SETTINGS_FIXTURE__) {
    return completed(validateSettingsSnapshot(await globalThis.__SPGA_PERSONAL_SETTINGS_FIXTURE__.request({...request,account})));
  }
  return new Promise((resolve,reject) => {
    const id = Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const finish = (error,value) => {
      clearTimeout(timer);
      window.removeEventListener('spga:settings-response',receive);
      if (error) reject(error); else resolve(value);
    };
    const receive = event => {
      if (typeof event.detail !== 'string') return;
      let result; try { result = JSON.parse(event.detail); } catch (_) { return; }
      if (result.id !== id) return;
      if (!result.ok) { finish(Error(result.error)); return; }
      try { finish(null,validateSettingsSnapshot(result.value)); } catch (error) { finish(error); }
    };
    const timer = setTimeout(() => finish(Error('METADATA_SAVE_FAILED')),6000);
    window.addEventListener('spga:settings-response',receive);
    window.dispatchEvent(new CustomEvent('spga:settings-request',{detail:JSON.stringify({...request,id,account})}));
  }).then(completed);
}
