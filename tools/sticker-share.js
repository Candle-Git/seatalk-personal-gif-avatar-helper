/* Versioned, self-contained share codes. No URLs, credentials or account fields. */
function normalizeSharedStickers(value, metadata = false) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error('请选择 1–100 个表情');
  const seen = new Set(), stickers = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key=>!(metadata?['gifId','label','keywords','visibleText']:['gifId','label']).includes(key)) || typeof item.gifId !== 'string' || !/^[a-zA-Z0-9]{64}$/.test(item.gifId) || !['b0701','b0702','b0705'].includes(item.gifId.slice(33,38)) || typeof item.label !== 'string' || !item.label.trim() || item.label.length>80 || /[\u0000-\u001f\u007f]/.test(item.label)) throw Error('口令包含无效的表情或名称');
    const row={gifId:item.gifId,label:item.label.trim()};
    if(metadata){
      if(!Array.isArray(item.keywords) || item.keywords.length>30 || item.keywords.some(word=>typeof word!=='string' || !word.trim() || word.length>60 || /[\u0000-\u001f\u007f]/.test(word)) || typeof item.visibleText!=='string' || item.visibleText.length>500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(item.visibleText))throw Error('口令包含无效的表情或名称');
      const keywords=new Map();for(const word of item.keywords){const text=word.trim(),key=text.normalize('NFKC').toLocaleLowerCase();if(!keywords.has(key))keywords.set(key,text);}
      row.keywords=[...keywords.values()];row.visibleText=item.visibleText.trim();
    }
    if(!seen.has(row.gifId)){stickers.push(row);seen.add(row.gifId);}
  }
  return stickers;
}
function encodeStickerShare(stickers) {
  const metadata=Array.isArray(stickers) && stickers.some(row=>row && ('keywords' in row || 'visibleText' in row));
  const data={v:metadata?2:1,stickers:normalizeSharedStickers(stickers,metadata)};
  const bytes=new TextEncoder().encode(JSON.stringify(data));
  return (metadata?'STGIF2.':'STGIF1.')+btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeStickerShare(text) {
  if(typeof text!=='string' || text.length>2097152)throw Error('口令过长或无效，最多支持 100 个表情');
  const code=text.trim(),match=/^STGIF([12])\.([A-Za-z0-9_-]+)$/.exec(code);
  if(!match || match[1]==='1' && code.length>65536)throw Error('请粘贴完整的 STGIF1 或 STGIF2 分享口令');
  try{
    const raw=match[2].replace(/-/g,'+').replace(/_/g,'/'),bytes=Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if(!data || data.v!==Number(match[1]) || Object.keys(data).some(key=>!['v','stickers'].includes(key)))throw Error();
    return normalizeSharedStickers(data.stickers,data.v===2);
  }catch(_){throw Error('分享口令损坏或内容无效，请重新复制');}
}

/* Injectable mutation workflow: freeze selection and account, skip duplicates, stop on uncertainty. */
async function addSharedStickers(selected, adapters) {
  const pending = selected.map(item => ({ ...item }));
  if (!pending.length || pending.length > 100 || pending.some(item =>
      !Number.isInteger(item.width) || item.width < 1 || item.width > 20000 ||
      !Number.isInteger(item.height) || item.height < 1 || item.height > 20000)) throw Error('请先预览并选择可添加的表情');
  normalizeSharedStickers(pending.map(({ gifId, label }) => ({ gifId, label })));
  const account = adapters.accountId();
  if (!Number.isSafeInteger(account) || account <= 0) throw Error('请先登录 SeaTalk');
  const check = () => {
    if (!adapters.active() || adapters.accountId() !== account) throw Error('账号或窗口状态已变化，已停止添加');
  };
  let added = 0, skipped = 0, stopped = false;
  for (const item of pending) {
    check();
    if (adapters.stopped()) { stopped = true; break; }
    if (adapters.has(item.gifId)) { skipped++; continue; }
    adapters.report(`正在添加 ${added + skipped + 1} / ${pending.length}…`);
    try { await adapters.add(item); } // Native favorite action only; never constructs a chat-send request.
    catch (_) { throw Error('添加请求未确认，已停止后续操作'); }
    check();
    let observed = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      await adapters.pause(500); check();
      if (adapters.has(item.gifId)) { observed = true; break; }
    }
    if (!observed) throw Error('添加结果尚未确认，已停止。请刷新收藏核对，勿立即重复添加');
    added++;
    await adapters.pause(500);
  }
  check();
  return { added, skipped, stopped };
}
