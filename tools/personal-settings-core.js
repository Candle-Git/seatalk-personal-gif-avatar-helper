/* Metadata only. This module never stores preview URLs, credentials or account identifiers in exports. */
function validMetadataId(id) { return typeof id === 'string' && /^[a-zA-Z0-9]{64}$/.test(id) && ['b0701','b0702','b0705'].includes(id.slice(33,38)); }
function metadataText(value, max, multiline = false) {
  if (typeof value !== 'string' || value.length > max || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value)) throw Error('METADATA_INVALID');
  return value.trim();
}
function normalizePersonalRecord(row, candidate = false) {
  const allowed = ['gifId','name','keywords','visibleText','note','source','updatedAt','confidence','needsReview','reviewReason','animationOverride', ...(candidate ? ['index'] : [])];
  if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !allowed.includes(key)) || !validMetadataId(row.gifId)) throw Error('METADATA_INVALID');
  const name = metadataText(row.name,80), visibleText = metadataText(row.visibleText ?? '',500,true), note = metadataText(row.note ?? '',1000,true);
  if (!name || !Array.isArray(row.keywords) || row.keywords.length > 30) throw Error('METADATA_INVALID');
  const keywords = [], seen = new Set();
  for (const keyword of row.keywords) {
    const text = metadataText(keyword,60), key = text.normalize('NFKC').toLocaleLowerCase();
    if (!text) throw Error('METADATA_INVALID');
    if (!seen.has(key)) { keywords.push(text); seen.add(key); }
  }
  const source = candidate ? 'ai' : row.source ?? 'manual';
  if (!['manual','shared','ai'].includes(source) || row.needsReview !== undefined && typeof row.needsReview !== 'boolean') throw Error('METADATA_INVALID');
  const confidence = row.confidence ?? 'high';
  if (!['high','medium','low'].includes(confidence)) throw Error('METADATA_INVALID');
  const animationOverride = row.animationOverride ?? 'auto';
  if (!['auto','unknown','animated','static'].includes(animationOverride)) throw Error('METADATA_INVALID');
  const reviewReason = metadataText(row.reviewReason ?? '',500,true);
  const updatedAt = row.updatedAt ?? '';
  if (typeof updatedAt !== 'string' || updatedAt.length > 40 || updatedAt && !Number.isFinite(Date.parse(updatedAt))) throw Error('METADATA_INVALID');
  return {gifId:row.gifId,name,keywords,visibleText,note,source,updatedAt,confidence,needsReview:row.needsReview ?? false,reviewReason,...(animationOverride === 'auto' ? {} : {animationOverride})};
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
function parsePersonalImport(text) {
  if (typeof text !== 'string' || text.length > 10 * 1024 * 1024) throw Error('METADATA_INVALID');
  let doc; try { doc = JSON.parse(text); } catch (_) { throw Error('METADATA_INVALID'); }
  if (Array.isArray(doc)) {
    if(doc.length>10000 || doc.some(row=>!row || typeof row!=='object' || Object.keys(row).some(key=>!['gifId','label'].includes(key))))throw Error('METADATA_INVALID');
    return {kind:'legacy',items:normalizePersonalRows(doc.map(row=>({gifId:row.gifId,name:row.label,keywords:[],source:'manual'})))};
  }
  if (!doc || typeof doc !== 'object') throw Error('METADATA_INVALID');
  if (doc.kind === 'seatalk-personal-settings' && doc.schema === 1 && Object.keys(doc).every(k=>['kind','schema','exportedAt','items'].includes(k))) return {kind:'backup',items:normalizePersonalRows(doc.items)};
  if (doc.metadata && Array.isArray(doc.items) && Object.keys(doc).every(k=>['metadata','items'].includes(k))) return {kind:'candidates',items:normalizePersonalRows(doc.items,true)};
  throw Error('METADATA_INVALID');
}
function exportPersonalSettings(rows, now = new Date().toISOString()) {
  return JSON.stringify({kind:'seatalk-personal-settings',schema:1,exportedAt:now,items:normalizePersonalRows(rows)},null,2);
}
function mergePersonalRecord(current, incoming, replace = false, mergeKeywords = true) {
  const next = normalizePersonalRecord(incoming);
  if (!current) return next;
  const previous = normalizePersonalRecord(current);
  const result = replace ? {...next} : {...previous};
  if (mergeKeywords) {
    const seen = new Set(); result.keywords = [];
    for (const keyword of [...previous.keywords,...next.keywords]) {
      const key = keyword.normalize('NFKC').toLocaleLowerCase();
      if (!seen.has(key)) { result.keywords.push(keyword); seen.add(key); }
    }
    if (result.keywords.length > 30) throw Error('METADATA_KEYWORDS_LIMIT');
  }
  return normalizePersonalRecord(result);
}
function personalMetadataMatches(row, query) {
  const terms = String(query).normalize('NFKC').toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const searchable = [row.name,...(row.keywords || []),row.visibleText || '',row.note || ''].join(' ').normalize('NFKC').toLocaleLowerCase();
  return terms.every(term=>searchable.includes(term));
}
function validateSettingsSnapshot(value) {
  if (!value || value.schema !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || Object.keys(value).some(k=>!['schema','revision','items'].includes(k))) throw Error('METADATA_STORAGE_INVALID');
  return {schema:1,revision:value.revision,items:normalizePersonalRows(value.items)};
}
