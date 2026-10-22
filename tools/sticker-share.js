/* Versioned, self-contained share codes. No URLs, credentials or account fields. */
function normalizeSharedStickers(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error('请选择 1–100 个表情');
  const seen = new Set();
  const stickers = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        Object.keys(item).some(key => !['gifId', 'label'].includes(key)) ||
        typeof item.gifId !== 'string' || !/^[a-zA-Z0-9]{64}$/.test(item.gifId) ||
        !['b0701', 'b0705'].includes(item.gifId.slice(33, 38)) ||
        typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80 ||
        /[\u0000-\u001f\u007f]/.test(item.label)) throw Error('口令包含无效的表情或名称');
    if (!seen.has(item.gifId)) { stickers.push({ gifId: item.gifId, label: item.label.trim() }); seen.add(item.gifId); }
  }
  return stickers;
}
function encodeStickerShare(stickers) {
  const data = { v: 1, stickers: normalizeSharedStickers(stickers) };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  return 'STGIF1.' + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeStickerShare(text) {
  if (typeof text !== 'string' || text.length > 65536) throw Error('口令过长或无效，最多支持 100 个表情');
  const code = text.trim();
  if (!/^STGIF1\.[A-Za-z0-9_-]+$/.test(code)) throw Error('请粘贴完整的 STGIF1 分享口令');
  try {
    const raw = code.slice(7).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || data.v !== 1 || Object.keys(data).some(key => !['v', 'stickers'].includes(key))) throw Error();
    return normalizeSharedStickers(data.stickers);
  } catch (_) { throw Error('分享口令损坏或内容无效，请重新复制'); }
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
