/* Integrated favorites window. Signed URLs and all workspace state stay in page memory. */
function launchFavoritesGallery(presets = []) {
  /* SHARE_HELPERS */
  /* WORKSPACE_ACCOUNT */
  const existing = document.getElementById('st-favorites-curator');
  if (existing) { existing.__open?.(); return { reopened: true }; }
  const pickerSelector = '.sealabs-stickers-panel .sealabs-sticker, .sealabs-stickers-panel .sticker-wrapper';
  const seed = document.querySelector(pickerSelector);
  if (!seed) throw Error('请先打开 SeaTalk 表情面板，切换到爱心「收藏」，再打开「我的收藏」。');
  function readSource(element, requireActions = true) {
    let fiber = element?.[Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'))];
    let list, actions;
    for (let count = 0; fiber && count < 24; count++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.isCustomTab === true && Array.isArray(props.stickers)) list = props.stickers;
      if (props?.actions?.actionRemoveCustomStickers) actions = props.actions;
    }
    if (!list || requireActions && !actions) throw Error('请先打开 SeaTalk 爱心收藏面板，再重新操作。');
    return { list, actions };
  }
  const source = readSource(seed, false).list;
  const liveSource = () => readSource(document.querySelector(pickerSelector));
  const known = new Map(presets.map(item => [item.gifId, item.label]));
  const items = [], seen = new Set();
  for (const item of source) {
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9]{32,}$/.test(item.id) || seen.has(item.id)) continue;
    let url;
    try { url = new URL(item.url); } catch (_) { continue; }
    if (url.protocol !== 'https:' || url.hostname !== 'f.haiserve.com' || !url.pathname.startsWith('/download/' + item.id + '_')) continue;
    seen.add(item.id);
    items.push({ gifId: item.id, url: url.href, label: String(known.get(item.id) || item.name || `收藏 ${items.length + 1}`).slice(0, 80),
      existing: known.has(item.id), selected: false, animation: 'unknown' });
  }
  let scanning = false, scanCancelled = false, deleting = false, stop = false, deleteNeedsReview = false;
  let workspaceAccountCheck = null, workspaceAccountState = 'pending';
  const assertWorkspaceAccount = () => { if (!workspaceAccountCheck) throw Error('当前账号尚未核对，请稍后重新打开。'); return workspaceAccountCheck(); };
  let page = 0, pending = [], selectedView = null, geometryCustom = false;
  const size = 48, activeRequests = new Set();
  const host = document.createElement('section'); host.id = 'st-favorites-curator';
  host.dataset.open = host.dataset.managed = 'true';
  host.setAttribute('aria-label', 'SeaTalk GIF 助手 · 我的收藏');
  const miniId = 'st-favorites-minimized';
  document.getElementById(miniId)?.remove();
  const mini = document.createElement('button'); mini.id = miniId; mini.hidden = true;
  mini.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;border:0;border-radius:22px;background:#0866c6;color:#fff;padding:12px 18px;box-shadow:0 6px 24px #17203330;font:600 14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;cursor:pointer';
  const visibilityId = 'spga-workspace-visibility';
  let visibilityStyle = document.getElementById(visibilityId);
  if (!visibilityStyle) { visibilityStyle = document.createElement('style'); visibilityStyle.id = visibilityId; document.head.append(visibilityStyle); }
  visibilityStyle.textContent = `body:has(#st-favorites-curator[data-managed="true"]) #seatalk-personal-gif-avatar-panel {display:none!important}
    body:has(#st-favorites-curator[data-managed="true"]) #seatalk-personal-gif-avatar-toggle {visibility:hidden!important}
    body:has(#st-favorites-curator[data-open="true"]) .sealabs-stickers-panel {visibility:hidden!important;pointer-events:none!important}`;
  document.getElementById('seatalk-personal-gif-avatar-panel')?.classList.remove('spga-open');
  document.body.append(host, mini);
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{position:fixed;right:24px;top:50%;transform:translateY(-50%);width:820px;max-width:calc(100vw - 32px);height:min(800px,80dvh);max-height:calc(100dvh - 32px);z-index:2147483647;border-radius:14px;background:#fff;box-shadow:0 16px 70px #17203340;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;isolation:isolate;container-type:inline-size}
    *{box-sizing:border-box}[hidden]{display:none!important}button,input,select,textarea{font:inherit}button{min-height:34px;padding:7px 12px;border:1px solid #d0d5dd;border-radius:8px;color:#344054;background:#fff;cursor:pointer;white-space:nowrap}button:hover{border-color:#0866c6;background:#f8fbff}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #b9d8f4;outline-offset:1px}button:disabled{opacity:.45;cursor:default}button.primary{background:#0866c6;border-color:#0866c6;color:white}button.danger{color:#b42318;border-color:#f2b8b1}button.danger-fill{background:#c62828;border-color:#c62828;color:white}button.danger-fill:hover{background:#a91e1e}input,select,textarea{border:1px solid #d0d5dd;border-radius:8px;background:#fff;color:#344054;padding:8px 10px}input[type=checkbox]{accent-color:#0866c6;width:16px;height:16px;margin:0}p{color:#667085;line-height:1.6;margin:8px 0}.spacer{flex:1}.app{position:relative;height:100%;display:flex;flex-direction:column;border-radius:14px;overflow:hidden;background:#f8fafc}
    #dragHandle{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 16px;background:#edf2f7;cursor:grab;touch-action:none;user-select:none;flex-shrink:0}#dragHandle:active{cursor:grabbing}#dragHandle h1{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:16px;margin:0;white-space:nowrap;flex:1}.grip{font-size:18px;color:#667085;letter-spacing:-3px}.window-controls{display:flex;align-items:center;gap:6px}.window-controls button{min-height:32px;padding:6px 10px}.window-controls .icon-button{padding:5px 9px;font-size:18px;line-height:18px}.workspace-tabs{display:flex;gap:4px;margin:12px 16px 0;padding:4px;background:#edf2f7;border-radius:12px;flex-shrink:0}.workspace-tabs button{flex:1;background:transparent;border:0;color:#59677b}.workspace-tabs [aria-selected=true]{background:#fff;color:#0866c6;box-shadow:0 1px 4px #152b4620;font-weight:600}
    header{flex-shrink:0;background:#fff;padding:10px 16px 12px;border-bottom:1px solid #e4e7ec}#summary{margin:0 0 10px;font-size:12px}.toolbar{display:flex;align-items:center;gap:8px}.toolbar input[type=search]{min-width:100px;flex:1}.toolbar select{max-width:155px}.toolbar button{padding:7px 10px}.status-row{display:flex;align-items:center;gap:8px;min-height:20px;margin-top:8px;font-size:12px;color:#667085;line-height:1.6;overflow-wrap:anywhere}.status-row p{margin:0}#scanStatus{flex:1}.empty{padding:36px 16px;text-align:center;color:#667085;line-height:1.8}.empty h2{font-size:17px;color:#344054}.empty button{margin-top:8px}
    main{flex:1;min-height:0;overflow:auto;padding:16px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(164px,1fr));gap:12px}.card{min-width:0;background:white;border:1px solid #e4e7ec;border-radius:12px;padding:10px}.card.chosen{border-color:#0866c6;box-shadow:0 0 0 1px #0866c6}.preview{width:100%;height:128px;padding:0;border:0;display:block;background:repeating-conic-gradient(#f2f4f7 0% 25%,white 0% 50%) 50%/16px 16px;overflow:hidden}.preview img{height:100%;width:100%;object-fit:contain}.card-title{display:flex;gap:5px;align-items:center;margin-top:9px}.card-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600;font-size:13px}.edit-name{padding:0 4px;min-height:25px;border-color:transparent;font-size:12px;color:#667085}.name{min-width:0;width:100%;padding:5px 7px;font-size:13px}.card-bottom{display:flex;align-items:center;justify-content:space-between;gap:4px;margin-top:8px}.badge{font-size:11px;color:#667085;background:#f2f4f7;padding:3px 6px;border-radius:5px}.badge[data-kind=animated]{color:#0866c6;background:#edf7ff}.badge[data-kind=failed]{color:#b54708;background:#fffaeb}.card-bottom label{display:flex;align-items:center;gap:5px;font-size:12px;color:#344054;cursor:pointer}
    footer{flex-shrink:0;background:#fff;border-top:1px solid #e4e7ec}.pagination{display:flex;align-items:center;justify-content:center;gap:6px;padding:9px 14px;border-bottom:1px solid #f2f4f7;font-size:12px}.pagination button{font-size:12px;padding:5px 9px;min-height:30px}.pagination label{display:flex;gap:5px;align-items:center;white-space:nowrap}.pagination input{width:54px;padding:5px;min-height:30px}.selection-bar{display:flex;align-items:center;gap:8px;padding:10px 16px 16px}.selection-bar button{font-size:12px;padding:6px 10px}#count{font-size:13px;font-weight:600;white-space:nowrap}.selection-message{flex:1;min-width:0}#selectionHint{font-size:11px;color:#667085;line-height:1.5}#resizeHandle{position:absolute;right:1px;bottom:1px;min-height:15px;width:15px;height:15px;border:0;padding:0;background:linear-gradient(135deg,transparent 52%,#98a2b3 52%,#98a2b3 60%,transparent 60%,transparent 72%,#98a2b3 72%,#98a2b3 80%,transparent 80%);cursor:nwse-resize;touch-action:none;border-radius:0 0 10px 0}
    dialog{width:min(680px,calc(100vw - 32px));max-height:calc(100dvh - 40px);padding:0;border:1px solid #e4e7ec;border-radius:14px;box-shadow:0 16px 70px #17203340;color:#172033;overflow:auto}dialog::backdrop{background:#17203366}.dialog-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid #e4e7ec;background:#fff}.dialog-header h2{font-size:18px;flex:1;margin:0}.dialog-header button{font-size:18px;padding:3px 9px;min-height:30px}.dialog-body{padding:16px 18px}.dialog-actions{position:sticky;bottom:0;display:flex;justify-content:space-between;gap:8px;padding:12px 18px;border-top:1px solid #e4e7ec;background:white}.dialog-actions .right-actions{display:flex;gap:8px}dialog textarea{width:100%;height:150px;resize:vertical;min-height:90px;font:12px/1.5 monospace;overflow-wrap:anywhere}.guide section{padding:0 0 14px;margin-bottom:14px;border-bottom:1px solid #f2f4f7}.guide h3{font-size:15px;margin:0 0 7px}.guide p{font-size:13px;margin:5px 0}.guide ol{font-size:13px;color:#667085;padding-left:20px;line-height:1.8}.guide section:last-child{border:0;margin-bottom:0;padding:0}.thumb-list{display:flex;flex-wrap:wrap;gap:8px;max-height:36dvh;overflow:auto}.thumb-list img{width:72px;height:72px;object-fit:contain}.zoom-image{display:block;max-width:100%;max-height:55dvh;margin:auto;object-fit:contain}.import-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;max-height:35dvh;overflow:auto;margin:12px 0}.import-card{border:1px solid #e4e7ec;border-radius:10px;padding:10px;min-width:0}.import-card img{display:block;width:90px;height:90px;object-fit:contain;margin:0 auto 8px}.import-card label{display:flex;align-items:center;gap:6px;font-size:12px;overflow-wrap:anywhere}.import-card p{font-size:12px}.inline-actions{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.notice{padding:10px 12px;border-radius:8px;background:#f2f6fc;color:#42526b;font-size:12px;line-height:1.7}#hiddenTools{font-size:12px;margin-top:8px}.error{color:#b42318!important}
    #dockDivider{position:absolute;left:-8px;top:0;bottom:0;width:12px;border:0;background:transparent;border-radius:0;padding:0;cursor:col-resize;touch-action:none;z-index:3}#dockDivider:hover,#dockDivider:focus-visible{background:#0866c633}:host([data-docked=true]) #resizeHandle{display:none}:host([data-docked=true]) #dragHandle{cursor:default}:host([data-docked=true]) .grip{display:none}
    @container(max-width:650px){#dragHandle{padding:8px 10px;gap:6px}#dragHandle h1{font-size:14px}.grip{display:none}.window-controls{gap:3px}.window-controls button{font-size:12px;padding:5px 6px}#resetPosition{display:none}.toolbar{flex-wrap:wrap}.toolbar input[type=search]{flex-basis:100%}.toolbar select{flex:1;max-width:none}.toolbar button{font-size:12px}.grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}.preview{height:105px}.pagination{flex-wrap:wrap;gap:4px;padding:7px}.pagination button{padding:5px 6px}.selection-bar{flex-wrap:wrap;padding:8px 10px 16px}.selection-message{min-width:100%;display:flex;align-items:center;gap:8px}.selection-bar>.spacer{display:none}}
    @media(max-width:1000px){:host{left:50%;right:auto;transform:translate(-50%,-50%)}}@media(max-width:650px){:host{width:calc(100vw - 24px);max-width:calc(100vw - 24px);height:calc(100dvh - 40px)}#dragHandle{padding:8px 10px;gap:8px}#dragHandle h1{font-size:14px}.grip{display:none}.window-controls{gap:4px}.window-controls button{font-size:12px;padding:5px 6px}#resetPosition{display:none}.workspace-tabs{margin:8px 10px 0}header{padding:10px}.toolbar{flex-wrap:wrap}.toolbar input[type=search]{flex-basis:100%;}.toolbar select{flex:1;max-width:none}.toolbar button{font-size:12px}.grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}main{padding:10px}.preview{height:105px}.pagination{flex-wrap:wrap;gap:4px;padding:7px}.pagination button{padding:5px 6px}.selection-bar{flex-wrap:wrap;padding:8px 10px 16px}.selection-message{min-width:100%;display:flex;align-items:center;gap:8px}.selection-bar>.spacer{display:none}dialog .dialog-body{padding:12px}.card-title{gap:2px}}@media(max-height:560px){:host{height:calc(100dvh - 24px);max-height:calc(100dvh - 24px)}#summary{margin-bottom:6px}.workspace-tabs{margin-top:6px}.status-row{margin-top:4px}#dragHandle{min-height:44px;padding-top:6px;padding-bottom:6px}.selection-bar{padding-top:6px;padding-bottom:10px}.pagination{padding-top:5px;padding-bottom:5px}}
  </style>
  <button id="dockDivider" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" hidden></button><section class="app">
    <div id="dragHandle" title="拖动此栏移动窗口"><span class="grip" aria-hidden="true">⠿</span><h1>SeaTalk GIF 助手</h1><div class="window-controls"><button id="guideOpen">使用指南</button><button id="dockToggle" aria-label="切换分栏与浮窗" disabled>分栏</button><button id="resetPosition" class="icon-button" aria-label="恢复默认位置和大小" title="恢复默认位置和大小">↺</button><button id="minimize" class="icon-button" aria-label="收起我的收藏" title="收起，保留当前选择">−</button><button id="close" class="danger-fill" aria-label="关闭批量管理">✕ 关闭</button></div></div>
    <nav class="workspace-tabs" aria-label="助手功能" role="tablist"><button id="backAvatar" role="tab" aria-selected="false">头像助手</button><button role="tab" aria-selected="true" aria-current="page">我的收藏</button></nav>
    <header><p id="summary"></p><div class="toolbar"><input id="search" type="search" placeholder="搜索表情名称" aria-label="搜索收藏"><select id="filter" aria-label="显示范围"><option value="all">全部收藏</option><option value="selected">已选择</option></select><select id="animation" aria-label="图片类型"><option value="all">全部类型</option><option value="animated">动图</option><option value="static">静态图</option><option value="unknown">未检测</option><option value="failed">未能识别</option></select><button id="scan">识别动图</button><button id="importOpen">导入口令</button></div><div class="status-row"><span id="scanStatus" role="status">浏览和分享无需先识别动图。</span><button id="scanStop" hidden>停止识别</button></div><details id="hiddenTools" hidden><summary>开发工具</summary><button id="export">导出已选 JSON</button></details></header>
    <main><div class="grid"></div><div id="emptyState" class="empty" hidden><h2 id="emptyTitle"></h2><p id="emptyMessage"></p><button id="emptyScan" hidden>识别动图</button><button id="emptyReset">查看全部收藏</button></div></main>
    <footer><div class="pagination"><button id="first">首页</button><button id="prev">上一页</button><span id="page"></span><button id="next">下一页</button><button id="last">末页</button><label>跳至 <input id="jump" type="number" min="1" step="1" value="1" aria-label="跳转页码"> 页</label><button id="jumpGo">跳转</button></div><div class="selection-bar"><div class="selection-message"><span id="count">已选择 0 个</span><div id="selectionHint">先选择要分享或删除的表情。</div></div><button id="selectPage">全选本页</button><button id="viewSelected">查看已选</button><button id="clear">清空选择</button><span class="spacer"></span><button id="shareOpen" class="primary">生成分享口令</button><button id="remove" class="danger">删除所选表情</button></div></footer><button id="resizeHandle" aria-label="调整窗口大小" title="拖动调整大小，也可用方向键调整"></button>
  </section>
  <dialog id="guideDialog" aria-labelledby="guideTitle"><div class="dialog-header"><h2 id="guideTitle">我的收藏使用指南</h2><button data-close="guideDialog" aria-label="关闭使用指南">×</button></div><div class="dialog-body guide">
    <section><h3>开始前</h3><p>在 SeaTalk 打开表情面板，切换到爱心「收藏」页签，再打开助手的「我的收藏」。</p></section>
    <section><h3>选择和查看表情</h3><p>点击图片可放大，勾选复选框可选择。「全选本页」只选择当前页；翻页或切换筛选后，之前的选择仍会保留。点击「查看已选」可统一核对。</p><p>如需只看动图，先点击「识别动图」，再筛选「动图」。浏览和分享无需先识别。识别失败的图片会显示「未能识别」，不会当成静态图。</p></section>
    <section><h3>分享给朋友</h3><p>选择表情 → 点击「生成分享口令」→ 复制完整口令发给朋友。</p><p>每次最多分享 100 个。表情越多，口令越长。点击名称旁的编辑按钮可修改分享名称，不会修改 SeaTalk 原收藏。</p></section>
    <section><h3>添加朋友分享的表情</h3><p>点击「导入口令」→ 粘贴完整口令 → 点击「解析并预览」→ 选择表情 → 确认添加。</p><p>已收藏的表情会自动跳过；预览失败的表情暂时不能添加。</p></section>
    <section><h3>删除不需要的收藏</h3><p>选择表情 → 点击「删除所选表情」→ 核对图片和数量 → 确认删除。</p><p>删除只影响你的收藏，不会删除聊天消息。本助手无法撤销删除，分享口令也不保证能恢复。筛选之外的已选表情也会包括在确认清单中。</p></section>
    <section><h3>收起、关闭和结果核对</h3><p>点击顶栏「−」可收起为小入口，保留页码、筛选、勾选和识别进度；点击入口可恢复。宽屏时自动分栏，SeaTalk 在左侧、助手在右侧；拖动分隔线调整宽度。点击「浮窗」可切换为自由窗口，再拖动顶栏移动、拖动右下角调整大小。收起或关闭后恢复原页面布局。</p><p>操作结果不确定时，先刷新 SeaTalk 核对收藏，再决定是否重试。刷新会清空本次勾选。添加或删除进行中时，停止会等待当前表情的结果，再停止后续操作。</p></section>
  </div><div class="dialog-actions"><span></span><button id="guideClose" class="primary">知道了，返回管理</button></div></dialog>
  <dialog id="zoom" aria-labelledby="zoomTitle"><div class="dialog-header"><h2 id="zoomTitle">表情预览</h2><button data-close="zoom" aria-label="关闭预览">×</button></div><div class="dialog-body"><img class="zoom-image" alt="放大预览"><p></p></div><div class="dialog-actions"><span></span><button id="zoomClose">返回管理</button></div></dialog>
  <dialog id="sharing" aria-labelledby="shareTitle"><div class="dialog-header"><h2 id="shareTitle">分享所选表情</h2><button data-close="sharing" aria-label="关闭分享">×</button></div><div class="dialog-body"><p>复制完整口令发给朋友，对方可在「导入口令」中预览并添加。</p><textarea id="shareCode" readonly aria-label="分享口令"></textarea><p id="shareStatus" role="status"></p></div><div class="dialog-actions"><button id="shareClose">返回管理</button><button id="shareCopy" class="primary">复制分享口令</button></div></dialog>
  <dialog id="importing" aria-labelledby="importTitle"><div class="dialog-header"><h2 id="importTitle">导入口令</h2><button data-close="importing" aria-label="关闭导入">×</button></div><div class="dialog-body"><p>粘贴好友的完整口令，先预览并选择，再确认添加。</p><textarea id="importCode" aria-label="粘贴分享口令" maxlength="65536" placeholder="STGIF1.…"></textarea><div class="inline-actions"><button id="importParse">解析并预览</button><button id="importSelect">全选可添加</button></div><div id="importPreview" class="import-grid"></div><p id="importStatus" role="status"></p></div><div class="dialog-actions"><button id="importCancel">取消</button><div class="right-actions"><button id="importStop" hidden>停止后续添加</button><button id="importConfirm" class="primary" disabled>确认添加所选表情</button></div></div></dialog>
  <dialog id="deletion" aria-labelledby="deleteTitle"><div class="dialog-header"><h2 id="deleteTitle">从我的收藏中移除</h2><button data-close="deletion" aria-label="关闭删除确认">×</button></div><div class="dialog-body"><p id="deleteSummary"></p><p>删除后无法在本助手撤销。口令不保证能恢复，请核对以下表情。</p><div id="deletePreview" class="thumb-list"></div><p id="deleteProgress" role="status"></p></div><div class="dialog-actions"><button id="deleteCancel">取消</button><div class="right-actions"><button id="deleteStop" hidden>停止后续删除</button><button id="deleteConfirm" class="danger-fill">确认删除</button></div></div></dialog>
  <dialog id="output" aria-labelledby="exportTitle"><div class="dialog-header"><h2 id="exportTitle">开发者导出</h2><button data-close="output" aria-label="关闭导出">×</button></div><div class="dialog-body"><textarea readonly aria-label="导出 JSON"></textarea><p id="message"></p></div><div class="dialog-actions"><button id="outputClose">返回管理</button><div class="right-actions"><button id="download">下载 JSON</button><button id="copy" class="primary">复制 JSON</button></div></div></dialog>`;
  const $ = selector => root.querySelector(selector);
  const activeItems = () => items.filter(item => !item.deleted);
  const selection = () => items.filter(item => item.selected && !item.deleted);
  const matches = item => {
    if (item.deleted) return false;
    const query = $('#search').value.trim().toLowerCase();
    return (!query || item.label.toLowerCase().includes(query)) &&
      ($('#filter').value !== 'selected' || item.selected) &&
      ($('#animation').value === 'all' || item.animation === $('#animation').value);
  };
  const filtered = () => items.filter(matches);
  const badgeText = item => ({ animated: '动图', static: '静态图', unknown: '未检测', failed: '未能识别' })[item.animation];
  const busy = () => deleting || importingBusy;
  const selectionOutside = () => selection().filter(item => !matches(item)).length;
  function updateSummary() {
    const list = activeItems(), classified = list.filter(item => ['animated', 'static'].includes(item.animation)).length;
    $('#summary').textContent = `我的收藏 ${list.length.toLocaleString()} 个` + (classified || list.some(item => item.animation === 'failed')
      ? ` · 动图 ${list.filter(item => item.animation === 'animated').length.toLocaleString()} · 静态 ${list.filter(item => item.animation === 'static').length.toLocaleString()}` +
        (list.some(item => item.animation === 'unknown') ? ` · 未检测 ${list.filter(item => item.animation === 'unknown').length}` : '') +
        (list.some(item => item.animation === 'failed') ? ` · 未能识别 ${list.filter(item => item.animation === 'failed').length}` : '') : '');
  }
  function count() {
    const selected = selection(), outside = selectionOutside(), locked = busy();
    $('#count').textContent = `已选择 ${selected.length} 个`;
    $('#selectionHint').textContent = outside ? `其中 ${outside} 个不在当前筛选中` : selected.length > 100 ? '每次最多分享 100 个，请分批选择。' : selected.length ? '翻页和筛选会保留选择。' : '先选择要分享或删除的表情。';
    $('#shareOpen').disabled = locked || !selected.length || selected.length > 100 || selected.some(item => !item.label.trim());
    $('#shareOpen').title = selected.length > 100 ? '每次最多分享 100 个' : !selected.length ? '先选择表情' : '生成分享口令';
    let accountReady = workspaceAccountState === 'ready';
    if (accountReady) { try { assertWorkspaceAccount(); } catch (_) { accountReady = false; } }
    $('#remove').disabled = locked || scanning || deleteNeedsReview || !selected.length || !accountReady;
    $('#remove').title = deleteNeedsReview ? '请先刷新核对上次删除结果' : !selected.length ? '先选择表情' : '删除所有已选表情，下一步核对清单';
    $('#clear').disabled = locked || !selected.length;
    $('#viewSelected').disabled = locked || (!selected.length && !selectedView && $('#filter').value !== 'selected');
    $('#viewSelected').textContent = selectedView ? '返回筛选' : '查看已选';
    $('#selectPage').disabled = locked || !filtered().length;
    $('#scan').disabled = locked || scanning;
    $('#importOpen').disabled = locked || scanning || !accountReady;
    for (const selector of ['#search', '#filter', '#animation']) $(selector).disabled = locked;
    const task = scanning ? ' · 正在识别' : importingBusy ? ' · 正在添加' : deleting ? ' · 正在删除' : '';
    mini.textContent = `我的收藏 · 已选 ${selected.length} 个${task}`;
    mini.setAttribute('aria-label', '恢复我的收藏，已选择 ' + selected.length + ' 个' + task);
  }
  function renderEmpty() {
    const empty = !filtered().length;
    $('#emptyState').hidden = !empty;
    if (!empty) return;
    const unknown = activeItems().some(item => item.animation === 'unknown');
    const typeRequiresScan = ['animated', 'static'].includes($('#animation').value) && unknown;
    $('#emptyTitle').textContent = scanning ? '正在识别图片类型' : typeRequiresScan ? '先识别图片类型，再筛选' : $('#filter').value === 'selected' ? '当前没有符合条件的已选表情' : '没有找到符合条件的表情';
    $('#emptyMessage').textContent = scanning ? '识别完成后，这里会显示符合筛选条件的表情。' : typeRequiresScan ? '未检测的表情还没有分类。识别只用于区分动图和静态图，浏览和分享不受影响。' : '可以调整搜索或筛选条件。之前在其他页选择的表情仍会保留。';
    $('#emptyScan').hidden = scanning || !typeRequiresScan;
  }
  const focusReturn = new WeakMap();
  function openDialog(dialog) {
    if (root.querySelector('dialog[open]')) return false;
    focusReturn.set(dialog, root.activeElement);
    dialog.showModal(); return true;
  }
  for (const dialog of root.querySelectorAll('dialog')) dialog.addEventListener('close', () => {
    focusReturn.get(dialog)?.focus?.();
    if (dialog.id === 'zoom') $('#zoom img').removeAttribute('src');
  });
  function closeDialog(dialog) { dialog.close(); }
  root.querySelectorAll('[data-close]').forEach(button => button.onclick = () => {
    const id = button.dataset.close;
    if (id === 'importing') return cancelImport();
    if (id === 'deletion' && deleting) { stop = true; $('#deleteProgress').textContent = '正在等待当前结果，随后停止。'; return; }
    closeDialog($('#' + id));
  });
  function render() {
    const list = filtered(); page = Math.max(0, Math.min(page, Math.ceil(list.length / size) - 1));
    $('.grid').replaceChildren();
    for (const item of list.slice(page * size, (page + 1) * size)) {
      const card = document.createElement('article'); card.className = 'card' + (item.selected ? ' chosen' : '');
      const preview = document.createElement('button'); preview.className = 'preview'; preview.title = '放大预览 ' + item.label;
      const image = document.createElement('img'); image.src = item.url; image.alt = item.label; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { image.alt = '预览加载失败'; };
      preview.append(image); preview.onclick = () => {
        $('#zoom img').src = item.url; $('#zoom p').textContent = item.label; openDialog($('#zoom'));
      };
      const title = document.createElement('div'); title.className = 'card-title';
      const nameText = document.createElement('span'); nameText.className = 'card-name'; nameText.textContent = item.label; nameText.title = item.label;
      const name = document.createElement('input'); name.className = 'name'; name.value = item.label; name.maxLength = 80; name.hidden = true; name.setAttribute('aria-label', '分享名称 ' + item.label);
      const edit = document.createElement('button'); edit.className = 'edit-name'; edit.textContent = '✎'; edit.setAttribute('aria-label', '编辑分享名称 ' + item.label); edit.title = '只修改分享名称';
      let originalName = item.label;
      function finishName(cancel = false) {
        if (cancel) item.label = originalName;
        else item.label = name.value.trim() || originalName;
        name.value = item.label; nameText.textContent = item.label; nameText.title = item.label;
        name.hidden = true; nameText.hidden = false; edit.textContent = '✎'; count();
      }
      edit.onclick = () => {
        if (busy()) return;
        if (!name.hidden) { finishName(); return; }
        originalName = item.label; name.hidden = false; nameText.hidden = true; edit.textContent = '保存'; name.focus(); name.select();
      };
      name.oninput = () => { item.label = name.value; count(); };
      name.onkeydown = event => { if (event.key === 'Enter' || event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishName(event.key === 'Escape'); edit.focus(); } };
      title.append(nameText, name, edit);
      const bottom = document.createElement('div'); bottom.className = 'card-bottom';
      const badge = document.createElement('span'); badge.className = 'badge'; badge.dataset.id = item.gifId; badge.dataset.kind = item.animation; badge.textContent = badgeText(item);
      const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.selected; check.disabled = busy(); check.setAttribute('aria-label', '选择此表情');
      check.onchange = () => {
        item.selected = check.checked;
        if ($('#filter').value === 'selected') {
          const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll;
        } else { card.classList.toggle('chosen', item.selected); count(); }
      };
      label.append(check, '选择'); bottom.append(badge, label); card.append(preview, title, bottom); $('.grid').append(card);
    }
    $('#page').textContent = `${page + 1} / ${Math.max(1, Math.ceil(list.length / size))} 页 · ${list.length} 个`;
    $('#jump').max = Math.max(1, Math.ceil(list.length / size)); $('#jump').value = page + 1;
    $('#first').disabled = $('#prev').disabled = page === 0;
    $('#last').disabled = $('#next').disabled = (page + 1) * size >= list.length;
    $('main').scrollTop = 0; updateSummary(); count(); renderEmpty();
  }
  $('#search').oninput = $('#filter').onchange = $('#animation').onchange = () => { page = 0; render(); };
  $('#first').onclick = () => { page = 0; render(); };
  $('#last').onclick = () => { page = Math.max(0, Math.ceil(filtered().length / size) - 1); render(); };
  $('#prev').onclick = () => { page--; render(); }; $('#next').onclick = () => { page++; render(); };
  function jumpToPage() {
    const value = Number($('#jump').value), max = Math.max(1, Math.ceil(filtered().length / size));
    if (!Number.isInteger(value) || value < 1 || value > max) { $('#scanStatus').textContent = `请输入 1–${max} 的整数页码。`; return; }
    page = value - 1; render();
  }
  $('#jumpGo').onclick = jumpToPage;
  $('#jump').onkeydown = event => { if (event.key === 'Enter') jumpToPage(); };
  $('#selectPage').onclick = () => { if (busy()) return; filtered().slice(page * size, (page + 1) * size).forEach(item => item.selected = true); render(); };
  $('#clear').onclick = () => { if (busy()) return; items.forEach(item => item.selected = false); render(); };
  $('#viewSelected').onclick = () => {
    if (busy()) return;
    if (selectedView) {
      $('#search').value = selectedView.search; $('#animation').value = selectedView.animation; $('#filter').value = selectedView.filter; page = selectedView.page; selectedView = null;
    } else {
      selectedView = { search: $('#search').value, animation: $('#animation').value, filter: $('#filter').value, page };
      $('#search').value = ''; $('#animation').value = 'all'; $('#filter').value = 'selected'; page = 0;
    }
    render();
  };
  $('#emptyReset').onclick = () => { $('#search').value = ''; $('#animation').value = $('#filter').value = 'all'; selectedView = null; page = 0; render(); };
  $('#emptyScan').onclick = () => $('#scan').click();
  function revealWorkspace() {
    host.dataset.open = host.dataset.managed = 'true'; host.style.display = ''; mini.hidden = true;
    document.getElementById('seatalk-personal-gif-avatar-panel')?.classList.remove('spga-open');
    if (geometryCustom) { const rect = host.getBoundingClientRect(); clampWindow(rect.left, rect.top); }
    count(); window.dispatchEvent(new CustomEvent('spga:layout-change'));
  }
  host.__open = revealWorkspace;
  host.__close = hideWorkspace;
  function minimizeWorkspace() {
    if (root.querySelector('dialog[open]')) return;
    host.dataset.open = 'false'; host.style.display = 'none'; mini.hidden = false; count(); window.dispatchEvent(new CustomEvent('spga:layout-change')); mini.focus();
  }
  mini.onclick = () => { if (!host.isConnected) { mini.remove(); return; } revealWorkspace(); $('#minimize').focus(); };
  function hideWorkspace(back = false) {
    if (busy()) {
      stop = importStopped = true; $('#scanStatus').textContent = '正在停止后续操作，请等待当前结果后关闭。'; return false;
    }
    scanCancelled = true; activeRequests.forEach(controller => controller.abort());
    for (const dialog of root.querySelectorAll('dialog[open]')) closeDialog(dialog);
    host.dataset.open = host.dataset.managed = 'false'; host.style.display = 'none'; mini.hidden = true;
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    if (back) window.dispatchEvent(new CustomEvent('spga:collections-back'));
    return true;
  }
  $('#minimize').onclick = minimizeWorkspace;
  $('#close').onclick = () => hideWorkspace();
  $('#backAvatar').onclick = () => hideWorkspace(true);
  $('#zoomClose').onclick = () => closeDialog($('#zoom'));
  $('#guideOpen').onclick = () => { if (openDialog($('#guideDialog'))) $('#guideClose').focus(); };
  $('#guideClose').onclick = () => closeDialog($('#guideDialog'));
  $('#outputClose').onclick = () => closeDialog($('#output'));
  $('#export').onclick = () => {
    const selected = selection();
    if (selected.some(item => !item.label.trim())) { $('#scanStatus').textContent = '请先填写已选表情的分享名称。'; return; }
    $('#output textarea').value = JSON.stringify(selected.map(item => ({ label: item.label.trim(), gifId: item.gifId })), null, 2);
    $('#message').textContent = `共 ${selected.length} 个，仅含名称与表情标识。`; openDialog($('#output'));
  };
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText($('#output textarea').value); $('#message').textContent = '已复制'; } catch (_) { $('#output textarea').select(); $('#message').textContent = '请按 ⌘C / Ctrl+C 复制'; } };
  $('#download').onclick = () => { const url = URL.createObjectURL(new Blob([$('#output textarea').value], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'seatalk-selected-stickers.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  /* WORKSPACE_TASKS */
  /* WORKSPACE_GEOMETRY */
  /* SHARE_UI */
  discoverShareServices().then(services => {
    workspaceAccountCheck = createWorkspaceAccountGuard(services, source, () => liveSource().list);
    workspaceAccountState = 'ready'; count();
  }).catch(() => {
    workspaceAccountState = 'failed';
    $('#scanStatus').textContent = '无法核对当前账号，添加和删除已停用。请刷新 SeaTalk 后重新打开。'; count();
  });
  render();
  window.dispatchEvent(new CustomEvent('spga:layout-change'));
  return { sourceCount: source.length, uniqueCount: items.length, existingCount: items.filter(item => item.existing).length };
}
