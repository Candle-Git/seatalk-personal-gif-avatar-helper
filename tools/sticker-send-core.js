/* The caller must obtain explicit confirmation for this exact account, target and frozen selection. */
async function sendSelectedStickers(selected, adapters) {
  if (!Array.isArray(selected) || !selected.length || selected.length > 100 || selected.some(item=>!validMetadataId(item.gifId))) throw Error('SEND_SELECTION_INVALID');
  const pending = selected.map(item=>Object.freeze({...item}));
  let sent = 0;
  for (const item of pending) {
    adapters.guard();
    if (adapters.stopped()) return {sent,stopped:true};
    const dimensions = await adapters.preview(item); adapters.guard();
    if (!Number.isInteger(dimensions.width) || !Number.isInteger(dimensions.height) || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 20000 || dimensions.height > 20000) throw Error('SEND_PREVIEW_FAILED');
    if (adapters.stopped()) return {sent,stopped:true};
    adapters.guard();
    let receipt;
    try { receipt = await adapters.send(item,dimensions); }
    catch (_) { throw Error('SEND_UNCONFIRMED'); }
    adapters.guard();
    const result = await adapters.receipt(item,receipt); adapters.guard();
    if (result !== 'confirmed') throw Error(result === 'failed' ? 'SEND_FAILED' : 'SEND_UNCONFIRMED');
    sent++; adapters.report(sent,pending.length);
    if (sent < pending.length) { await adapters.pause(800); adapters.guard(); }
  }
  return {sent,stopped:false};
}
function currentStickerSendTarget(services, editorVisible) {
  const state = services.store.getState(), session = state.messages?.selectedSession;
  if (!editorVisible || !session || !['buddy','group'].includes(session.type) || !Number.isSafeInteger(session.id) || session.id <= 0 || state.messages.currentThreadId) throw Error('SEND_TARGET_UNAVAILABLE');
  const info = (session.type === 'group' ? state.contact?.groupInfo : state.contact?.buddyInfo)?.[session.id];
  const name = info?.name || info?.raw?.n || info?.n || session.name;
  if (typeof name !== 'string' || !name.trim()) throw Error('SEND_TARGET_UNAVAILABLE');
  return Object.freeze({id:session.id,type:session.type,name:name.slice(0,150)});
}
function sameStickerSendTarget(left,right) { return !!left && !!right && left.id === right.id && left.type === right.type && left.name === right.name; }
function findStickerSendReceipt(messages, before, target, gifId, sender, tag, cid = null) {
  const matches = Object.entries(messages || {}).filter(([key,message])=>key.startsWith(target.type+'-'+target.id+'-') && message.cid && !before.has(String(message.cid)) && (cid === null || String(message.cid) === cid) && message.tag === tag && message.content?.fileId === gifId && Number(message.senderId) === sender);
  if (matches.length !== 1) return {status:matches.length > 1?'ambiguous':'pending',cid};
  const message = matches[0][1], nextCid = String(message.cid);
  if (message.error || message.errorCode) return {status:'failed',cid:nextCid};
  const mid = String(message.mid || '');
  return {status:/^[0-9a-f]{16}$/i.test(mid) && BigInt('0x'+mid)>0n && Number(message.serverTimeStamp)>0 ? 'confirmed' : 'pending',cid:nextCid};
}
