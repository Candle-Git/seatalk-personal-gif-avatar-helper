// ==UserScript==
// @name         SeaTalk 个人 GIF 头像助手
// @name:en      SeaTalk Personal GIF Avatar Helper
// @namespace    https://seatalkweb.com/
// @version      5.2.0
// @description  SeaTalk 表情助手：备注搜索、分享口令、备份恢复、确认后发送与 GIF 头像。
// @description:en SeaTalk Sticker Helper: searchable notes, sharing codes, backups, confirmed sending and GIF avatars.
// @author       Yixin.Zhong × Codex
// @match        https://seatalkweb.com/*
// @match        https://*.seatalkweb.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      f.haiserve.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /*
   * 使用方式：
   * 1. 在 SeaTalk 网页端先给自己或任意聊天发送一张想用作头像的 GIF 表情。
   * 2. 点击右下角“GIFGIF 头像”。
   * 3. 点击“抓取最近发送的表情”，选择刚发送的那张表情。
   * 4. 等待面板显示“直接更新入口已就绪”，再点击“直接应用 GIF 头像”。
   * 5. 如果 SeaTalk 暂时没有加载完成，脚本会自动等待并允许一键重新检查。
   *
   * 重要说明：
   * - 本脚本仅修改自己的头像或经确认的可编辑群头像。
   * - 自动入口可用时，本脚本不会上传新文件，而是调用 SeaTalk 当前页面自己的 updateUserInfo 服务。
   * - 脚本不会要求用户手动上传普通 PNG/JPG 图片作为中间步骤。
   * - 每次刷新都会重新发现当前 chunk 文件并自检；如果前端结构变化，面板会显示具体失败阶段。
   */

  // 沿用稳定版存储键，升级后继续保留用户的语言、选择和浮动按钮位置。
  const STORAGE_KEY = "seatalk-personal-gif-avatar-helper-v1";
  const PANEL_ID = "seatalk-personal-gif-avatar-panel";
  const TOGGLE_ID = "seatalk-personal-gif-avatar-toggle";
  const STYLE_ID = "seatalk-personal-gif-avatar-style";
  const SUCCESS_MODAL_ID = "seatalk-personal-gif-avatar-success-modal";
  const DIAGNOSTIC_REPORT_ID = "seatalk-personal-gif-avatar-report";
  const UPDATE_MODAL_ID = "seatalk-personal-gif-avatar-update-modal";
  const EASTER_EGG_LAYER_ID = "seatalk-personal-gif-avatar-easter-egg";
  // 所有界面版本号和更新提示都读取同一个常量，避免以后只改到其中一处。
  const SCRIPT_VERSION = "5.2.0";
  const UPDATE_NOTICE_VERSION = SCRIPT_VERSION;

  // 动图验证只读取 SeaTalk 图片域名中的候选文件，不会上传、保存或打印带签名参数的地址。
  // 20 MB 上限和 8 秒超时用于避免异常大文件或失效链接让页面一直等待。
  const MAX_ANIMATION_FILE_BYTES = 20 * 1024 * 1024;
  const ANIMATION_REQUEST_TIMEOUT_MS = 8000;
  const ANIMATION_RESULT_CACHE = new Map();

  // Tampermonkey 脚本运行在隔离环境里，不能直接改网页自己的 webpack 模块。
  // 通过 unsafeWindow 的页面 Function 创建 Hook，再使用 CustomEvent 通信。
  // 不插入内联 script；执行仍须符合页面 CSP（当前允许 unsafe-eval）。
  const HOOK_EVENTS = {
    configEvent: "seatalk-personal-gif-avatar:set-config",
    statusEvent: "seatalk-personal-gif-avatar:hook-status",
  };

  // 当前文件夹 gif头像 目录里的预置 GIF。浏览器脚本不能直接读取本地目录，
  // 所以把文件名里的展示名和 GIF ID 预先写进脚本，作为抓取失败时的兜底选择。
  const LOCAL_GIF_PRESETS = [
    {
      label: "中指537",
      gifId: "7d255324fce9d57231273fbc6ec186a90b070500000a0fd21780963208011057",
    },
    {
      label: "像素悲伤蛙",
      gifId: "38e2095c07ccc5a036f50a56b4ed0c2b0b07050000000c6b0000000002020085",
    },
    {
      label: "全力研读小八",
      gifId: "baa2f40fca89613a479ddc196efaaad40b0705000003f1891780358408011068",
    },
    {
      label: "哽咽狗狗",
      gifId: "3c1c250fa86e5b54383043ad69d3ef3e0b0705000008074e000000000202002d",
    },
    {
      label: "大笑汤姆",
      gifId: "82adaf3c4081c12d888337832d2b1ec60b070500000af66716749504040200bc",
    },
    {
      label: "嬉皮笑脸药水哥",
      gifId: "1320eb6cf7a56857986a5284aa819a900b070500000369661675209604020021",
    },
    {
      label: "害羞猫猫",
      gifId: "5d4fee95e1f3055f206519f7f1a58f910b070500000af1d200000000020200cb",
    },
    {
      label: "旋转537",
      gifId: "8fdbb01ee79801bdf320b22f458389d70b0705000001fa04178035840801100d",
    },
    {
      label: "月薪猫",
      gifId: "6e661d2983e5205a9d914155b72396da0b070500001274a617800128080110a5",
    },
    {
      label: "猥琐小八",
      gifId: "501fe0b896d2670bdd2241ef5e2f31cd0b070500000053dd1780963208011065",
    },
    {
      label: "王八拳537",
      gifId: "32edd09ee593d5b46dfb1b0d39bae96f0b070500000d5b301780358408011078",
    },
    {
      label: "玲娜贝儿Yes",
      gifId: "9fb05cdb73e1c57cd5d9715d9a8d3e7c0b0705000012b96a0000000002010016",
    },
    {
      label: "私密马赛自嘲熊",
      gifId: "49284519c7994204bddae4f0eadbec980b0705000003c0dc1772064008011014",
    },
    {
      label: "美少女jiyi",
      gifId: "b85fdeb54f129ea6ee22258515ed0b820b0705000002a37e1780358408011036",
    },
    {
      label: "让我保护你药水哥",
      gifId: "22362c7fc7f296442ea07a92710df0e80b070500000d7d29167520960402000a",
    },
    {
      label: "跳舞猴",
      gifId: "df8a6df4dea01a63a3365079f741f0c50b070500000eda131677456004020053",
    },
    {
      label: "蹦迪自嘲熊",
      gifId: "bb6a3e1277454df270d7b3671c0145d00b0705000002d0bd17720640080110fc",
    },
    {
      label: "马猴烧酒jiyi",
      gifId: "d1c1fb1d3e551ac5f2068d1dffda0ef40b070500000c7d8f178096320801100f",
    },
  ].map((preset) => ({
    ...preset,
    key: `local-${preset.gifId.slice(0, 12)}`,
    previewUrl: buildPreviewUrl(preset.gifId),
    source: "local",
  }));

  const I18N = {
    zh: {
      title: "SeaTalk 表情助手",
      subtitle: "两种方式，几秒换上动态头像。",
      quickEyebrow: "快速体验",
      quickTitle: "手头没有 GIF？",
      quickDescription: "从示例库随机挑一个并立即换上，先看看效果。",
      randomApply: "随机换一个 GIF 头像",
      randomPreparing: "正在准备随机体验...",
      ownEyebrow: "使用自己的 GIF",
      ownTitle: "换上你喜欢的表情",
      ownDescription: "先在当前聊天窗口发送 GIF，再抓取这里最近出现的表情。",
      ownStepOne: "1  在当前聊天发送一个 GIF 表情",
      ownStepTwo: "2  点击下方按钮抓取最近 3 个 GIF",
      scanCurrentChat: "抓取当前聊天最近的 GIF",
      scanCheckingAnimation: "正在读取候选图片并确认是否真的会动，请稍候...",
      scanSuccessVerified: "发现 {checked} 个符合编号的候选：{animated} 个确认会动，{static} 个读取后只有一帧，{unverified} 个无法读取；已按聊天先后展示最近 {shown} 个，另忽略 {unsupported} 个普通资源。",
      scanEmptyVerified: "没有找到可确认的动态 GIF。发现 {checked} 个符合编号的候选：{static} 个读取后只有一帧，{unverified} 个无法读取；另忽略 {unsupported} 个普通资源。",
      scanSuccess: "已从当前聊天找到 {count} 个 GIF，并选中最新一个。",
      scanEmpty: "当前聊天没有找到 GIF。请先发送一个 GIF，并关闭表情面板后重试。",
      scanSuccessFiltered: "找到 {count} 个可用 GIF 表情，已忽略 {skipped} 个普通 GIF 图片文件。",
      scanEmptyFiltered: "发现 {skipped} 个普通 GIF 图片文件，但头像只支持 SeaTalk 表情。请用表情按钮发送 GIF 后重试。",
      unsupportedGif: "这个资源不是 SeaTalk GIF 表情，不能用于动态头像。",
      waitingForSeaTalk: "正在等待 SeaTalk 加载，请勿重复点击...",
      compatibilityAlert: "SeaTalk 还没准备好。请刷新页面，或点击下方按钮重新检查。",
      retryDirect: "重新检查并应用",
      selectedTitle: "准备换成",
      selectedFromChat: "当前聊天里的 GIF",
      selectedSample: "示例 GIF",
      selectedSaved: "上次选择的 GIF",
      noSelection: "还没有选择 GIF",
      noSelectionHelp: "可以随机体验，或从当前聊天抓取。",
      selectedReady: "已准备好，点击下方按钮即可更换。",
      selectedChecking: "正在检查 SeaTalk 兼容性。",
      selectedApplying: "正在提交头像更新。",
      apply: "换成这个 GIF 头像",
      applyLoading: "正在应用 GIF 头像...",
      applyDisabled: "请先选择一个 GIF",
      candidatesSummary: "当前聊天找到的 GIF",
      candidatesEmpty: "还没有抓取当前聊天。",
      candidateLatest: "刚刚找到",
      candidateEarlier: "更早的结果 {number}",
      choose: "选用",
      examplesSummary: "更多示例 GIF",
      examplesDescription: "没有合适的 GIF 时，也可以从示例库手动挑选。",
      examplePlaceholder: "选择一个示例 GIF",
      exampleLabel: "示例 GIF {number}",
      diagnosticsSummary: "运行状态与调试信息",
      diagnosticsEmpty: "正在等待启动检查。",
      statusReady: "运行正常，可以直接更换头像。",
      statusChecking: "正在检查当前 SeaTalk 版本。",
      statusApplying: "正在更新头像。",
      requestStillPending: "上一请求仍在等待接口返回，请勿重复提交。",
      statusError: "遇到问题，请展开调试信息查看详情。",
      verificationConfirmed: "SeaTalk 已确认更新成功。页面头像显示可能有短暂缓存。",
      verificationObserved: "页面头像已同步更新。",
      successTitle: "GIF 成功！",
      successMessage: "快去给你的同事炫耀吧",
      successSubtitle: "你的动态头像已经成功上线。",
      successClose: "好耶！",
      updateBadge: "NEW",
      updateVersion: "版本 {version}",
      updateTitle: "升级为 SeaTalk 表情助手",
      updateSubtitle: "整理、搜索、分享你的收藏表情，也能设置 GIF 头像。",
      updateHighlightOne: "我的表情：备注、关键词搜索与独立筛选，快速找到想发的表情",
      updateHighlightTwo: "预览单张或勾选多张，核对当前会话后确认发送",
      updateHighlightThree: "分享口令携带名称和关键词；个人备份支持换电脑恢复",
      updateHighlightFour: "手动标注动图／静态图，中英文同步；个人与群 GIF 头像继续保留",
      updateClose: "知道了，去试试！",
      toggleLabel: "语言",
      helperToggle: "SeaTalk 表情助手",
      dragHint: "可拖动到不挡操作的位置",
      credit: "Yixin.Zhong × Codex 制作",
      creditEasterEggHint: "点一下，有小惊喜",
      creditEasterEggMessage: "✨ 被你发现啦！愿每次换头像都有好心情 ✨",
      diagnosticSuccessGeneric: "技术检查通过。",
      hookStartFailed: "页面 Hook 启动失败（{code}）。请确认已授权新版脚本并刷新 SeaTalk；若仍失败，请提供此错误码和 Console 中的 CSP 报错。",
      diagnosticErrorGeneric: "检测到技术问题，请重试或把匿名化截图发给维护者。",
      diagnosticInfoGeneric: "已记录一条运行信息。",
      diagnosticApiConfirmed: "SeaTalk 接口已确认头像更新成功。",
      diagnosticVisualPending: "页面没有返回可识别的新头像地址，但不会影响已成功的更新。",
    },
    en: {
      title: "SeaTalk Sticker Helper",
      subtitle: "Two simple ways to get an animated avatar in seconds.",
      quickEyebrow: "QUICK TRY",
      quickTitle: "No GIF ready?",
      quickDescription: "Pick a random sample and apply it instantly to see the feature in action.",
      randomApply: "Try a random GIF avatar",
      randomPreparing: "Preparing a random GIF...",
      ownEyebrow: "USE YOUR OWN GIF",
      ownTitle: "Choose a GIF you love",
      ownDescription: "Send a GIF in the current chat first, then capture the latest GIFs shown here.",
      ownStepOne: "1  Send a GIF in the current chat",
      ownStepTwo: "2  Capture the 3 most recent GIFs below",
      scanCurrentChat: "Capture GIFs from this chat",
      scanCheckingAnimation: "Reading candidate images and checking whether they really animate...",
      scanSuccessVerified: "Found {checked} candidates with supported IDs: {animated} animated, {static} one-frame, and {unverified} unreadable; showing the latest {shown} in chat order and ignoring {unsupported} regular resources.",
      scanEmptyVerified: "No verified animated GIF was found. Found {checked} candidates with supported IDs: {static} one-frame and {unverified} unreadable; also ignored {unsupported} regular resources.",
      scanSuccess: "Found {count} GIFs in this chat and selected the latest one.",
      scanEmpty: "No GIF was found in this chat. Send one, close the emoji panel, and try again.",
      scanSuccessFiltered: "Found {count} usable GIF stickers and ignored {skipped} regular GIF image files.",
      scanEmptyFiltered: "Found {skipped} regular GIF image files, but only SeaTalk stickers can be used. Send a GIF with the sticker button and try again.",
      unsupportedGif: "This item is not a SeaTalk GIF sticker and cannot be used as an animated avatar.",
      waitingForSeaTalk: "Waiting for SeaTalk to load. No need to click again...",
      compatibilityAlert: "SeaTalk is not ready yet. Refresh the page or try the check again below.",
      retryDirect: "Check again and apply",
      selectedTitle: "READY TO USE",
      selectedFromChat: "GIF from this chat",
      selectedSample: "Sample GIF",
      selectedSaved: "Previously selected GIF",
      noSelection: "No GIF selected yet",
      noSelectionHelp: "Try a random sample or capture one from this chat.",
      selectedReady: "Ready. Use the button below to update your avatar.",
      selectedChecking: "Checking SeaTalk compatibility.",
      selectedApplying: "Submitting the avatar update.",
      apply: "Use this GIF as my avatar",
      applyLoading: "Applying GIF avatar...",
      applyDisabled: "Select a GIF first",
      candidatesSummary: "GIFs found in this chat",
      candidatesEmpty: "This chat has not been scanned yet.",
      candidateLatest: "Latest result",
      candidateEarlier: "Earlier result {number}",
      choose: "Use",
      examplesSummary: "More sample GIFs",
      examplesDescription: "You can also manually choose a sample when you do not have a GIF ready.",
      examplePlaceholder: "Choose a sample GIF",
      exampleLabel: "Sample GIF {number}",
      diagnosticsSummary: "Status and diagnostics",
      diagnosticsEmpty: "Waiting for the startup check.",
      statusReady: "Everything is ready. You can update your avatar now.",
      statusChecking: "Checking this SeaTalk version.",
      statusApplying: "Updating your avatar.",
      requestStillPending: "The previous request is still pending. Please wait before submitting again.",
      statusError: "Something went wrong. Expand diagnostics for details.",
      verificationConfirmed: "SeaTalk confirmed the update. The visible avatar may be briefly cached.",
      verificationObserved: "The avatar is now updated on the page.",
      successTitle: "GIF applied!",
      successMessage: "Go show it off to your teammates",
      successSubtitle: "Your animated avatar is now live.",
      successClose: "Love it!",
      updateBadge: "NEW",
      updateVersion: "Version {version}",
      updateTitle: "Meet SeaTalk Sticker Helper",
      updateSubtitle: "Organize, search and share your favorite stickers, and set GIF avatars.",
      updateHighlightOne: "My stickers: notes, keyword search and separate filters to find the right sticker",
      updateHighlightTwo: "Preview one or select several, check the destination and confirm sending",
      updateHighlightThree: "Share names and keywords with a code; back up personal settings for another computer",
      updateHighlightFour: "Manual image-format labels and shared language settings; personal and group GIF avatars remain available",
      updateClose: "Got it — let me try!",
      toggleLabel: "Language",
      helperToggle: "SeaTalk Sticker Helper",
      dragHint: "Drag this button anywhere convenient",
      credit: "Made by Yixin.Zhong × Codex",
      creditEasterEggHint: "Click for a little surprise",
      creditEasterEggMessage: "✨ You found it! May every new avatar brighten your day ✨",
      diagnosticSuccessGeneric: "Technical check passed.",
      hookStartFailed: "Page hook failed to start ({code}). Approve the updated userscript permissions and reload SeaTalk. If it persists, share this code and the Console CSP error.",
      diagnosticErrorGeneric: "A technical issue was detected. Retry or share an anonymized screenshot with the maintainer.",
      diagnosticInfoGeneric: "A runtime event was recorded.",
      diagnosticApiConfirmed: "SeaTalk confirmed the avatar update.",
      diagnosticVisualPending: "The page did not expose a recognizable new avatar URL, but the confirmed update is unaffected.",
    },
  };

  function getDefaultLocale() {
    return /^zh\b/i.test(String(navigator.language || "")) ? "zh" : "en";
  }

  function t(key, variables = {}) {
    const dictionary = I18N[state.locale] || I18N.zh;
    let value = dictionary[key] ?? I18N.zh[key] ?? key;
    for (const [name, replacement] of Object.entries(variables)) {
      value = value.replaceAll(`{${name}}`, String(replacement));
    }
    return value;
  }

  const groupUI = { mode: "personal", context: null, pending: null, sequence: 0, message: "", dialog: null };
  const state = {
    selected: null,
    recentCandidates: [],
    enabled: false,
    hookStatus: "页面脚本尚未就绪。",
    pendingTimer: null,
    verificationTimer: null,
    directUpdaterReady: false,
    chunkName: "",
    diagnosticEvents: [],
    pageHookReady: false,
    diagnosticStartedAt: Date.now(),
    diagnosticAttempt: 0,
    diagnosticAttemptAt: 0,
    activeOperation: null,
    requestPending: false,
    requestSlow: false,
    manualDiagnosticReport: "",
    diagnosticCopyRequest: 0,
    successModalShownForGifId: "",
    locale: getDefaultLocale(),
    candidatesOpen: false,
    examplesOpen: false,
    diagnosticsOpen: false,
    showDelayedLoading: false,
    loadingTimer: null,
    apiConfirmedGifId: "",
    activeAction: "",
    filteredImageCount: 0,
    staticImageCount: 0,
    unverifiedImageCount: 0,
    checkedCandidateCount: 0,
    animatedCandidateCount: 0,
    scanInProgress: false,
    directUpdaterFailed: false,
    togglePosition: null,
    lastSeenUpdateNoticeVersion: "",
  };

  const DIAGNOSTIC_CODES = {
    GROUP_CONTEXT_MISSING: ["discovery", "未识别到可编辑群：请打开群设置并保持打开", "Open and keep the editable target group settings visible"],
    GROUP_CONTEXT_READY: ["discovery", "已识别可编辑群，请核对界面群名", "Editable group detected; verify the displayed group name"],
    GROUP_APPLY_START: ["submit", "已确认目标，正在提交群头像", "Confirmed group avatar submission started"],
    GROUP_OBSERVED: ["verification", "页面已观察到目标群头像", "Target group avatar observed on page"],
    GROUP_PENDING: ["verification", "群头像结果未确认，保持提交锁定", "Group result unconfirmed; submissions remain locked"],
    GROUP_TARGET_CHANGED: ["submit", "群目标或权限已变化，未提交", "Group target or permission changed; not submitted"],
    HOOK_READY: ["hook", "页面连接已启动", "Page hook started"],
    PAGE_CONTEXT_UNAVAILABLE: ["hook", "无法访问页面上下文，请检查新增权限", "Page context unavailable; check userscript permissions"],
    PAGE_CONTEXT_EXECUTION_BLOCKED: ["hook", "页面执行被阻止，请检查 Console", "Page execution blocked; check Console"],
    HOOK_NO_ACK: ["hook", "未收到页面连接启动确认", "No page hook acknowledgement"],
    HOOK_START_FAILED: ["hook", "页面连接启动失败，请检查脚本权限和 Console", "Page hook failed; check userscript permissions and Console"],
    APPLY_START: ["submit", "开始本次头像更新", "Avatar update started"],
    MODULE_WAIT: ["discovery", "正在等待用户资料模块", "Waiting for profile module"],
    MODULE_MISSING: ["discovery", "未找到用户资料模块", "Profile module not found"],
    MODULE_IMPORT_FAILED: ["discovery", "用户资料模块导入失败", "Profile module import failed"],
    SERVICE_MISSING: ["discovery", "模块中未找到更新服务", "Update service not found in module"],
    SERVICE_READY: ["discovery", "头像更新服务已就绪", "Avatar update service ready"],
    ACCOUNT_MISSING: ["submit", "无法确认当前账号", "Current account could not be identified"],
    REQUEST_STILL_PENDING: ["submit", "接口仍在等待回报，暂不能重复提交；可复制诊断信息", "Request is still pending; another submission is blocked. You can copy diagnostics"],
    REQUEST_BUSY: ["submit", "上一请求尚未完成，本次提交未发送", "Previous request is still pending; this submission was not sent"],
    RESOURCE_REGISTER_START: ["submit", "正在将所选 GIF 登记为头像用途", "Registering the selected GIF for avatar use"],
    RESOURCE_REGISTERED: ["submit", "已取得头像用途资源，正在核对文件内容", "Avatar resource obtained; checking file content"],
    RESOURCE_CONTENT_VERIFIED: ["submit", "头像资源与原 GIF 内容一致", "Avatar resource content matches the original GIF"],
    RESOURCE_REGISTER_ERROR: ["submit", "头像资源登记失败，未提交头像更新", "Avatar registration failed; no avatar update submitted"],
    RESOURCE_INVALID: ["submit", "未取得有效的头像用途资源，未提交更新", "Valid avatar resource unavailable; no update submitted"],
    RESOURCE_CONTENT_ERROR: ["submit", "资源内容核对失败，未提交头像更新", "Resource content check failed; no avatar update submitted"],
    RESOURCE_PROFILE_MISSING: ["submit", "无法核对当前个人资料，未提交头像更新", "Current profile unavailable; no avatar update submitted"],
    RESOURCE_PROFILE_CHANGED: ["submit", "个人资料已变化，已停止本次更新", "Profile changed; this update was stopped"],
    RESOURCE_ACCOUNT_CHANGED: ["submit", "登录账号已变化，已停止本次更新", "Account changed; this update was stopped"],
    RESOURCE_OPERATION_CHANGED: ["submit", "操作已失效，已停止本次更新", "Operation is no longer active; update stopped"],
    RESOURCE_SERVICE_MISSING: ["submit", "未能识别头像资源服务，请刷新后重试", "Avatar resource service unavailable; reload and retry"],
    API_PENDING: ["submit", "正在提交头像更新", "Submitting avatar update"],
    API_SUCCESS: ["submit", "接口已确认更新成功", "API confirmed the update"],
    API_ERROR: ["submit", "接口返回错误，请检查 Console 后重试", "API returned an error; check Console before retrying"],
    VISUAL_SUCCESS: ["verification", "已观察到页面头像变化", "Avatar change observed on page"],
    VISUAL_PENDING: ["verification", "提交成功，页面显示待确认", "Update submitted; visual confirmation pending"],
    RESULT_TIMEOUT: ["verification", "未收到接口成功回报，也未观察到头像变化", "No API success or avatar change observed"],
  };

  function sanitizeDiagnosticText(value) {
    return String(value || "")
      .replace(/https?:\/\/[^\s<>"']+/gi, "[URL]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
      .replace(/\b[a-z0-9]{32,}\b/gi, "[RESOURCE]")
      .replace(/\b\d{5,}\b/g, "[ID]")
      .slice(0, 500);
  }

  function getDiagnosticEnvironment() {
    const safeVersion = value => /^[a-z0-9._-]{1,64}$/i.test(String(value || "")) ? String(value) : "unknown";
    const root = document.documentElement;
    const browser = navigator.userAgent?.match(/(Firefox|Edg|Chrome|Version)\/([0-9.]+)/);
    const manager = typeof GM_info === "object" ? GM_info : {};
    return {
      script: SCRIPT_VERSION,
      seatalk: safeVersion(root?.getAttribute("data-web-semantic-version")),
      release: safeVersion(root?.getAttribute("data-release-hash")),
      browser: browser ? `${browser[1]}/${safeVersion(browser[2])}` : "unknown",
      manager: ["Tampermonkey", "Violentmonkey", "Greasemonkey"].includes(manager.scriptHandler) ? manager.scriptHandler : "unknown",
      managerVersion: safeVersion(manager.version),
    };
  }

  function addDiagnostic(message, level = "info", code = "", errorCode = null) {
    const now = Date.now();
    const entry = {
      time: new Date(now).toLocaleTimeString("en-GB", { hour12: false }),
      level: ["info", "success", "error"].includes(level) ? level : "info",
      message: sanitizeDiagnosticText(message),
      code: Object.hasOwn(DIAGNOSTIC_CODES, code) ? code : "",
      elapsedMs: Math.max(0, now - (state.diagnosticAttemptAt || state.diagnosticStartedAt)),
      attempt: state.diagnosticAttempt,
      errorCode: /^-?\d{1,6}$/.test(String(errorCode ?? "")) ? String(errorCode) : null,
    };
    const last = state.diagnosticEvents[0];
    if (last?.message === entry.message && last?.code === entry.code && last?.attempt === entry.attempt) return;
    state.diagnosticEvents.unshift(entry);
    state.diagnosticEvents = state.diagnosticEvents.slice(0, 60);
  }

  function buildDiagnosticReport() {
    // Export only explicitly allowlisted fields and fixed messages. Never export
    // raw exception text, account IDs, selected GIFs, chat DOM, URLs or storage.
    return JSON.stringify({
      schema: 1,
      environment: getDiagnosticEnvironment(),
      hookReady: state.pageHookReady,
      serviceReady: state.directUpdaterReady,
      attempt: state.diagnosticAttempt,
      events: state.diagnosticEvents.filter(e => Object.hasOwn(DIAGNOSTIC_CODES, e.code)).slice().reverse().map(e => ({
        attempt: e.attempt, elapsedMs: e.elapsedMs, level: e.level,
        stage: DIAGNOSTIC_CODES[e.code][0], code: e.code, errorCode: e.errorCode,
        message: DIAGNOSTIC_CODES[e.code][2],
      })),
    }, null, 2);
  }

  function showManualDiagnosticReport(report) {
    state.manualDiagnosticReport = report;
    let dialog = document.getElementById(DIAGNOSTIC_REPORT_ID);
    if (!dialog) {
      dialog = createElement("dialog", { attributes: { id: DIAGNOSTIC_REPORT_ID, "aria-label": "Sanitized diagnostic report" } });
      dialog.style.cssText = "width:min(640px,85vw);border:1px solid #bbb;border-radius:12px;padding:20px;color:#18243a;background:#fff";
      const help = createElement("p", { textContent: state.locale === "zh"
        ? "剪贴板不可用，请手动复制下方报告。内容已固定，后台状态更新不会改动它。"
        : "Clipboard unavailable. Copy the report below manually. This snapshot stays unchanged during background updates." });
      const output = createElement("textarea", { attributes: { readonly: "", "aria-label": "Sanitized diagnostic report" } });
      output.style.cssText = "width:100%;height:45vh;box-sizing:border-box;font:13px monospace";
      const close = createElement("button", { textContent: state.locale === "zh" ? "关闭" : "Close", attributes: { type: "button" } });
      close.addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => {
        state.manualDiagnosticReport = "";
        dialog.remove();
      });
      dialog.append(help, output, close);
      // Outside PANEL_ID: renderPanel must never detach this node or selection.
      document.body.append(dialog);
    }
    const output = dialog.querySelector("textarea");
    output.value = state.manualDiagnosticReport;
    if (!dialog.open) dialog.showModal();
    output.focus();
    output.select();
  }

  async function copyDiagnosticReport(button) {
    const report = buildDiagnosticReport();
    const request = ++state.diagnosticCopyRequest;
    try {
      await navigator.clipboard.writeText(report);
      if (request !== state.diagnosticCopyRequest) return;
      button.textContent = state.locale === "zh" ? "已复制脱敏诊断" : "Diagnostics copied";
    } catch (_error) {
      if (request !== state.diagnosticCopyRequest) return;
      // The originating button may already have been replaced by renderPanel.
      // Open a stable, independent dialog using the original report snapshot.
      showManualDiagnosticReport(report);
      button.textContent = state.locale === "zh" ? "请手动复制报告" : "Copy the report manually";
    }
  }

  function readSavedState() {
    try {
      const saved = GM_getValue(STORAGE_KEY, {});
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        return;
      }

      // 替换开关是一次性的，不跨刷新保留，避免以后正常换头像时被误改。
      state.enabled = false;

      if (saved.locale === "zh" || saved.locale === "en") {
        state.locale = saved.locale;
      }

      state.lastSeenUpdateNoticeVersion = String(saved.lastSeenUpdateNoticeVersion || "");

      if (saved.selected && isCustomGifStickerId(saved.selected.gifId)) {
        state.selected = {
          label: String(saved.selected.label || "上次选择的 GIF"),
          gifId: saved.selected.gifId,
          previewUrl: saved.selected.previewUrl || buildPreviewUrl(saved.selected.gifId),
          source: saved.selected.source || "saved",
        };
      }

      if (
        saved.togglePosition &&
        Number.isFinite(saved.togglePosition.right) &&
        Number.isFinite(saved.togglePosition.bottom)
      ) {
        state.togglePosition = {
          right: saved.togglePosition.right,
          bottom: saved.togglePosition.bottom,
        };
      }
    } catch (error) {
      console.warn("[SeaTalk Sticker Helper] 读取本地设置失败：", error);
    }
  }

  function saveState() {
    try {
      GM_setValue(STORAGE_KEY, {
        enabled: state.enabled,
        // 只保存不含查询参数的规范预览地址，避免把聊天图片的临时签名写进本地设置。
        selected: state.selected
          ? {
              ...state.selected,
              previewUrl: buildPreviewUrl(state.selected.gifId),
            }
          : null,
        locale: state.locale,
        togglePosition: state.togglePosition,
        lastSeenUpdateNoticeVersion: state.lastSeenUpdateNoticeVersion,
      });
    } catch (error) {
      console.warn("[SeaTalk Sticker Helper] 保存本地设置失败：", error);
    }
  }

  function isValidGifId(value) {
    return /^[a-zA-Z0-9]{32,}$/.test(String(value || ""));
  }

  // SeaTalk 资源 ID 的第 34 位之后包含资源类型。
  // SeaTalk 当前存在两种可用于动态头像的 GIF 表情资源编号。
  // 两类候选都必须继续通过后面的真实文件帧数验证，静态图片不会因此被放行。
  // 普通聊天图片通常是 b0101，仍然必须拒绝，否则头像接口可能返回 SERVER_ERROR。
  function isCustomGifStickerId(value) {
    const gifId = String(value || "");
    const resourceType = gifId.slice(33, 38).toLowerCase();
    return isValidGifId(gifId) && (resourceType === "b0701" || resourceType === "b0705");
  }

  function buildPreviewUrl(gifId) {
    return `https://f.haiserve.com/download/${gifId}_600`;
  }

  /**
   * 安全地读取 4 字节无符号整数。图片格式里的长度字段可能是大端或小端。
   * @param {Uint8Array} bytes 图片字节
   * @param {number} offset 起始位置
   * @param {boolean} littleEndian 是否按小端顺序读取
   * @returns {number} 读取到的整数
   */
  function readUint32(bytes, offset, littleEndian = false) {
    if (offset < 0 || offset + 4 > bytes.length) {
      return -1;
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 4);
    return view.getUint32(0, littleEndian);
  }

  function readAscii(bytes, offset, length) {
    if (offset < 0 || offset + length > bytes.length) {
      return "";
    }
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
  }

  /**
   * 跳过 GIF 中由多个“小数据块”组成的内容。
   * 每段开头的 1 字节表示该段长度，长度为 0 表示结束。
   * @returns {number} 下一段结构的位置；-1 表示文件不完整
   */
  function skipGifSubBlocks(bytes, startOffset) {
    let offset = startOffset;
    while (offset < bytes.length) {
      const blockLength = bytes[offset];
      offset += 1;
      if (blockLength === 0) {
        return offset;
      }
      if (offset + blockLength > bytes.length) {
        return -1;
      }
      offset += blockLength;
    }
    return -1;
  }

  /**
   * 严格解析 GIF 结构并统计真正的图像帧。
   * 不能简单搜索 0x2C，因为压缩数据里也可能碰巧出现同一个字节。
   */
  function countGifFrames(bytes) {
    const signature = readAscii(bytes, 0, 6);
    if (signature !== "GIF87a" && signature !== "GIF89a") {
      return -1;
    }
    if (bytes.length < 13) {
      return -1;
    }

    const logicalScreenPacked = bytes[10];
    let offset = 13;
    if (logicalScreenPacked & 0x80) {
      const globalColorTableLength = 3 * (2 ** ((logicalScreenPacked & 0x07) + 1));
      offset += globalColorTableLength;
    }

    let frameCount = 0;
    while (offset < bytes.length) {
      const marker = bytes[offset];
      offset += 1;

      if (marker === 0x3b) {
        return frameCount;
      }

      if (marker === 0x21) {
        // 扩展块：跳过扩展标签，再跳过后续所有子块。
        if (offset >= bytes.length) {
          return -1;
        }
        offset += 1;
        offset = skipGifSubBlocks(bytes, offset);
        if (offset < 0) {
          return -1;
        }
        continue;
      }

      if (marker === 0x2c) {
        // 图像描述符固定占 9 字节，随后可能有局部颜色表和 LZW 数据。
        if (offset + 9 > bytes.length) {
          return -1;
        }
        const imagePacked = bytes[offset + 8];
        offset += 9;
        if (imagePacked & 0x80) {
          const localColorTableLength = 3 * (2 ** ((imagePacked & 0x07) + 1));
          offset += localColorTableLength;
        }
        if (offset >= bytes.length) {
          return -1;
        }

        // 跳过 LZW 最小码长字节，再跳过压缩图像子块。
        offset += 1;
        offset = skipGifSubBlocks(bytes, offset);
        if (offset < 0) {
          return -1;
        }

        frameCount += 1;
        if (frameCount >= 2) {
          return frameCount;
        }
        continue;
      }

      // 出现 GIF 规范之外的结构时不猜测，按“无法确认”处理。
      return -1;
    }

    return -1;
  }

  function countAnimatedWebpFrames(bytes) {
    if (readAscii(bytes, 0, 4) !== "RIFF" || readAscii(bytes, 8, 4) !== "WEBP") {
      return -1;
    }

    let offset = 12;
    let frameCount = 0;
    while (offset + 8 <= bytes.length) {
      const chunkType = readAscii(bytes, offset, 4);
      const chunkLength = readUint32(bytes, offset + 4, true);
      if (chunkLength < 0) {
        return -1;
      }

      const dataStart = offset + 8;
      const nextOffset = dataStart + chunkLength + (chunkLength % 2);
      if (nextOffset > bytes.length) {
        return -1;
      }

      if (chunkType === "ANMF") {
        frameCount += 1;
        if (frameCount >= 2) {
          return frameCount;
        }
      }
      offset = nextOffset;
    }

    return frameCount;
  }

  function countAnimatedPngFrames(bytes) {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (bytes.length < pngSignature.length || !pngSignature.every((value, index) => bytes[index] === value)) {
      return -1;
    }

    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const chunkLength = readUint32(bytes, offset, false);
      const chunkType = readAscii(bytes, offset + 4, 4);
      if (chunkLength < 0 || offset + 12 + chunkLength > bytes.length) {
        return -1;
      }

      if (chunkType === "acTL") {
        if (chunkLength < 8) {
          return -1;
        }
        return readUint32(bytes, offset + 8, false);
      }
      if (chunkType === "IEND") {
        return 0;
      }
      offset += 12 + chunkLength;
    }

    return -1;
  }

  /**
   * 根据文件真实内容识别格式并数帧，而不是相信网址后缀或服务器文件名。
   * @returns {{ verified: boolean, animated: boolean, format: string, frameCount: number }}
   */
  function detectAnimationFromBytes(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || 0);
    let format = "unknown";
    let frameCount = -1;

    const gifSignature = readAscii(bytes, 0, 6);
    if (gifSignature === "GIF87a" || gifSignature === "GIF89a") {
      format = "gif";
      frameCount = countGifFrames(bytes);
    } else if (readAscii(bytes, 0, 4) === "RIFF" && readAscii(bytes, 8, 4) === "WEBP") {
      format = "webp";
      frameCount = countAnimatedWebpFrames(bytes);
    } else {
      const pngFrameCount = countAnimatedPngFrames(bytes);
      if (pngFrameCount >= 0) {
        format = "png";
        frameCount = pngFrameCount;
      }
    }

    return {
      verified: frameCount >= 0,
      animated: frameCount >= 2,
      format,
      frameCount,
    };
  }

  function getSafeAnimationCheckUrl(candidate) {
    try {
      const url = new URL(String(candidate?.previewUrl || ""), location.href);
      if (url.protocol !== "https:" || url.hostname !== "f.haiserve.com" || !url.pathname.startsWith("/download/")) {
        return "";
      }
      return url.href;
    } catch (_error) {
      return "";
    }
  }

  /**
   * 通过油猴的跨域读取能力取得图片字节。
   * Content-Disposition 即使写着“下载”，这里也只会把数据交给脚本，不会弹出保存窗口。
   */
  function requestAnimationBytes(candidate) {
    return new Promise((resolve, reject) => {
      const url = getSafeAnimationCheckUrl(candidate);
      if (!url || typeof GM_xmlhttpRequest !== "function") {
        reject(new Error("animation-check-unavailable"));
        return;
      }

      let settled = false;
      let request = null;
      const finish = (callback, value) => {
        if (settled) {
          return;
        }
        settled = true;
        callback(value);
      };

      request = GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "arraybuffer",
        // 不使用 anonymous 模式：部分 SeaTalk 图片需要沿用浏览器现有会话，
        // 否则服务器可能返回只有一帧的静态预览，而不是完整 GIF。
        headers: {
          Accept: "image/gif,image/webp,image/apng,image/*,*/*;q=0.8",
        },
        timeout: ANIMATION_REQUEST_TIMEOUT_MS,
        onprogress(event) {
          if (Number(event.loaded) > MAX_ANIMATION_FILE_BYTES) {
            request?.abort();
            finish(reject, new Error("animation-file-too-large"));
          }
        },
        onload(response) {
          const status = Number(response.status || 0);
          const buffer = response.response;
          if (status < 200 || status >= 300 || !(buffer instanceof ArrayBuffer)) {
            finish(reject, new Error("animation-request-failed"));
            return;
          }
          if (buffer.byteLength <= 0 || buffer.byteLength > MAX_ANIMATION_FILE_BYTES) {
            finish(reject, new Error("animation-file-size-invalid"));
            return;
          }
          finish(resolve, buffer);
        },
        ontimeout() {
          finish(reject, new Error("animation-request-timeout"));
        },
        onerror() {
          finish(reject, new Error("animation-request-error"));
        },
        onabort() {
          finish(reject, new Error("animation-request-aborted"));
        },
      });
    });
  }

  async function verifyCandidateAnimation(candidate) {
    const cacheKey = String(candidate?.gifId || "");
    if (ANIMATION_RESULT_CACHE.has(cacheKey)) {
      return ANIMATION_RESULT_CACHE.get(cacheKey);
    }

    try {
      const bytes = await requestAnimationBytes(candidate);
      const result = detectAnimationFromBytes(bytes);
      // 只有成功识别了文件结构才缓存；网络失败或文件不完整时允许下次重试。
      if (result.verified) {
        ANIMATION_RESULT_CACHE.set(cacheKey, result);
      }
      return result;
    } catch (_error) {
      return { verified: false, animated: false, format: "unknown", frameCount: -1 };
    }
  }

  async function keepVerifiedAnimatedCandidates(candidates) {
    const checks = await Promise.all(candidates.map(async (candidate) => ({
      candidate,
      result: await verifyCandidateAnimation(candidate),
    })));

    state.checkedCandidateCount = checks.length;
    state.staticImageCount = checks.filter(({ result }) => result.verified && !result.animated).length;
    state.unverifiedImageCount = checks.filter(({ result }) => !result.verified).length;

    const animatedCandidates = checks
      .filter(({ result }) => result.verified && result.animated)
      .map(({ candidate }) => candidate);
    state.animatedCandidateCount = animatedCandidates.length;
    return animatedCandidates.slice(0, 3);
  }

  function normalizeUrl(value) {
    try {
      return new URL(value, location.href).href;
    } catch (_error) {
      return String(value || "");
    }
  }

  function extractGifId(raw) {
    const value = String(raw || "").trim();
    if (!value) {
      return "";
    }

    const directIdMatch = value.match(/^[a-zA-Z0-9]{32,}$/);
    if (directIdMatch) {
      return directIdMatch[0];
    }

    // 支持：
    // https://f.haiserve.com/download/xxxx_600?...
    // https://f.haiserve.com/download/xxxx?...
    // https://f.haiserve.com/download/xxxx
    const downloadMatch = value.match(/\/download\/([a-zA-Z0-9]{32,})(?:[_?/#.]|$)/i);
    if (downloadMatch) {
      return downloadMatch[1];
    }

    return "";
  }

  function getNodeCandidateUrls(node) {
    const urls = [];

    if (!(node instanceof Element)) {
      return urls;
    }

    const attributes = ["src", "href", "data-src", "data-url", "data-original", "poster"];
    for (const attribute of attributes) {
      const value = node.getAttribute(attribute);
      if (value) {
        urls.push(normalizeUrl(value));
      }
    }

    if (node instanceof HTMLImageElement && node.currentSrc) {
      urls.push(normalizeUrl(node.currentSrc));
    }

    const styleValue = node.getAttribute("style") || "";
    const styleMatches = styleValue.matchAll(/url\(["']?(.+?)["']?\)/gi);
    for (const match of styleMatches) {
      urls.push(normalizeUrl(match[1]));
    }

    return urls;
  }

  function isVisibleCandidateNode(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    if (node.closest(`#${PANEL_ID}, #${TOGGLE_ID}`)) {
      return false;
    }

    const rect = node.getBoundingClientRect();
    if (rect.width < 16 || rect.height < 16) {
      return false;
    }

    // 元素必须真的落在当前视口里。SeaTalk 有些表情会留在 DOM 中，
    // 但已经被滚动或弹层收起，不应该当成“最近发送的表情”。
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) {
      return false;
    }

    const style = window.getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }

    return true;
  }

  function getVisibleRectArea(rect) {
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    return Math.max(0, right - left) * Math.max(0, bottom - top);
  }

  function getAncestorText(node, maxDepth = 10) {
    const parts = [];
    let current = node;

    // SeaTalk 的群聊分支和个人私聊使用不同深度的消息 DOM。
    // 个人私聊中的图片内容包装层更深，只检查 5 层会看不到外层 message-list-item。
    for (let depth = 0; current && depth < maxDepth; depth += 1) {
      if (current instanceof Element) {
        parts.push(current.className || "", current.id || "", current.getAttribute("aria-label") || "");
      }
      current = current.parentElement;
    }

    return parts.join(" ").toLowerCase();
  }

  function isStickerPickerContextText(text) {
    // “reaction”单独出现时，通常只是正常消息下面已有的表态统计（例如“❓ 1”），
    // 不能因此把整条 GIF 消息排除。真正的表态选择界面一般还会带 picker、popover、
    // menu 或 selector 等标记，下面这些更具体的特征仍会继续阻止误抓弹窗内容。
    return /picker|popover|sticker-panel|stickers-panel|sticker-nav|emoji-panel|emoticon-panel|reaction-menu|reaction-selector|favorite-panel|收藏面板/.test(
      String(text || "").toLowerCase()
    );
  }

  function isLikelyStickerPickerNode(node) {
    return isStickerPickerContextText(getAncestorText(node));
  }

  function isChatStickerMessageNode(node) {
    const text = getAncestorText(node);

    // 已确认过的 SeaTalk GIF 表情消息结构。
    const isKnownStickerContent = (
      text.includes("messages-message-list-item-sticker-content") ||
      text.includes("content-component-wrapper sticker.c") ||
      text.includes("navigation-message-list-item sticker_c")
    );
    if (isKnownStickerContent) {
      return true;
    }

    // 部分 b0701 GIF 在群聊分支中使用 sticker-content，
    // 但在个人私聊中会使用 image-content 或更通用的消息内容包装层。
    // 资源类型仍由 isCustomGifStickerId 严格限制为 b0701/b0705，
    // 因此这里只扩大“聊天消息容器”识别，不会放行 b0101 普通图片。
    const isKnownImageContent = (
      text.includes("messages-message-list-item-image-content") ||
      text.includes("content-component-wrapper image.c") ||
      text.includes("navigation-message-list-item image_c")
    );
    if (isKnownImageContent) {
      return true;
    }

    // 为 SeaTalk 后续的小版本类名变化保留一个受限兜底：
    // 必须同时位于消息列表项和媒体内容层，并明确排除侧边栏会话列表。
    const isMessageListItem = text.includes("message-list-item");
    const isMediaContent = /sticker|image-content|gif-content|content-component-wrapper/.test(text);
    const isSidebarItem = /conversation-list|chat-list-item|sidebar/.test(text);
    return isMessageListItem && isMediaContent && !isSidebarItem;
  }

  /**
   * 在 SeaTalk 改变消息类名时，用可见尺寸判断是否像聊天区里的大型 GIF。
   * 这是受限兜底，不会单独决定资源是否可用：外层仍会要求 ID 类型为 b0701/b0705。
   *
   * @param {Element} node 待判断的图片或媒体节点
   * @returns {boolean} 是否像聊天正文中的大型媒体
   */
  function isLikelyLargeChatMediaNode(node) {
    if (!(node instanceof Element)) {
      return false;
    }

    // 不能把助手面板里刚渲染出来的候选预览再次当成聊天消息。
    const helperPanel = document.getElementById(PANEL_ID);
    if (helperPanel?.contains(node)) {
      return false;
    }

    const nearbyText = getAncestorText(node, 6);
    if (/conversation-list|chat-list-item|contact-list|sidebar|avatar|profile-photo/.test(nearbyText)) {
      return false;
    }

    const rect = node.getBoundingClientRect();
    // 聊天 GIF 通常明显大于 40px 左右的头像和列表缩略图。
    // 64px 是保守下限，既能覆盖截图中的 GIF，也能避开绝大多数头像。
    return rect.width >= 64 && rect.height >= 64;
  }

  function getNearbyHaiserveImageCount(node) {
    const rect = node.getBoundingClientRect();
    const centerY = rect.top + rect.height / 2;
    const images = Array.from(document.querySelectorAll("img[src*='haiserve.com/download'], img"));
    let count = 0;

    for (const image of images) {
      if (!(image instanceof Element) || image === node || !isVisibleCandidateNode(image)) {
        continue;
      }

      const urls = getNodeCandidateUrls(image);
      if (!urls.some((url) => url.includes("haiserve.com/download"))) {
        continue;
      }

      const otherRect = image.getBoundingClientRect();
      const otherCenterY = otherRect.top + otherRect.height / 2;
      if (Math.abs(otherCenterY - centerY) < 130) {
        count += 1;
      }
    }

    return count;
  }

  function scoreCandidateNode(node, index) {
    const rect = node.getBoundingClientRect();
    const area = getVisibleRectArea(rect);
    const minSide = Math.min(rect.width, rect.height);
    const maxSide = Math.max(rect.width, rect.height);
    const nearbyCount = getNearbyHaiserveImageCount(node);

    let score = area;

    // 聊天消息里的 GIF 通常比表情栏小图标大很多。这个权重会让截图里的猫图
    // 排在表情面板图标前面。
    if (minSide >= 72 && maxSide >= 72) {
      score += 20000;
    } else if (minSide >= 48 && maxSide >= 48) {
      score += 3500;
    } else {
      score -= 4000;
    }

    // 越靠近当前聊天窗口底部，越可能是刚发送的消息。
    score += rect.bottom * 3;

    // 用户自己发送的消息一般在右侧，给右侧内容一点优先级。
    score += rect.right;

    // 表情选择器/反应栏里通常一排有很多表情，降低优先级。
    if (nearbyCount >= 3) {
      score -= nearbyCount * 3000;
    }

    if (isLikelyStickerPickerNode(node)) {
      score -= 6000;
    }

    // 分数相同时，保留 DOM 更靠后的元素优先级。
    score += index / 1000;

    return score;
  }

  function sortRecentCandidates(candidates) {
    return [...candidates].sort(
      (a, b) => b.bottom - a.bottom || b.index - a.index || b.score - a.score
    );
  }

  function collectRecentGifCandidates() {
    const selector = [
      "img",
      "a[href*='haiserve.com/download']",
      "video",
      "source",
      "[style*='haiserve.com/download']",
    ].join(",");

    const nodes = Array.from(document.querySelectorAll(selector));
    const candidatesById = new Map();
    const filteredImageIds = new Set();

    nodes.forEach((node, index) => {
      if (!isVisibleCandidateNode(node)) {
        return;
      }

      const urls = getNodeCandidateUrls(node);
      for (const url of urls) {
        if (!url.includes("haiserve.com/download")) {
          continue;
        }

        const gifId = extractGifId(url);
        if (!gifId) {
          continue;
        }

        // 只接受聊天消息中的“自定义 GIF 表情”。普通 GIF 图片也使用 haiserve 地址，
        // 但资源类型和消息容器不同，误用它会让 ContactUpdateUserInfo 返回 SERVER_ERROR。
        const isSupportedGif = isCustomGifStickerId(gifId);
        const isChatMedia = isChatStickerMessageNode(node) || isLikelyLargeChatMediaNode(node);
        if (!isSupportedGif || !isChatMedia || isLikelyStickerPickerNode(node)) {
          if (!isSupportedGif && getAncestorText(node).includes("message-list-item")) {
            filteredImageIds.add(gifId);
          }
          continue;
        }

        const rect = node.getBoundingClientRect();
        const score = scoreCandidateNode(node, index);
        const nextCandidate = {
          key: `recent-${gifId}`,
          source: "recent",
          label: `当前页面表情 ${candidatesById.size + 1}`,
          gifId,
          previewUrl: url,
          index,
          bottom: rect.bottom,
          right: rect.right,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          score,
        };

        const existing = candidatesById.get(gifId);
        // 同一张 GIF 在页面中可能出现多次。保留屏幕位置更靠下、DOM 更靠后的那次，
        // 因为它更接近当前聊天中最近发送的记录；图片尺寸只用于排除头像，不再决定新旧。
        const isMoreRecentOccurrence = !existing || (
          nextCandidate.bottom > existing.bottom ||
          (Math.abs(nextCandidate.bottom - existing.bottom) < 1 && nextCandidate.index > existing.index)
        );
        if (isMoreRecentOccurrence) {
          candidatesById.set(gifId, nextCandidate);
        }
      }
    });

    state.filteredImageCount = filteredImageIds.size;

    // “最近”必须由聊天位置和 DOM 先后决定，不能让尺寸更大的旧图片挤掉新图片。
    // 最多验证前 8 个，既保留足够的最近候选，也避免一次读取太多图片。
    return sortRecentCandidates(Array.from(candidatesById.values())).slice(0, 8);
  }

  function selectCandidate(candidate) {
    if (!candidate || !isCustomGifStickerId(candidate.gifId)) {
      setStatus(t("unsupportedGif"));
      addDiagnostic(t("unsupportedGif"), "error");
      state.diagnosticsOpen = true;
      renderPanel();
      return;
    }

    state.selected = {
      source: candidate.source,
      label: candidate.label,
      gifId: candidate.gifId,
      previewUrl: candidate.previewUrl || buildPreviewUrl(candidate.gifId),
    };

    saveState();
    renderPanel();
    sendHookConfig();
  }

  function setStatus(text) {
    const panel = document.getElementById(PANEL_ID);
    const status = panel?.querySelector("[data-role='status']");
    if (status) {
      status.textContent = text;
    }
  }

  function getDefaultTogglePosition() {
    return window.innerWidth <= 520
      ? { right: 12, bottom: 82 }
      : { right: 18, bottom: 88 };
  }

  function clampTogglePosition(position) {
    const toggle = document.getElementById(TOGGLE_ID);
    const width = toggle?.offsetWidth || 128;
    const height = toggle?.offsetHeight || 42;
    const margin = 10;
    return {
      right: Math.min(
        Math.max(margin, Number(position?.right) || margin),
        Math.max(margin, window.innerWidth - width - margin)
      ),
      bottom: Math.min(
        Math.max(margin, Number(position?.bottom) || margin),
        Math.max(margin, window.innerHeight - height - margin)
      ),
    };
  }

  let panelPosition = null;
  function panelViewport() {
    const viewport = window.visualViewport;
    return { width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight,
      left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0 };
  }
  function bindPanelDrag(header, panel) {
    let drag = null;
    header.title = groupText("拖动标题栏移动助手", "Drag the header to move the helper");
    header.addEventListener("pointerdown", event => {
      if (event.button !== 0 || event.target.closest("button, a, input, select")) return;
      const rect = panel.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      header.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    header.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      panelPosition = { left: drag.left + event.clientX - drag.x, top: drag.top + event.clientY - drag.y };
      positionPanelNearToggle();
    });
    const end = () => { drag = null; };
    header.addEventListener("pointerup", end);
    header.addEventListener("pointercancel", end);
    header.addEventListener("lostpointercapture", end);
  }
  function positionPanelNearToggle() {
    const toggle = document.getElementById(TOGGLE_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!toggle || !panel || !panel.classList.contains("spga-open")) {
      return;
    }

    const margin = 10;
    const gap = 10;
    const toggleRect = toggle.getBoundingClientRect();
    const viewport = panelViewport();
    const panelWidth = Math.max(1, Math.min(390, viewport.width - margin * 2));
    const availableHeight = Math.max(1, viewport.height - margin * 2);

    panel.style.width = `${panelWidth}px`;
    panel.style.maxHeight = `${availableHeight}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";

    const panelHeight = Math.min(panel.scrollHeight || 720, availableHeight);
    const left = Math.min(
      Math.max(margin, toggleRect.right - panelWidth),
      window.innerWidth - panelWidth - margin
    );
    const spaceAbove = toggleRect.top - margin - gap;
    const preferredTop = spaceAbove >= Math.min(panelHeight, 320)
      ? toggleRect.top - panelHeight - gap
      : toggleRect.bottom + gap;
    const top = Math.min(
      Math.max(margin, preferredTop),
      Math.max(margin, window.innerHeight - panelHeight - margin)
    );

    panel.style.left = `${Math.max(viewport.left + margin, Math.min(panelPosition?.left ?? left, viewport.left + viewport.width - panelWidth - margin))}px`;
    panel.style.top = `${Math.max(viewport.top + margin, Math.min(panelPosition?.top ?? top, viewport.top + viewport.height - panelHeight - margin))}px`;
  }

  function applyFloatingPosition({ persist = false } = {}) {
    const toggle = document.getElementById(TOGGLE_ID);
    if (!toggle) {
      return;
    }

    const position = clampTogglePosition(state.togglePosition || getDefaultTogglePosition());
    state.togglePosition = position;
    toggle.style.left = "auto";
    toggle.style.top = "auto";
    toggle.style.right = `${position.right}px`;
    toggle.style.bottom = `${position.bottom}px`;
    positionPanelNearToggle();

    if (persist) {
      saveState();
    }
  }

  function bindToggleDrag(toggle) {
    let dragState = null;
    let suppressClick = false;

    toggle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }
      const rect = toggle.getBoundingClientRect();
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        moved: false,
      };
      toggle.classList.add("spga-dragging");
      toggle.setPointerCapture?.(event.pointerId);
    });

    toggle.addEventListener("pointermove", (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const deltaX = event.clientX - dragState.startX;
      const deltaY = event.clientY - dragState.startY;
      if (!dragState.moved && Math.hypot(deltaX, deltaY) < 5) {
        return;
      }

      dragState.moved = true;
      suppressClick = true;
      const margin = 10;
      const left = Math.min(
        Math.max(margin, dragState.left + deltaX),
        window.innerWidth - toggle.offsetWidth - margin
      );
      const top = Math.min(
        Math.max(margin, dragState.top + deltaY),
        window.innerHeight - toggle.offsetHeight - margin
      );
      toggle.style.right = "auto";
      toggle.style.bottom = "auto";
      toggle.style.left = `${left}px`;
      toggle.style.top = `${top}px`;
      positionPanelNearToggle();
      event.preventDefault();
    });

    const finishDrag = (event) => {
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }
      const moved = dragState.moved;
      dragState = null;
      toggle.releasePointerCapture?.(event.pointerId);
      toggle.classList.remove("spga-dragging");

      if (moved) {
        const rect = toggle.getBoundingClientRect();
        state.togglePosition = clampTogglePosition({
          right: window.innerWidth - rect.right,
          bottom: window.innerHeight - rect.bottom,
        });
        applyFloatingPosition({ persist: true });
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
      }
    };

    toggle.addEventListener("pointerup", finishDrag);
    toggle.addEventListener("pointercancel", finishDrag);
    toggle.addEventListener("click", (event) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const panel = document.getElementById(PANEL_ID);
      panel?.classList.toggle("spga-open");
      positionPanelNearToggle();
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${TOGGLE_ID} {
        position: fixed;
        right: 18px;
        bottom: 88px;
        z-index: 2147483646;
        height: 42px;
        padding: 0 14px;
        border: 0;
        border-radius: 21px;
        background: #0b5cab;
        color: #fff;
        font-size: 14px;
        font-weight: 700;
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);
        cursor: pointer;
        touch-action: none;
        user-select: none;
      }

      #${TOGGLE_ID}:active,
      #${TOGGLE_ID}.spga-dragging {
        cursor: grabbing;
      }

      #${PANEL_ID} {
        position: fixed;
        right: 18px;
        bottom: 140px;
        z-index: 2147483646;
        width: min(390px, calc(100vw - 36px));
        max-height: min(720px, calc(100vh - 96px));
        overflow: auto;
        box-sizing: border-box;
        display: none;
        padding: 16px;
        border: 1px solid rgba(148, 163, 184, 0.45);
        border-radius: 8px;
        background: #fff;
        color: #172033;
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.25);
        font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
      }

      #${PANEL_ID}.spga-open {
        display: block;
      }

      #${PANEL_ID} * {
        box-sizing: border-box;
      }

      #${PANEL_ID} .spga-title {
        margin: 0 0 4px;
        font-size: 16px;
        line-height: 22px;
        font-weight: 800;
      }

      #${PANEL_ID} .spga-subtitle {
        margin: 0 0 12px;
        color: #667085;
        font-size: 12px;
        line-height: 18px;
      }

      #${PANEL_ID} .spga-actions {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
        margin: 12px 0;
      }

      #${PANEL_ID} .spga-button {
        min-height: 36px;
        border: 1px solid #d0d5dd;
        border-radius: 6px;
        background: #fff;
        color: #344054;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
      }

      #${PANEL_ID} .spga-button-primary {
        border-color: #0b5cab;
        background: #0b5cab;
        color: #fff;
      }

      #${PANEL_ID} .spga-button-danger {
        border-color: #d92d20;
        color: #b42318;
      }

      #${PANEL_ID} .spga-button:hover {
        filter: brightness(0.96);
      }

      #${PANEL_ID} .spga-section-title {
        margin: 14px 0 8px;
        color: #344054;
        font-size: 13px;
        font-weight: 800;
      }

      #${PANEL_ID} .spga-selected {
        display: grid;
        grid-template-columns: 62px 1fr;
        gap: 10px;
        align-items: center;
        min-height: 78px;
        padding: 10px;
        border: 1px solid #d0d5dd;
        border-radius: 8px;
        background: #f8fafc;
      }

      #${PANEL_ID} .spga-selected img,
      #${PANEL_ID} .spga-card img {
        width: 56px;
        height: 56px;
        border-radius: 6px;
        object-fit: cover;
        background: #e4e7ec;
      }

      #${PANEL_ID} .spga-selected-name {
        font-size: 13px;
        line-height: 18px;
        font-weight: 800;
      }

      #${PANEL_ID} .spga-id {
        margin-top: 3px;
        color: #667085;
        font-size: 11px;
        line-height: 16px;
        word-break: break-all;
      }

      #${PANEL_ID} .spga-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 8px;
      }

      #${PANEL_ID} .spga-card {
        display: grid;
        grid-template-columns: 62px 1fr auto;
        gap: 10px;
        align-items: center;
        padding: 8px;
        border: 1px solid #eaecf0;
        border-radius: 8px;
        background: #fff;
      }

      #${PANEL_ID} .spga-card-title {
        font-size: 13px;
        line-height: 18px;
        font-weight: 750;
      }

      #${PANEL_ID} .spga-select {
        width: 100%;
        min-height: 36px;
        border: 1px solid #d0d5dd;
        border-radius: 6px;
        padding: 7px 9px;
        color: #172033;
        font-size: 13px;
      }

      #${PANEL_ID} .spga-status {
        margin-top: 12px;
        padding: 9px 10px;
        border-radius: 6px;
        background: #f2f4f7;
        color: #475467;
        font-size: 12px;
        line-height: 18px;
      }

      #${PANEL_ID} .spga-note {
        margin-top: 8px;
        color: #667085;
        font-size: 12px;
        line-height: 18px;
      }

      #${PANEL_ID} .spga-compatibility-alert {
        margin: 0;
        padding: 12px 14px;
        border: 1px solid #fdba74;
        border-radius: 8px;
        background: #fff7ed;
        color: #9a3412;
        font-size: 13px;
        font-weight: 700;
        line-height: 1.55;
      }

      #${PANEL_ID} .spga-diagnostics {
        display: grid;
        gap: 5px;
        padding: 9px 10px;
        border: 1px solid #eaecf0;
        border-radius: 6px;
        background: #fcfcfd;
        color: #475467;
        font-size: 11px;
        line-height: 16px;
      }

      #${PANEL_ID} .spga-diagnostic-error {
        color: #b42318;
      }

      #${PANEL_ID} .spga-diagnostic-success {
        color: #067647;
      }

      /* 3.0 面板：重要操作留在首屏，低频信息折叠收纳。 */
      #${PANEL_ID} {
        width: min(420px, calc(100vw - 28px));
        max-height: min(800px, calc(100vh - 92px));
        padding: 0;
        overflow: hidden;
        border-radius: 14px;
        background: #f8fafc;
      }

      #${PANEL_ID}.spga-open {
        display: flex;
        flex-direction: column;
      }

      #${PANEL_ID} .spga-header {
        display: flex;
        flex: 0 0 auto;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        padding: 17px 18px 14px;
        border-bottom: 1px solid #e4e7ec;
        background: #fff;
      }

      #${PANEL_ID} .spga-header { cursor: grab; touch-action: none; user-select: none; }
      #${PANEL_ID} .spga-header:active { cursor: grabbing; }
      #${PANEL_ID} .spga-heading {
        min-width: 0;
      }

      #${PANEL_ID} .spga-title {
        margin: 0 0 3px;
        font-size: 17px;
        line-height: 24px;
      }

      #${PANEL_ID} .spga-subtitle {
        margin: 0;
        max-width: 255px;
        font-size: 11px;
        line-height: 16px;
      }

      #${PANEL_ID} .spga-language {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 2px;
        padding: 3px;
        border: 1px solid #d0d5dd;
        border-radius: 9px;
        background: #f2f4f7;
      }

      #${PANEL_ID} .spga-language-button {
        min-height: 27px;
        padding: 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #667085;
        font-size: 11px;
      }

      #${PANEL_ID} .spga-language-active {
        background: #fff;
        color: #0b5cab;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
      }

      #${PANEL_ID} .spga-body {
        display: grid;
        flex: 1 1 auto;
        gap: 10px;
        min-height: 0;
        padding: 12px 14px 16px;
        overflow-y: auto;
        overflow-x: hidden;
        grid-auto-rows: max-content;
        scrollbar-gutter: stable;
        overscroll-behavior: contain;
      }

      body:has(#${PANEL_ID}.spga-open) #${TOGGLE_ID} { visibility: hidden; }
      #${PANEL_ID} .spga-header { background:#edf2f7;gap:6px;padding:12px;cursor:grab; }
      #${PANEL_ID} .spga-header:active { cursor:grabbing; }
      #${PANEL_ID} .spga-title { font-size:15px;white-space:nowrap; }
      #${PANEL_ID} .spga-subtitle { display:none; }
      #${PANEL_ID} .spga-window-close { background:#c62828;color:#fff;border-color:#c62828; }
      #${PANEL_ID} .spga-window-close:hover { background:#a91e1e; }
      #${PANEL_ID} .spga-window-minimize { font-size:18px; }
      #${PANEL_ID} .spga-target-tabs { margin:12px 14px 0; }

      #${PANEL_ID} .spga-target-summary { margin: 12px 0 0; padding: 10px 12px; border-radius: 8px; background: #f2f6fc; color: #42526b; font-size: 13px; line-height: 1.5; overflow-wrap: anywhere; }
      #${PANEL_ID} .spga-picker { padding: 4px 2px; }
      #${PANEL_ID} .spga-picker-actions { display: flex; gap: 8px; margin: 12px 0 8px; }
      #${PANEL_ID} .spga-picker-actions button { flex: 1; width: 0; }
      #${PANEL_ID} .spga-target-tabs { display: flex; gap: 4px; padding: 4px; background: #edf2f7; border-radius: 12px; }
      #${PANEL_ID} .spga-target-tabs .spga-target-tab { flex: 1; width: 0; margin: 0; border: 0; background: transparent; color: #59677b; border-radius: 9px; }
      #${PANEL_ID} .spga-target-tabs .spga-target-tab[aria-selected="true"] { background: #fff; color: #0866c6; box-shadow: 0 1px 4px #152b4620; }
      #${PANEL_ID} .spga-path-card {
        padding: 13px;
        border: 1px solid #e4e7ec;
        border-radius: 12px;
        background: #fff;
      }

      #${PANEL_ID} .spga-path-card-quick {
        border-color: #b9d8f4;
        background: linear-gradient(135deg, #edf7ff 0%, #f8fbff 100%);
      }

      #${PANEL_ID} .spga-eyebrow,
      #${PANEL_ID} .spga-selected-eyebrow {
        color: #0b5cab;
        font-size: 10px;
        line-height: 14px;
        font-weight: 850;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }

      #${PANEL_ID} .spga-path-title {
        margin: 2px 0 3px;
        color: #172033;
        font-size: 15px;
        line-height: 21px;
        font-weight: 800;
      }

      #${PANEL_ID} .spga-path-description {
        margin: 0 0 10px;
        color: #667085;
        font-size: 11px;
        line-height: 17px;
      }

      #${PANEL_ID} .spga-steps {
        display: grid;
        gap: 5px;
        margin: -1px 0 10px;
        color: #475467;
        font-size: 11px;
        line-height: 16px;
      }

      #${PANEL_ID} .spga-button {
        min-height: 40px;
        padding: 0 12px;
        border-radius: 9px;
      }

      #${PANEL_ID} .spga-path-card .spga-button {
        width: 100%;
      }

      #${PANEL_ID} .spga-button-soft {
        border-color: #a9cfee;
        background: #fff;
        color: #0b5cab;
      }

      #${PANEL_ID} .spga-button:disabled {
        cursor: not-allowed;
        filter: none;
        opacity: 0.52;
      }

      #${PANEL_ID} .spga-selected {
        grid-template-columns: 58px 1fr;
        gap: 11px;
        min-height: 80px;
        padding: 10px 12px;
        border-color: #cbd5e1;
        border-radius: 12px;
        background: #fff;
      }

      #${PANEL_ID} .spga-selected img,
      #${PANEL_ID} .spga-empty-preview {
        width: 52px;
        height: 52px;
        border-radius: 9px;
      }

      #${PANEL_ID} .spga-empty-preview {
        display: grid;
        place-items: center;
        border: 1px dashed #98a2b3;
        background: #f2f4f7;
        color: #98a2b3;
        font-size: 12px;
        font-weight: 800;
      }

      #${PANEL_ID} .spga-selected-copy {
        min-width: 0;
      }

      #${PANEL_ID} .spga-selected-name {
        margin-top: 2px;
        overflow: hidden;
        color: #172033;
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      #${PANEL_ID} .spga-selected-status {
        margin-top: 3px;
        color: #667085;
        font-size: 10px;
        line-height: 15px;
      }

      #${PANEL_ID} .spga-disclosure {
        border: 1px solid #e4e7ec;
        border-radius: 10px;
        background: #fff;
      }

      #${PANEL_ID} .spga-disclosure > summary {
        position: relative;
        min-height: 42px;
        padding: 12px 38px 10px 12px;
        color: #344054;
        font-size: 12px;
        line-height: 18px;
        font-weight: 750;
        cursor: pointer;
        list-style: none;
      }

      #${PANEL_ID} .spga-disclosure > summary::-webkit-details-marker {
        display: none;
      }

      #${PANEL_ID} .spga-disclosure > summary::after {
        position: absolute;
        top: 9px;
        right: 12px;
        content: "+";
        color: #667085;
        font-size: 19px;
        line-height: 22px;
        font-weight: 500;
      }

      #${PANEL_ID} .spga-disclosure[open] > summary::after {
        content: "−";
      }

      #${PANEL_ID} .spga-disclosure[open] > summary {
        border-bottom: 1px solid #eaecf0;
      }

      #${PANEL_ID} .spga-disclosure > :not(summary) {
        margin: 0;
        padding: 10px 12px 12px;
      }

      #${PANEL_ID} .spga-grid {
        gap: 7px;
      }

      #${PANEL_ID} .spga-card {
        grid-template-columns: 46px 1fr auto;
        gap: 9px;
        padding: 7px;
      }

      #${PANEL_ID} .spga-card img {
        width: 42px;
        height: 42px;
      }

      #${PANEL_ID} .spga-button-compact {
        min-height: 32px;
        padding: 0 10px;
        font-size: 11px;
      }

      #${PANEL_ID} .spga-preset-wrapper .spga-note {
        padding: 0;
      }

      #${PANEL_ID} .spga-select {
        min-height: 40px;
        margin-top: 8px;
        border-radius: 8px;
      }

      #${PANEL_ID} .spga-diagnostics {
        max-height: 190px;
        overflow: auto;
        border: 0;
        background: #fcfcfd;
      }

      #${PANEL_ID} .spga-github-link {
        display: inline-flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; flex: 0 0 32px; margin-left: auto;
        color: #667085; border-radius: 6px; text-decoration: none;
      }
      #${PANEL_ID} .spga-github-link:hover,
      #${PANEL_ID} .spga-github-link:focus-visible { color: #0b5cab; background: #eaf2fc; }
      #${PANEL_ID} .spga-github-link:focus-visible { outline: 2px solid #0b5cab; outline-offset: 2px; }
      #${PANEL_ID} .spga-credit-row {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 21px;
        padding-top: 5px;
      }

      #${PANEL_ID} .spga-credit {
        display: inline-flex;
        width: auto;
        padding: 1px 2px;
        border: 0;
        background: transparent;
        color: #98a2b3;
        font-family: inherit;
        font-size: 10px;
        line-height: 15px;
        text-align: center;
        cursor: pointer;
        transition: color 160ms ease, transform 160ms ease;
      }

      #${PANEL_ID} .spga-credit:hover,
      #${PANEL_ID} .spga-credit:focus-visible {
        color: #0b5cab;
      }

      #${PANEL_ID} .spga-credit:focus-visible {
        border-radius: 6px;
        outline: 2px solid rgba(11, 92, 171, 0.35);
        outline-offset: 2px;
      }

      #${PANEL_ID} .spga-credit.spga-credit-celebrating {
        color: #0b5cab;
        animation: spga-credit-bounce 720ms cubic-bezier(0.2, 0.9, 0.2, 1.2) both;
      }

      #${PANEL_ID} .spga-version-badge {
        display: inline-flex;
        align-items: center;
        min-height: 17px;
        padding: 0 6px;
        border: 1px solid #e4e7ec;
        border-radius: 999px;
        background: #f9fafb;
        color: #667085;
        font-size: 9px;
        font-weight: 700;
        line-height: 15px;
        letter-spacing: 0.02em;
        user-select: text;
      }

      #${EASTER_EGG_LAYER_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        overflow: hidden;
        pointer-events: none;
      }

      #${EASTER_EGG_LAYER_ID} .spga-easter-message {
        position: fixed;
        max-width: min(360px, calc(100vw - 32px));
        padding: 10px 14px;
        border: 1px solid rgba(255, 255, 255, 0.7);
        border-radius: 999px;
        background: linear-gradient(135deg, #0b5cab, #7c3aed 55%, #ec4899);
        box-shadow: 0 14px 38px rgba(49, 46, 129, 0.32);
        color: #fff;
        font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
        font-size: 12px;
        line-height: 18px;
        font-weight: 800;
        text-align: center;
        white-space: normal;
        animation: spga-easter-message 1500ms ease-out both;
      }

      #${EASTER_EGG_LAYER_ID} .spga-easter-particle {
        position: fixed;
        width: var(--spga-size);
        height: 5px;
        border-radius: 999px;
        background: var(--spga-color);
        box-shadow: 0 0 10px color-mix(in srgb, var(--spga-color) 65%, transparent);
        animation: spga-easter-particle 1300ms cubic-bezier(0.15, 0.7, 0.2, 1) both;
      }

      #${EASTER_EGG_LAYER_ID} .spga-easter-particle.spga-easter-star {
        width: auto;
        height: auto;
        background: transparent;
        box-shadow: none;
        color: var(--spga-color);
        font-size: calc(var(--spga-size) * 1.6);
        line-height: 1;
        text-shadow: 0 0 12px currentColor;
      }

      @keyframes spga-credit-bounce {
        0%, 100% { transform: translateY(0) scale(1); }
        35% { transform: translateY(-4px) scale(1.06); }
        65% { transform: translateY(1px) scale(0.98); }
      }

      @keyframes spga-easter-message {
        0% { opacity: 0; transform: translate(-50%, -75%) scale(0.72); }
        16% { opacity: 1; transform: translate(-50%, -115%) scale(1.04); }
        72% { opacity: 1; transform: translate(-50%, -120%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -145%) scale(0.94); }
      }

      @keyframes spga-easter-particle {
        0% {
          opacity: 0;
          transform: translate(-50%, -50%) rotate(0deg) scale(0.35);
        }
        12% { opacity: 1; }
        100% {
          opacity: 0;
          transform:
            translate(
              calc(-50% + var(--spga-dx)),
              calc(-50% + var(--spga-dy))
            )
            rotate(var(--spga-rotate))
            scale(1);
        }
      }

      #${PANEL_ID} .spga-sticky-footer {
        flex: 0 0 auto;
        padding: 10px 14px 14px;
        border-top: 1px solid #e4e7ec;
        background: #fff;
        box-shadow: 0 -8px 18px rgba(15, 23, 42, 0.05);
      }

      #${PANEL_ID} .spga-footer-status {
        min-height: 15px;
        margin: 0 2px 7px;
        color: #667085;
        font-size: 10px;
        line-height: 15px;
      }

      #${PANEL_ID} .spga-apply-button {
        width: 100%;
        min-height: 44px;
        font-size: 14px;
      }

      @media (max-width: 520px) {
        #${TOGGLE_ID} {
          right: 12px;
          bottom: 82px;
        }

        #${PANEL_ID} {
          right: 10px;
          bottom: 134px;
          width: calc(100vw - 20px);
          max-height: calc(100vh - 76px);
        }

        #${PANEL_ID} .spga-header {
          padding: 14px;
        }

        #${PANEL_ID} .spga-subtitle {
          max-width: 210px;
        }
      }

      #${SUCCESS_MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(15, 23, 42, 0.62);
        backdrop-filter: blur(5px);
        animation: spga-success-backdrop-in 180ms ease-out both;
      }

      #${SUCCESS_MODAL_ID} .spga-success-card {
        position: relative;
        width: min(440px, calc(100vw - 40px));
        overflow: hidden;
        padding: 34px 30px 28px;
        border: 1px solid rgba(16, 185, 129, 0.28);
        border-radius: 18px;
        background:
          radial-gradient(circle at 10% 0%, rgba(52, 211, 153, 0.2), transparent 38%),
          linear-gradient(145deg, #ffffff 0%, #f0fdf9 100%);
        box-shadow: 0 28px 80px rgba(2, 44, 34, 0.38);
        color: #12372c;
        text-align: center;
        font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
        animation: spga-success-card-in 420ms cubic-bezier(0.2, 0.9, 0.2, 1.15) both;
      }

      #${SUCCESS_MODAL_ID} .spga-success-badge {
        display: grid;
        place-items: center;
        width: 82px;
        height: 82px;
        margin: 0 auto 18px;
        border: 5px solid #a7f3d0;
        border-radius: 50%;
        background: #047857;
        color: #fff;
        font-size: 22px;
        font-weight: 900;
        letter-spacing: 1px;
        box-shadow: 0 12px 30px rgba(4, 120, 87, 0.28);
      }

      #${SUCCESS_MODAL_ID} .spga-success-title {
        margin: 0;
        color: #064e3b;
        font-size: 30px;
        line-height: 1.2;
        font-weight: 900;
      }

      #${SUCCESS_MODAL_ID} .spga-success-message {
        margin: 12px 0 0;
        color: #246b58;
        font-size: 17px;
        line-height: 1.6;
        font-weight: 700;
      }

      #${SUCCESS_MODAL_ID} .spga-success-subtitle {
        margin: 5px 0 22px;
        color: #5b7f73;
        font-size: 13px;
        line-height: 1.5;
      }

      #${SUCCESS_MODAL_ID} .spga-success-close {
        width: 100%;
        min-height: 46px;
        border: 0;
        border-radius: 10px;
        background: #047857;
        color: #fff;
        font-size: 16px;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 10px 24px rgba(4, 120, 87, 0.24);
      }

      #${SUCCESS_MODAL_ID} .spga-success-close:hover {
        background: #065f46;
      }

      #${SUCCESS_MODAL_ID} .spga-success-spark {
        position: absolute;
        width: 9px;
        height: 22px;
        border-radius: 999px;
        background: #f59e0b;
        transform: rotate(var(--spga-rotate));
        animation: spga-success-spark 900ms ease-out both;
      }

      #${SUCCESS_MODAL_ID} .spga-success-spark:nth-child(1) { top: 22px; left: 28px; --spga-rotate: -28deg; }
      #${SUCCESS_MODAL_ID} .spga-success-spark:nth-child(2) { top: 56px; left: 62px; --spga-rotate: 56deg; background: #0ea5e9; }
      #${SUCCESS_MODAL_ID} .spga-success-spark:nth-child(3) { top: 24px; right: 34px; --spga-rotate: 32deg; background: #ec4899; }
      #${SUCCESS_MODAL_ID} .spga-success-spark:nth-child(4) { top: 72px; right: 60px; --spga-rotate: -60deg; background: #8b5cf6; }

      #${UPDATE_MODAL_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483646;
        display: grid;
        place-items: center;
        padding: 24px;
        background: rgba(15, 23, 42, 0.64);
        backdrop-filter: blur(6px);
        animation: spga-success-backdrop-in 180ms ease-out both;
      }

      #${UPDATE_MODAL_ID} .spga-update-card {
        position: relative;
        width: min(500px, calc(100vw - 40px));
        overflow: hidden;
        padding: 30px;
        border: 1px solid rgba(37, 99, 235, 0.25);
        border-radius: 20px;
        background:
          radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.2), transparent 38%),
          radial-gradient(circle at 0% 100%, rgba(14, 165, 233, 0.16), transparent 38%),
          #ffffff;
        box-shadow: 0 30px 90px rgba(15, 23, 42, 0.42);
        color: #172033;
        font-family: "Microsoft YaHei", "PingFang SC", "Segoe UI", sans-serif;
        animation: spga-success-card-in 420ms cubic-bezier(0.2, 0.9, 0.2, 1.15) both;
      }

      #${UPDATE_MODAL_ID} .spga-update-topline {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
      }

      #${UPDATE_MODAL_ID} .spga-update-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 48px;
        height: 26px;
        padding: 0 10px;
        border-radius: 999px;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        color: #fff;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: 1px;
        box-shadow: 0 7px 18px rgba(79, 70, 229, 0.24);
      }

      #${UPDATE_MODAL_ID} .spga-update-version {
        color: #64748b;
        font-size: 12px;
        font-weight: 700;
      }

      #${UPDATE_MODAL_ID} .spga-update-title {
        margin: 0;
        color: #172033;
        font-size: 28px;
        line-height: 1.25;
        font-weight: 900;
      }

      #${UPDATE_MODAL_ID} .spga-update-subtitle {
        margin: 10px 0 16px;
        color: #526079;
        font-size: 14px;
        line-height: 1.6;
      }

      #${UPDATE_MODAL_ID} .spga-update-list {
        display: grid;
        gap: 10px;
        margin: 0 0 22px;
        padding: 0;
        list-style: none;
      }

      #${UPDATE_MODAL_ID} .spga-update-item {
        position: relative;
        padding: 11px 13px 11px 38px;
        border: 1px solid #dbe7ff;
        border-radius: 12px;
        background: rgba(239, 246, 255, 0.78);
        color: #334155;
        font-size: 13px;
        line-height: 1.55;
        font-weight: 650;
      }

      #${UPDATE_MODAL_ID} .spga-update-item::before {
        content: "✓";
        position: absolute;
        top: 10px;
        left: 13px;
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #2563eb;
        color: #fff;
        font-size: 11px;
        font-weight: 900;
      }

      #${UPDATE_MODAL_ID} .spga-update-close {
        width: 100%;
        min-height: 46px;
        border: 0;
        border-radius: 11px;
        background: linear-gradient(135deg, #1769c2, #2563eb);
        color: #fff;
        font-size: 15px;
        font-weight: 850;
        cursor: pointer;
        box-shadow: 0 11px 25px rgba(37, 99, 235, 0.25);
      }

      #${UPDATE_MODAL_ID} .spga-update-close:hover {
        filter: brightness(1.06);
      }

      @keyframes spga-success-backdrop-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes spga-success-card-in {
        from { opacity: 0; transform: translateY(20px) scale(0.9); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      @keyframes spga-success-spark {
        from { opacity: 0; transform: translateY(12px) rotate(var(--spga-rotate)) scale(0.5); }
        to { opacity: 1; transform: translateY(0) rotate(var(--spga-rotate)) scale(1); }
      }

      @media (prefers-reduced-motion: reduce) {
        #${PANEL_ID} .spga-credit.spga-credit-celebrating,
        #${EASTER_EGG_LAYER_ID} .spga-easter-message,
        #${EASTER_EGG_LAYER_ID} .spga-easter-particle,
        #${SUCCESS_MODAL_ID},
        #${SUCCESS_MODAL_ID} .spga-success-card,
        #${SUCCESS_MODAL_ID} .spga-success-spark,
        #${UPDATE_MODAL_ID},
        #${UPDATE_MODAL_ID} .spga-update-card {
          animation: none;
        }
      }

      /* Brand accent: deeper pink keeps white button text legible. */
      #${PANEL_ID}, #${TOGGLE_ID}, #${SUCCESS_MODAL_ID}, #${UPDATE_MODAL_ID} {
        --spga-brand: linear-gradient(110deg, #1954ad 0%, #7035c9 55%, #b42b89 100%);
        --spga-accent: #0b5cab;
      }
      #${TOGGLE_ID}, #${PANEL_ID} .spga-button-primary,
      #${SUCCESS_MODAL_ID} .spga-success-close, #${UPDATE_MODAL_ID} .spga-update-close { background: #0b5cab; color: #fff; border-color: transparent; }
      #${PANEL_ID} .spga-button-primary:disabled { background: #e4e7ec; color: #667085; opacity: 1; }
      #${PANEL_ID} .spga-target-tabs .spga-target-tab[aria-selected="true"],
      #${PANEL_ID} .spga-language-active { color: var(--spga-accent); box-shadow: 0 1px 5px #1954ad20; }
      #${PANEL_ID} .spga-target-tabs { background: #edf2f7; }
      #${PANEL_ID} .spga-target-summary { background: #f2f6fc; }
      #${PANEL_ID} .spga-github-link:hover, #${PANEL_ID} .spga-github-link:focus-visible { color: var(--spga-accent); background: #edf2f7; }
      #${PANEL_ID} button:focus-visible, #${PANEL_ID} a:focus-visible { outline: 2px solid var(--spga-accent); outline-offset: 2px; }
      #${SUCCESS_MODAL_ID} .spga-success-card {
        background: #fff; border-color: #e3daf3; color: #172033;
        box-shadow: 0 24px 70px #34205240;
      }
      #${SUCCESS_MODAL_ID} .spga-success-card::before, #${UPDATE_MODAL_ID} .spga-update-card::before {
        content: ""; position: absolute; inset: 0 0 auto; height: 6px; background: var(--spga-brand);
      }
      #${SUCCESS_MODAL_ID} .spga-success-title { color: #172033; }
      #${SUCCESS_MODAL_ID} .spga-success-message { color: #344054; }
      #${SUCCESS_MODAL_ID} .spga-success-subtitle { color: #667085; }
      #${SUCCESS_MODAL_ID} .spga-success-close { box-shadow: 0 8px 20px #7035c924; }
      #${SUCCESS_MODAL_ID} .spga-success-close:hover, #${UPDATE_MODAL_ID} .spga-update-close:hover { background: #094e93; }
      #${UPDATE_MODAL_ID} .spga-update-card { background: #fff; border-color: #dce3ec; }
      #${UPDATE_MODAL_ID} .spga-update-badge { background: var(--spga-brand); }
      #${SUCCESS_MODAL_ID} .spga-success-close { box-shadow: 0 8px 20px #1954ad20; }
    `;

    document.head.appendChild(style);
  }

  function createElement(tagName, options = {}) {
    const element = document.createElement(tagName);

    if (options.className) {
      element.className = options.className;
    }

    if (options.textContent !== undefined) {
      element.textContent = options.textContent;
    }

    if (options.attributes) {
      Object.entries(options.attributes).forEach(([name, value]) => {
        element.setAttribute(name, value);
      });
    }

    return element;
  }

  /**
   * 点击底部制作署名后播放一个完全本地的轻量彩蛋。
   * 特效只创建短暂的 DOM 粒子，不加载图片、字体或第三方库，也不会发送网络请求。
   *
   * @param {HTMLElement} trigger 被点击的制作署名按钮
   */
  function showCreditEasterEgg(trigger) {
    if (!(trigger instanceof HTMLElement)) {
      return;
    }

    document.getElementById(EASTER_EGG_LAYER_ID)?.remove();

    const rect = trigger.getBoundingClientRect();
    const originX = Math.min(Math.max(24, rect.left + rect.width / 2), window.innerWidth - 24);
    const originY = Math.min(Math.max(24, rect.top + rect.height / 2), window.innerHeight - 24);
    const layer = createElement("div", {
      attributes: {
        id: EASTER_EGG_LAYER_ID,
        "aria-hidden": "true",
      },
    });
    const message = createElement("div", {
      className: "spga-easter-message",
      textContent: t("creditEasterEggMessage"),
    });
    message.style.left = `${originX}px`;
    message.style.top = `${originY}px`;
    layer.append(message);

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const colors = ["#0ea5e9", "#2563eb", "#7c3aed", "#ec4899", "#f59e0b", "#10b981"];
    const particleCount = reduceMotion ? 0 : 34;

    for (let index = 0; index < particleCount; index += 1) {
      // 从署名位置向上方半圆散开，避免粒子挡住底部操作按钮太久。
      const progress = particleCount === 1 ? 0.5 : index / (particleCount - 1);
      const angle = Math.PI + Math.PI * progress + (Math.random() - 0.5) * 0.26;
      const distance = 72 + Math.random() * 118;
      const particle = createElement("span", {
        className: `spga-easter-particle ${index % 6 === 0 ? "spga-easter-star" : ""}`.trim(),
        textContent: index % 6 === 0 ? "✦" : "",
      });
      particle.style.left = `${originX}px`;
      particle.style.top = `${originY}px`;
      particle.style.setProperty("--spga-dx", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--spga-dy", `${Math.sin(angle) * distance - Math.random() * 32}px`);
      particle.style.setProperty("--spga-rotate", `${Math.round((Math.random() - 0.5) * 760)}deg`);
      particle.style.setProperty("--spga-size", `${6 + Math.random() * 7}px`);
      particle.style.setProperty("--spga-color", colors[index % colors.length]);
      particle.style.animationDelay = `${Math.random() * 90}ms`;
      layer.append(particle);
    }

    document.body.append(layer);
    trigger.classList.add("spga-credit-celebrating");
    window.setTimeout(() => trigger.classList.remove("spga-credit-celebrating"), 760);
    window.setTimeout(() => layer.remove(), 1700);
  }

  function showSuccessCelebration(gifId, groupName = "") {
    const normalizedGifId = String(gifId || state.selected?.gifId || "");
    if (state.successModalShownForGifId === normalizedGifId) {
      return;
    }
    state.successModalShownForGifId = normalizedGifId;
    // Do not steal focus/selection from a report the user is copying.
    if (state.manualDiagnosticReport) return;

    document.getElementById(SUCCESS_MODAL_ID)?.remove();

    const overlay = createElement("div", {
      attributes: {
        id: SUCCESS_MODAL_ID,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": `${SUCCESS_MODAL_ID}-title`,
      },
    });
    const card = createElement("div", { className: "spga-success-card" });

    for (let index = 0; index < 4; index += 1) {
      card.append(createElement("span", { className: "spga-success-spark" }));
    }

    const badge = createElement("div", {
      className: "spga-success-badge",
      textContent: "✓",
    });
    const title = createElement("h2", {
      className: "spga-success-title",
      textContent: t("successTitle"),
      attributes: {
        id: `${SUCCESS_MODAL_ID}-title`,
      },
    });
    const message = createElement("p", {
      className: "spga-success-message",
      textContent: groupName ? groupText("已看到「" + groupName + "」的群头像更新", "Avatar update observed for “" + groupName + "”") : t("successMessage"),
    });
    const subtitle = createElement("p", {
      className: "spga-success-subtitle",
      textContent: groupName ? groupText("可以继续选择 GIF 并更换，无需刷新。", "You can choose another GIF without refreshing.") : t("successSubtitle"),
    });
    const closeButton = createElement("button", {
      className: "spga-success-close",
      textContent: t("successClose"),
      attributes: {
        type: "button",
      },
    });

    const closeModal = () => {
      document.removeEventListener("keydown", handleKeyDown);
      overlay.remove();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    closeButton.addEventListener("click", closeModal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
    document.addEventListener("keydown", handleKeyDown);

    card.append(badge, title, message, subtitle, closeButton);
    overlay.append(card);
    document.body.append(overlay);
    closeButton.focus();
  }

  function shouldShowUpdateNotice(lastSeenVersion) {
    return String(lastSeenVersion || "") !== UPDATE_NOTICE_VERSION;
  }

  function showUpdateNotice() {
    if (!shouldShowUpdateNotice(state.lastSeenUpdateNoticeVersion)) {
      return;
    }

    document.getElementById(UPDATE_MODAL_ID)?.remove();

    const overlay = createElement("div", {
      attributes: {
        id: UPDATE_MODAL_ID,
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": `${UPDATE_MODAL_ID}-title`,
      },
    });
    const card = createElement("div", { className: "spga-update-card" });
    const topLine = createElement("div", { className: "spga-update-topline" });
    topLine.append(
      createElement("span", { className: "spga-update-badge", textContent: t("updateBadge") }),
      createElement("span", {
        className: "spga-update-version",
        textContent: t("updateVersion", { version: UPDATE_NOTICE_VERSION }),
      })
    );

    const title = createElement("h2", {
      className: "spga-update-title",
      textContent: t("updateTitle"),
      attributes: { id: `${UPDATE_MODAL_ID}-title` },
    });
    const subtitle = createElement("p", {
      className: "spga-update-subtitle",
      textContent: t("updateSubtitle"),
    });
    const highlightList = createElement("ul", { className: "spga-update-list" });
    [
      "updateHighlightOne",
      "updateHighlightTwo",
      "updateHighlightThree",
      "updateHighlightFour",
    ].forEach((key) => {
      highlightList.append(
        createElement("li", { className: "spga-update-item", textContent: t(key) })
      );
    });

    const closeButton = createElement("button", {
      className: "spga-update-close",
      textContent: t("updateClose"),
      attributes: { type: "button" },
    });

    // 只有用户真正关闭弹窗后才记录“已读”。如果页面提前刷新，下次仍会再次展示。
    const closeModal = () => {
      state.lastSeenUpdateNoticeVersion = UPDATE_NOTICE_VERSION;
      saveState();
      document.removeEventListener("keydown", handleKeyDown);
      overlay.remove();
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    closeButton.addEventListener("click", closeModal);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
    document.addEventListener("keydown", handleKeyDown);

    card.append(topLine, title, subtitle, highlightList, closeButton);
    overlay.append(card);
    document.body.append(overlay);
    closeButton.focus();
  }

  function showUpdateNoticeIfNeeded() {
    if (!shouldShowUpdateNotice(state.lastSeenUpdateNoticeVersion)) {
      return;
    }

    // 稍微延后出现，让 SeaTalk 主界面和助手面板先完成首屏渲染。
    window.setTimeout(() => {
      if (shouldShowUpdateNotice(state.lastSeenUpdateNoticeVersion)) {
        showUpdateNotice();
      }
    }, 450);
  }

  function createButton(text, action, className = "") {
    return createElement("button", {
      className: `spga-button ${className}`.trim(),
      textContent: text,
      attributes: {
        type: "button",
        "data-action": action,
      },
    });
  }

  function getSelectedDisplayName() {
    if (!state.selected) {
      return t("noSelection");
    }

    if (state.selected.source === "local") {
      const presetIndex = LOCAL_GIF_PRESETS.findIndex((item) => item.gifId === state.selected.gifId);
      if (state.locale === "en" && presetIndex >= 0) {
        return t("exampleLabel", { number: presetIndex + 1 });
      }
      return state.selected.label || t("selectedSample");
    }

    if (state.selected.source === "recent") {
      return t("selectedFromChat");
    }

    return t("selectedSaved");
  }

  /**
   * 创建一个不会请求外部图片的 GIF 占位卡片。
   *
   * 内置示例保存的是 SeaTalk 的图片 ID，而不是可长期公开访问的图片 URL。
   * 如果直接把 ID 拼成下载地址，资源过期或服务端策略变化时浏览器会显示破图图标。
   * 因此，内置示例统一使用这个占位卡片；真正从当前聊天抓到的 GIF 仍然显示原图预览。
   */
  function createGifPreviewPlaceholder() {
    return createElement("div", {
      className: "spga-empty-preview spga-unavailable-preview",
      textContent: "GIF",
      attributes: { "aria-hidden": "true" },
    });
  }

  /**
   * 为聊天 GIF 创建预览，并在聊天资源地址失效时自动移除破图。
   *
   * @param {{ source?: string, previewUrl?: string, gifId?: string }} candidate GIF 候选项
   * @param {string} alt 图片替代文字
   * @returns {HTMLElement} GIF 图片或稳定的占位卡片
   */
  function createGifPreview(candidate, alt) {
    // 内置示例没有稳定、可公开访问的缩略图地址，避免发起已知会失败的图片请求。
    if (!candidate || candidate.source === "local") {
      return createGifPreviewPlaceholder();
    }

    const image = createElement("img", {
      attributes: {
        alt,
        src: candidate.previewUrl || buildPreviewUrl(candidate.gifId),
      },
    });

    // 聊天消息的临时图片链接可能在页面刷新后失效；失败时以占位卡片替换图片，
    // 不让浏览器把破图图标和 alt 文字直接暴露在界面中。
    image.addEventListener("error", () => {
      image.replaceWith(createGifPreviewPlaceholder());
    }, { once: true });

    return image;
  }

  function createSelectedView() {
    const wrapper = createElement("div", {
      className: `spga-selected${state.selected ? "" : " spga-selected-empty"}`,
    });
    const preview = state.selected
      ? createGifPreview(state.selected, getSelectedDisplayName())
      : createGifPreviewPlaceholder();
    const info = createElement("div", { className: "spga-selected-copy" });
    const eyebrow = createElement("div", {
      className: "spga-selected-eyebrow",
      textContent: t("selectedTitle"),
    });
    const name = createElement("div", {
      className: "spga-selected-name",
      textContent: getSelectedDisplayName(),
    });
    const statusText = !state.selected
      ? t("noSelectionHelp")
      : state.enabled
        ? t("selectedApplying")
        : state.directUpdaterReady
          ? t("selectedReady")
          : t("selectedChecking");
    const status = createElement("div", {
      className: "spga-selected-status",
      textContent: statusText,
    });

    info.append(eyebrow, name, status);
    wrapper.append(preview, info);
    return wrapper;
  }

  function createRecentCandidatesView() {
    const grid = createElement("div", { className: "spga-grid" });

    if (!state.recentCandidates.length) {
      grid.append(createElement("div", { className: "spga-note", textContent: t("candidatesEmpty") }));
      return grid;
    }

    state.recentCandidates.forEach((candidate, index) => {
      const card = createElement("div", { className: "spga-card" });
      const image = createGifPreview(
        candidate,
        index === 0 ? t("candidateLatest") : t("candidateEarlier", { number: index + 1 })
      );
      const title = createElement("div", {
        className: "spga-card-title",
        textContent: index === 0 ? t("candidateLatest") : t("candidateEarlier", { number: index + 1 }),
      });
      const choose = createButton(t("choose"), "choose-recent", "spga-button-compact");
      choose.dataset.index = String(index);

      card.append(image, title, choose);
      grid.append(card);
    });

    return grid;
  }

  function createLocalPresetView() {
    const wrapper = createElement("div", { className: "spga-preset-wrapper" });
    const description = createElement("p", {
      className: "spga-note",
      textContent: t("examplesDescription"),
    });
    const select = createElement("select", {
      className: "spga-select",
      attributes: {
        "data-role": "local-select",
        "aria-label": t("examplePlaceholder"),
      },
    });

    select.append(
      createElement("option", {
        textContent: t("examplePlaceholder"),
        attributes: { value: "" },
      })
    );

    LOCAL_GIF_PRESETS.forEach((preset, index) => {
      const option = createElement("option", {
        textContent: state.locale === "zh" ? preset.label : t("exampleLabel", { number: index + 1 }),
        attributes: { value: preset.key },
      });
      if (state.selected?.gifId === preset.gifId) {
        option.selected = true;
      }
      select.append(option);
    });

    wrapper.append(description, select);
    return wrapper;
  }

  function getEnableButtonText() {
    if (state.requestPending && state.requestSlow) return t("requestStillPending");
    if (!state.selected) {
      return t("applyDisabled");
    }
    if (state.enabled && !state.directUpdaterReady && !state.directUpdaterFailed) {
      return t("waitingForSeaTalk");
    }
    if (state.enabled && state.showDelayedLoading) {
      return t("applyLoading");
    }
    if (state.directUpdaterFailed) {
      return t("retryDirect");
    }
    return t("apply");
  }

  function localizeDiagnosticMessage(item) {
    if (Object.hasOwn(DIAGNOSTIC_CODES, item.code)) {
      return DIAGNOSTIC_CODES[item.code][state.locale === "zh" ? 1 : 2];
    }
    if (state.locale === "zh") {
      return item.message;
    }
    if ([I18N.zh.diagnosticApiConfirmed, I18N.en.diagnosticApiConfirmed].includes(item.message)) {
      return t("diagnosticApiConfirmed");
    }
    if ([I18N.zh.diagnosticVisualPending, I18N.en.diagnosticVisualPending].includes(item.message)) {
      return t("diagnosticVisualPending");
    }
    const message = String(item.message || "");
    if (/启动自检通过/.test(message)) {
      const chunk = message.match(/chunk-styles-[a-zA-Z0-9_-]+\.js/);
      return "Startup check passed: avatar update service found" + (chunk ? ` (${chunk[0]})` : "");
    }
    if (/开始直接提交 GIF/.test(message)) return "Starting GIF avatar update.";
    if (/正在提交 ContactUpdateUserInfo/.test(message)) return "Account identified; submitting ContactUpdateUserInfo.";
    if (/等待.*加载|正在等待/.test(message)) return "Waiting for SeaTalk modules to load.";
    if (!/[\u3400-\u9fff]/.test(message)) return message;
    if (item.level === "error") {
      return t("diagnosticErrorGeneric");
    }
    if (item.level === "success") {
      return t("diagnosticSuccessGeneric");
    }
    return t("diagnosticInfoGeneric");
  }

  function createDiagnosticsView() {
    const wrapper = createElement("div", { className: "spga-diagnostics" });
    const env = getDiagnosticEnvironment();
    wrapper.append(createElement("div", { textContent: `Helper ${env.script} · SeaTalk ${env.seatalk} · Build ${env.release}` }));
    wrapper.append(createElement("div", { textContent: `${env.browser} · ${env.manager} ${env.managerVersion}` }));
    const copyButton = createElement("button", {
      className: "spga-button",
      textContent: state.locale === "zh" ? "复制脱敏诊断" : "Copy sanitized diagnostics",
      attributes: { type: "button" },
    });
    copyButton.addEventListener("click", () => copyDiagnosticReport(copyButton));
    wrapper.append(copyButton);
    wrapper.append(createElement("div", { textContent: state.locale === "zh"
      ? "仅复制环境版本和流程错误码，不包含账号、聊天内容或图片地址。耗时从本次操作开始计算。"
      : "Copies versions and stage codes only; no account, chat or image URLs. Timing is relative to each attempt." }));
    const events = state.diagnosticEvents.length
      ? state.diagnosticEvents
      : [{ time: "--:--:--", level: "info", message: t("diagnosticsEmpty") }];

    for (const item of events) {
      const row = createElement("div", {
        className:
          item.level === "error"
            ? "spga-diagnostic-error"
            : item.level === "success"
              ? "spga-diagnostic-success"
              : "",
        textContent: `[${item.time}]${item.code ? ` #${item.attempt} +${(item.elapsedMs / 1000).toFixed(1)}s ${item.code}${item.errorCode !== null && item.errorCode !== undefined ? ` (${item.errorCode})` : ""}` : ""} ${localizeDiagnosticMessage(item)}`,
      });
      if (state.locale === "en") {
        row.title = item.message;
      }
      wrapper.append(row);
    }

    return wrapper;
  }

  function createDisclosure(summaryText, content, stateKey, className = "") {
    const details = createElement("details", {
      className: `spga-disclosure ${className}`.trim(),
    });
    details.open = Boolean(state[stateKey]);
    const summary = createElement("summary", { textContent: summaryText });
    details.addEventListener("toggle", () => {
      state[stateKey] = details.open;
    });
    details.append(summary, content);
    return details;
  }

  function createLanguageToggle() {
    const group = createElement("div", {
      className: "spga-language",
      attributes: { role: "group", "aria-label": t("toggleLabel") },
    });

    for (const [locale, label] of [["zh", "中文"], ["en", "EN"]]) {
      const button = createButton(label, "set-locale", "spga-language-button");
      button.dataset.locale = locale;
      button.classList.toggle("spga-language-active", state.locale === locale);
      button.setAttribute("aria-pressed", String(state.locale === locale));
      group.append(button);
    }

    return group;
  }

  function createPathCard({ eyebrow, title, description, className = "", children = [] }) {
    const card = createElement("section", { className: `spga-path-card ${className}`.trim() });
    card.append(
      createElement("div", { className: "spga-eyebrow", textContent: eyebrow }),
      createElement("h3", { className: "spga-path-title", textContent: title }),
      createElement("p", { className: "spga-path-description", textContent: description }),
      ...children
    );
    return card;
  }

  function renderPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) {
      return;
    }

    panel.textContent = "";
    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
      toggle.textContent = t("helperToggle");
      toggle.title = t("dragHint");
      toggle.setAttribute("aria-label", `${t("helperToggle")}，${t("dragHint")}`);
    }

    const header = createElement("header", { className: "spga-header" });
    const heading = createElement("div", { className: "spga-heading" });
    heading.append(
      createElement("h2", { className: "spga-title", textContent: t("title") }),
      createElement("p", { className: "spga-subtitle", textContent: t("subtitle") })
    );
    header.append(heading, createLanguageToggle());
    bindPanelDrag(header, panel);
    const close = createButton("×", "close-panel");
    close.setAttribute("aria-label", groupText("关闭助手", "Close helper"));
    close.classList.add("spga-window-close");
    close.title = groupText("关闭助手，保留当前选择", "Close helper; keep your selection");
    close.addEventListener("click", () => panel.classList.remove("spga-open"));
    const minimize = createButton("−", "minimize-panel");
    minimize.classList.add("spga-window-minimize");
    minimize.setAttribute("aria-label", groupText("收起GIF 头像", "Minimize GIF avatars"));
    minimize.title = groupText("收起，保留当前选择", "Minimize; keep your selection");
    minimize.addEventListener("click", () => panel.classList.remove("spga-open"));
    header.append(minimize, close);

    const randomButton = createButton(
      state.activeAction === "random" && state.showDelayedLoading ? t("randomPreparing") : t("randomApply"),
      "random-apply",
      "spga-button-soft"
    );
    randomButton.disabled = state.enabled || state.requestPending;
    const quickCard = createPathCard({
      eyebrow: t("quickEyebrow"),
      title: t("quickTitle"),
      description: t("quickDescription"),
      className: "spga-path-card-quick",
      children: [randomButton],
    });

    const steps = createElement("div", { className: "spga-steps" });
    steps.append(
      createElement("div", { textContent: t("ownStepOne") }),
      createElement("div", { textContent: t("ownStepTwo") })
    );
    const scanButton = createButton(
      state.scanInProgress ? t("scanCheckingAnimation") : t("scanCurrentChat"),
      "scan-recent"
    );
    scanButton.disabled = state.scanInProgress;
    const ownCard = createPathCard({
      eyebrow: t("ownEyebrow"),
      title: t("ownTitle"),
      description: t("ownDescription"),
      children: [steps, scanButton],
    });

    const body = createElement("div", { className: "spga-body" });
    if (state.directUpdaterFailed) {
      body.append(
        createElement("div", {
          className: "spga-compatibility-alert",
          textContent: t("compatibilityAlert"),
          attributes: { role: "alert" },
        })
      );
    }
    const picker = createElement("section", { className: "spga-picker" });
    const actions = createElement("div", { className: "spga-picker-actions" });
    scanButton.textContent = groupText("从聊天获取", "Get from chat");
    randomButton.textContent = groupText("随机挑一个", "Pick a GIF");
    scanButton.disabled = state.scanInProgress || !!groupUI.pending || state.requestPending;
    actions.append(scanButton, randomButton);
    picker.append(createElement("h3", {className:"spga-path-title", textContent:groupText("选择 GIF", "Choose a GIF")}), actions,
      createElement("p", {className:"spga-path-description",textContent:groupText("先在当前聊天发送 GIF，再获取并预览。", "Send a GIF in this chat, then get it here to preview.")}));
    body.append(createTargetSelector(), picker, createSelectedView());

    if (state.recentCandidates.length) {
      body.append(
        createDisclosure(
          `${t("candidatesSummary")} (${state.recentCandidates.length})`,
          createRecentCandidatesView(),
          "candidatesOpen"
        )
      );
    }
    body.append(
      createDisclosure(t("examplesSummary"), createLocalPresetView(), "examplesOpen"),
      createDisclosure(t("diagnosticsSummary"), createDiagnosticsView(), "diagnosticsOpen", "spga-disclosure-status")
    );

    const footer = createElement("footer", { className: "spga-sticky-footer" });
    const status = createElement("div", {
      className: "spga-footer-status",
      textContent: buildStatusText(),
      attributes: { "data-role": "status", "aria-live": "polite" },
    });
    const applyButton = createButton(getEnableButtonText(), "enable", "spga-button-primary spga-apply-button");
    applyButton.disabled = !state.selected || state.requestPending || (state.enabled && !state.directUpdaterFailed);
    const creditButton = createElement("button", {
      className: "spga-credit",
      textContent: t("credit"),
      attributes: {
        type: "button",
        title: t("creditEasterEggHint"),
        "aria-label": `${t("credit")}：${t("creditEasterEggHint")}`,
        "data-action": "credit-easter-egg",
      },
    });
    const versionBadge = createElement("span", {
      className: "spga-version-badge",
      textContent: `v${SCRIPT_VERSION}`,
      attributes: {
        title: `SeaTalk Sticker Helper v${SCRIPT_VERSION}`,
        "aria-label": `SeaTalk Sticker Helper version ${SCRIPT_VERSION}`,
      },
    });
    const creditRow = createElement("div", { className: "spga-credit-row" });
    const githubLabel = groupText("查看 GitHub 项目", "View GitHub project");
    const githubLink = createElement("a", {
      className: "spga-github-link",
      attributes: {
        href: "https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper",
        target: "_blank", rel: "noopener noreferrer", title: githubLabel, "aria-label": githubLabel,
      },
    });
    const githubIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", fill: "currentColor", "aria-hidden": "true", focusable: "false" })) githubIcon.setAttribute(key, value);
    const githubPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    githubPath.setAttribute("d", "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z");
    githubIcon.append(githubPath);
    githubLink.append(githubIcon);
    creditRow.append(creditButton, versionBadge, githubLink);
    if (groupUI.mode === "group") {
      status.textContent = groupUI.message || (groupUI.context
        ? groupText("预览后确认，即可更换群头像。", "Preview, then confirm to update the group avatar.")
        : groupText("请点聊天右上角「···」打开群设置，并保持打开。", "Open the chat's top-right … group settings and keep it open."));
      applyButton.textContent = groupUI.context
        ? groupText("设为当前群头像…", "Set group avatar…")
        : groupText("请先打开目标群设置", "Open target group settings first");
      if (groupUI.pending) applyButton.textContent = groupText("正在确认结果…", "Checking result…");
      applyButton.disabled = !state.selected || !groupUI.context || !!groupUI.pending || state.requestPending;
    } else if (groupUI.pending) applyButton.disabled = true;
    randomButton.disabled = randomButton.disabled || !!groupUI.pending;
    footer.append(status, applyButton, creditRow);

    footer.style.flexShrink = "0";
    const featureTabs = createElement('nav', { className: 'spga-target-tabs', attributes: { 'aria-label': groupText('助手功能', 'Helper tools') } });
    const avatarTab = createElement('button', { className: 'spga-button spga-target-tab', textContent: groupText('GIF 头像', 'GIF avatars'), attributes: { type: 'button', 'aria-current': 'page' } });
    const favoritesTab = createElement('button', { className: 'spga-button spga-target-tab', textContent: groupText('我的表情', 'My stickers'), attributes: { type: 'button' } });
    favoritesTab.addEventListener('click', openCollectionsWorkspace);
    featureTabs.append(avatarTab, favoritesTab);
    const collectionsHint = createElement('p', { attributes: { id: 'spga-collections-hint', role: 'status' } });
    collectionsHint.style.cssText = 'font-size:13px;line-height:1.5;margin:0 14px;color:#526276;';
    panel.append(header, featureTabs, collectionsHint, body, footer);
    window.requestAnimationFrame(positionPanelNearToggle);
  }

  function buildStatusText() {
    if (!state.requestPending && state.diagnosticEvents[0]?.level === "error") return state.hookStatus || t("statusError");
    if (state.requestPending && state.requestSlow) return t("requestStillPending");
    if (state.enabled) {
      return t("statusApplying");
    }
    if (state.diagnosticEvents[0]?.level === "error" && !state.directUpdaterReady) {
      return t("statusError");
    }
    return state.directUpdaterReady ? t("statusReady") : t("statusChecking");
  }

  function isFileInputForAvatarUpload(input) {
    if (!(input instanceof HTMLInputElement) || input.type !== "file") {
      return false;
    }

    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return accept.includes(".jpg") || accept.includes(".jpeg") || accept.includes(".png");
  }

  function getVisibleElementScore(element) {
    if (!(element instanceof Element)) {
      return 0;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.right <= 0 ||
      rect.bottom <= 0 ||
      rect.left >= window.innerWidth ||
      rect.top >= window.innerHeight ||
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity) === 0
    ) {
      return 0;
    }

    return Math.min(rect.width * rect.height, 20000) + rect.top + rect.left;
  }

  function clickElementLikeUser(element) {
    if (!(element instanceof Element)) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const hitElement = document.elementFromPoint(clientX, clientY);
    const target = hitElement instanceof Element ? hitElement : element;

    try {
      if (target instanceof HTMLElement) {
        target.focus?.();
      }

      // SeaTalk 有些入口不只听 click，也会听 pointer/mouse 事件。
      // 这里按真人点击顺序补齐事件，让“打开个人资料卡”更稳。
      if (typeof PointerEvent === "function") {
        target.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX,
            clientY,
            button: 0,
            buttons: 1,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          })
        );
      }

      target.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX,
          clientY,
          button: 0,
          buttons: 1,
        })
      );

      if (typeof PointerEvent === "function") {
        target.dispatchEvent(
          new PointerEvent("pointerup", {
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
            clientX,
            clientY,
            button: 0,
            buttons: 0,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
          })
        );
      }

      target.dispatchEvent(
        new MouseEvent("mouseup", {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        })
      );

      target.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          clientX,
          clientY,
          button: 0,
          buttons: 0,
        })
      );

      return true;
    } catch (_error) {
      try {
        element.click();
        return true;
      } catch (__error) {
        return false;
      }
    }
  }

  function findAvatarEditFileInput(options = {}) {
    const visibleOnly = Boolean(options.visibleOnly);
    const inputs = Array.from(document.querySelectorAll("input[type='file']"))
      .filter(isFileInputForAvatarUpload);

    let best = null;

    for (const input of inputs) {
      const label = input.closest("label");
      const trigger = label || input;
      const triggerText = (trigger.textContent || "").trim().toLowerCase();
      const accept = (input.getAttribute("accept") || "").toLowerCase();
      const labelScore = getVisibleElementScore(label);
      const inputScore = getVisibleElementScore(input);
      const triggerScore = Math.max(labelScore, inputScore);

      // 资料卡关闭时，头像上传框可能仍留在页面里，但此时直接点击不会弹出文件窗口。
      // 需要打开文件窗口时，只使用当前真正显示出来的“编辑”入口。
      if (visibleOnly && triggerScore <= 0) {
        continue;
      }

      let score = triggerScore;
      if (triggerText.includes("edit") || triggerText.includes("编辑")) {
        score += 50000;
      }
      if (accept.includes(".jpg") && accept.includes(".png")) {
        score += 10000;
      }
      if (label) {
        score += 5000;
      }

      if (!best || score > best.score) {
        best = {
          input,
          trigger,
          score,
        };
      }
    }

    if (!best) {
      return null;
    }

    return best;
  }

  function findPersonalAvatarTrigger() {
    // SeaTalk 左上角个人头像当前带有 avatar-badge 类名。
    // 同时限制尺寸和可见性，避免误点聊天列表里的普通头像。
    const badges = Array.from(document.querySelectorAll(".avatar-badge"))
      .filter((element) => {
        if (element.closest(`#${PANEL_ID}, #${TOGGLE_ID}`)) {
          return false;
        }

        if (getVisibleElementScore(element) <= 0) {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return (
          rect.width >= 32 &&
          rect.width <= 96 &&
          rect.height >= 32 &&
          rect.height <= 96 &&
          rect.left <= window.innerWidth * 0.35 &&
          rect.top <= window.innerHeight * 0.35
        );
      })
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();
        return leftRect.top - rightRect.top || leftRect.left - rightRect.left;
      });

    if (!badges.length) {
      return null;
    }

    const badge = badges[0];
    return badge.closest("button, [role='button'], a, [tabindex]") || badge.parentElement || badge;
  }

  function getCurrentPersonalAvatarUrls() {
    return Array.from(document.querySelectorAll(".avatar-badge"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width >= 32 && rect.height >= 32 && rect.left <= window.innerWidth * 0.4;
      })
      .map((element) => {
        if (element instanceof HTMLImageElement) {
          return element.currentSrc || element.src || "";
        }
        const image = element.querySelector("img");
        return image?.currentSrc || image?.src || "";
      })
      .filter(Boolean);
  }

  function clearVerificationTimer() {
    if (state.verificationTimer) {
      window.clearInterval(state.verificationTimer);
      state.verificationTimer = null;
    }
  }

  function markRequestStillPending() {
    if (!state.requestPending) return;
    state.requestSlow = true;
    state.hookStatus = t("requestStillPending");
    addDiagnostic("", "info", "REQUEST_STILL_PENDING");
    state.diagnosticsOpen = true;
    clearDelayedLoading();
    renderPanel();
  }

  function startAvatarVerification(operation, targetGifId = operation.gifId) {
    clearVerificationTimer();
    const startedAt = Date.now();
    state.verificationTimer = window.setInterval(() => {
      // Even an already-queued timer must not mutate a later attempt.
      if (state.activeOperation !== operation) return;
      const currentUrls = getCurrentPersonalAvatarUrls();
      const containsGifId = currentUrls.some((url) => url.includes(targetGifId));
      // An arbitrary URL change can belong to an old request or cache refresh.
      // Only the captured target ID counts as visual confirmation.
      if (containsGifId) {
        clearVerificationTimer();
        addDiagnostic(t("verificationObserved"), "success", "VISUAL_SUCCESS");
        if (!state.requestPending && state.apiConfirmedGifId === operation.gifId) {
          state.hookStatus = t("verificationObserved");
        }
        // Visual success never unlocks an unresolved API request.
        renderPanel();
        return;
      }
      if (Date.now() - startedAt >= 20000) {
        clearVerificationTimer();
        if (state.requestPending) {
          markRequestStillPending();
        } else if (state.apiConfirmedGifId === operation.gifId) {
          state.hookStatus = t("verificationConfirmed");
          addDiagnostic(t("diagnosticVisualPending"), "info", "VISUAL_PENDING");
          renderPanel();
        }
      }
    }, 800);
  }

  async function inspectSelectedAvatarFile(file) {
    if (!(file instanceof File)) {
      return;
    }

    let signature = "读取失败";
    try {
      const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
      signature = Array.from(bytes)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    } catch (_error) {
      // 诊断读取失败不应阻断 SeaTalk 自己的上传流程。
    }

    const isJpeg = ["ffd8ffdb", "ffd8ffe0", "ffd8ffe1", "ffd8ffe2"].includes(signature);
    const isPng = signature === "89504e47";
    const sizeText = `${Math.max(1, Math.round(file.size / 1024))} KB`;

    if (!isJpeg && !isPng) {
      state.hookStatus = `已选择文件，但文件内容不是 JPG/PNG（签名 ${signature}）。SeaTalk 会拒绝该文件。`;
      addDiagnostic(`文件格式不兼容：${file.name}，签名 ${signature}。`, "error");
    } else {
      state.hookStatus = `已选择 ${file.name}（${sizeText}），正在等待 SeaTalk 发出上传请求。`;
      addDiagnostic(`已捕获文件选择：${file.name}，${sizeText}。`);
    }

    sendHookConfig("avatar-file-selected", {
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      signature,
    });
    renderPanel();
  }

  function clearPendingTimeout() {
    if (state.pendingTimer) {
      window.clearTimeout(state.pendingTimer);
      state.pendingTimer = null;
    }
  }

  function clearDelayedLoading() {
    if (state.loadingTimer) {
      window.clearTimeout(state.loadingTimer);
      state.loadingTimer = null;
    }
    state.showDelayedLoading = false;
  }

  function startDelayedLoading() {
    clearDelayedLoading();
    state.loadingTimer = window.setTimeout(() => {
      state.loadingTimer = null;
      if (!state.enabled) {
        return;
      }
      state.showDelayedLoading = true;
      renderPanel();
    }, 450);
  }

  function startPendingTimeout(operation = state.activeOperation) {
    clearPendingTimeout();
    state.pendingTimer = window.setTimeout(() => {
      if (state.activeOperation !== operation || !state.requestPending) return;
      markRequestStillPending();
    }, 30000);
  }

  function openAvatarEditFileDialog(editInput) {
    if (!editInput) {
      return false;
    }

    // 优先点击 SeaTalk 自己显示出来的“编辑”标签，确保 React 当前实例能收到 change 事件。
    // 只有标签点击失败时，才退回直接点击隐藏 input。
    try {
      if (editInput.trigger !== editInput.input && getVisibleElementScore(editInput.trigger) > 0) {
        return clickElementLikeUser(editInput.trigger);
      }
    } catch (_error) {
      // 标签点击失败时继续尝试 input。
    }

    try {
      editInput.input.click();
      return true;
    } catch (_error) {
      // 继续走到统一失败返回。
    }

    return false;
  }

  function openPersonalProfileAndAvatarEditor() {
    // 如果资料卡已经打开，立即点击可见的“编辑”，保留当前这次真实用户点击权限。
    const currentEditInput = findAvatarEditFileInput({ visibleOnly: true });
    if (currentEditInput) {
      return openAvatarEditFileDialog(currentEditInput);
    }

    const profileTrigger = findPersonalAvatarTrigger();
    if (!profileTrigger) {
      return false;
    }

    const opened = clickElementLikeUser(profileTrigger);
    if (!opened) {
      return false;
    }

    state.hookStatus = "已尝试打开左上角个人资料卡。资料卡出现后，请再点一次蓝色按钮打开上传窗口。";
    saveState();
    sendHookConfig();

    window.setTimeout(() => {
      if (!state.enabled) {
        return;
      }

      const editInput = findAvatarEditFileInput({ visibleOnly: true });
      state.hookStatus = editInput
        ? "个人资料卡已打开。现在蓝色按钮已经变成上传入口，再点一次就会呼出上传窗口。"
        : "已尝试点击左上角头像，但还没看到资料卡。请手动点头像后，再点一次蓝色按钮。";
      saveState();
      sendHookConfig();
      renderPanel();
      setStatus(buildStatusText());
    }, 500);

    return true;
  }

  function startAvatarApply(actionSource = "selected") {
    if (groupUI.pending) return;
    if (state.requestPending) {
      markRequestStillPending();
      return;
    }
    if (!state.selected || !isCustomGifStickerId(state.selected.gifId)) {
      setStatus(state.selected ? t("unsupportedGif") : t("applyDisabled"));
      if (state.selected) {
        addDiagnostic(t("unsupportedGif"), "error");
        state.diagnosticsOpen = true;
        renderPanel();
      }
      return;
    }

    if (state.enabled && !state.directUpdaterFailed) return;
    state.diagnosticAttempt += 1;
    state.diagnosticAttemptAt = Date.now();
    addDiagnostic("", "info", "APPLY_START");

    if (!state.pageHookReady && !injectPageHook()) {
      return;
    }

    if (state.enabled && !state.directUpdaterFailed) {
      return;
    }

    // 失败后的再次点击只重新检查自动入口，不再要求用户上传普通 PNG 图片。
    if (state.directUpdaterFailed) {
      state.directUpdaterFailed = false;
      state.diagnosticsOpen = false;
      addDiagnostic("用户已重新检查自动更新入口。", "info");
    }

    const operation = Object.freeze({ id: state.diagnosticAttempt, gifId: state.selected.gifId });
    state.activeOperation = operation;
    state.requestPending = true;
    state.requestSlow = false;
    state.enabled = true;
    state.activeAction = actionSource;
    state.apiConfirmedGifId = "";
    state.successModalShownForGifId = "";
    state.hookStatus = state.directUpdaterReady
      ? "正在通过自动发现的 SeaTalk 更新入口提交 GIF 头像。"
      : "SeaTalk 页面模块仍在加载，正在自动等待更新入口。";
    addDiagnostic(
      state.directUpdaterReady
        ? "开始直接提交 GIF 头像。"
        : "更新入口尚未就绪，正在等待页面模块加载。"
    );
    saveState();
    startPendingTimeout(operation);
    startDelayedLoading();

    startAvatarVerification(operation);
    sendHookConfig("apply-direct", { attemptId: operation.id, gifId: operation.gifId });

    renderPanel();
  }


  function groupText(zh, en) { return state.locale === "en" ? en : zh; }

  function createTargetSelector() {
    const box = createElement("div", { className: "spga-path-card" });
    const row = createElement("div", { className: "spga-target-tabs", attributes: { role: "tablist", "aria-label": groupText("头像目标", "Avatar target") } });
    for (const [mode, zh, en] of [["personal", "我的头像", "My avatar"], ["group", "当前群头像", "Group avatar"]]) {
      const button = createElement("button", { textContent: groupText(zh, en), attributes: { type: "button", role: "tab", "aria-selected": String(groupUI.mode === mode) } });
      button.className = "spga-button spga-target-tab";
      button.disabled = !!groupUI.pending || state.requestPending;
      button.addEventListener("click", () => {
        groupUI.mode = mode; groupUI.message = "";
        if (mode === "group") addDiagnostic("", "info", groupUI.context ? "GROUP_CONTEXT_READY" : "GROUP_CONTEXT_MISSING");
        renderPanel();
      });
      row.append(button);
    }
    box.append(row);
    if (groupUI.mode === "group") box.append(createElement("p", { className: "spga-target-summary", textContent: (groupUI.pending || groupUI.context)
      ? groupText("目标群：", "Target group: ") + (groupUI.pending || groupUI.context).name
      : groupText("请打开目标群的设置，并确认头像有“编辑”入口。", "Open the target group's settings with an editable avatar.") }));
    return box;
  }

  function closeGroupConfirmation() {
    if (groupUI.dialog) { groupUI.dialog.close(); groupUI.dialog.remove(); groupUI.dialog = null; }
  }

  function confirmGroupAvatar() {
    if (groupUI.dialog || groupUI.pending || state.requestPending || !groupUI.context || !isCustomGifStickerId(state.selected?.gifId)) return;
    const operation = Object.freeze({ ...groupUI.context, gifId: state.selected.gifId, requestId: ++groupUI.sequence });
    const dialog = document.createElement("dialog");
    dialog.style.cssText = "border:0;border-radius:18px;padding:24px;max-width:400px;width:85%;box-shadow:0 12px 60px #0006;color:#17243b;background:white";
    dialog.setAttribute("aria-label", groupText("确认修改群头像", "Confirm group avatar change"));
    const heading = document.createElement("h3"); heading.textContent = groupText("确认修改群头像？", "Change this group's avatar?");
    const img = document.createElement("img"); img.src = buildPreviewUrl(operation.gifId); img.width = 96; img.height = 96; img.alt = "GIF preview";
    const name = document.createElement("p"); name.textContent = groupText("目标群：", "Target group: ") + operation.name;
    const note = document.createElement("p"); note.textContent = groupText("所有群成员都会看到新头像，群内可能产生修改通知。", "All group members will see the new avatar. A system notification may appear.");
    const cancel = document.createElement("button"); cancel.textContent = groupText("取消", "Cancel"); cancel.type = "button";
    const confirm = document.createElement("button"); confirm.textContent = groupText("确认修改群头像", "Confirm group avatar change"); confirm.type = "button";
    cancel.addEventListener("click", closeGroupConfirmation);
    dialog.addEventListener("cancel", () => { groupUI.dialog = null; dialog.remove(); });
    confirm.addEventListener("click", () => {
      if (groupUI.pending || !groupUI.context || operation.id !== groupUI.context.id || operation.revision !== groupUI.context.revision) { closeGroupConfirmation(); return; }
      state.diagnosticAttempt += 1;
      state.diagnosticAttemptAt = Date.now();
      addDiagnostic("", "info", "GROUP_APPLY_START");
      groupUI.pending = operation;
      groupUI.message = groupText("正在更新群头像…", "Updating group avatar…");
      closeGroupConfirmation(); renderPanel();
      sendHookConfig("apply-group", operation);
    });
    dialog.append(heading, img, name, note, cancel, confirm);
    document.body.append(dialog); groupUI.dialog = dialog; dialog.showModal(); cancel.focus();
  }

  function bindGroupStatus() {
    window.addEventListener(HOOK_EVENTS.statusEvent, ({ detail: d }) => {
      if (d?.type === "group-context") {
        const previous = groupUI.context;
        groupUI.context = d.context;
        if (groupUI.mode === "group") {
          if (!groupUI.pending) groupUI.message = "";
          addDiagnostic("", "info", d.context ? "GROUP_CONTEXT_READY" : "GROUP_CONTEXT_MISSING");
        }
        if (groupUI.dialog && (!d.context || previous?.revision !== d.context.revision || previous?.id !== d.context.id)) {
          closeGroupConfirmation(); groupUI.message = groupText("目标已变化，请重新确认。", "Target changed. Please confirm again.");
        }
        renderPanel();
      }
      if (d?.type !== "group-result" || d.requestId !== groupUI.pending?.requestId) return;
      addDiagnostic("", d.code === "GROUP_OBSERVED" ? "success" : "error", d.code);
      groupUI.message = d.code === "GROUP_OBSERVED"
        ? groupText("已观察到群头像更新，可以继续更换。", "Group avatar update observed. Ready for another update.")
        : d.code === "GROUP_PENDING"
          ? groupText("尚未确认结果，仍在检查；请保持目标群设置打开。", "Still checking. Keep the target group settings open.")
          : groupText("更新未提交：目标或权限已变化，请重新打开群设置。", "Not submitted: target or permission changed. Reopen group settings.");
      if (d.code === "GROUP_OBSERVED") {
        state.successModalShownForGifId = "";
        showSuccessCelebration(groupUI.pending.gifId, groupUI.pending.name);
      }
      if (d.code !== "GROUP_PENDING") groupUI.pending = null;
      renderPanel();
    });
  }

  function bindPanelEvents() {
    document.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const action = target.getAttribute("data-action");
      if (!action) {
        return;
      }

      if (action === "credit-easter-egg") {
        showCreditEasterEgg(target);
        return;
      }

      if (action === "set-locale") {
        const locale = target.dataset.locale;
        if (locale === "zh" || locale === "en") {
          setHelperLocale(locale);
        }
        return;
      }

      if (action === "random-apply") {
        if (groupUI.pending || state.enabled || state.requestPending || !LOCAL_GIF_PRESETS.length) {
          return;
        }
        const alternatives = LOCAL_GIF_PRESETS.filter((item) => item.gifId !== state.selected?.gifId);
        const pool = alternatives.length ? alternatives : LOCAL_GIF_PRESETS;
        const preset = pool[Math.floor(Math.random() * pool.length)];
        selectCandidate(preset);
        // Both modes preview first; the primary button submits.
        return;
      }

      if (action === "scan-recent") {
        if (state.scanInProgress) {
          return;
        }

        state.scanInProgress = true;
        state.staticImageCount = 0;
        state.unverifiedImageCount = 0;
        state.checkedCandidateCount = 0;
        state.animatedCandidateCount = 0;
        renderPanel();
        setStatus(t("scanCheckingAnimation"));

        const rawCandidates = collectRecentGifCandidates();
        state.recentCandidates = await keepVerifiedAnimatedCandidates(rawCandidates);
        state.scanInProgress = false;

        if (state.recentCandidates.length) {
          state.candidatesOpen = true;
          selectCandidate(state.recentCandidates[0]);
          setStatus(t("scanSuccessVerified", {
            checked: state.checkedCandidateCount,
            animated: state.animatedCandidateCount,
            shown: state.recentCandidates.length,
            static: state.staticImageCount,
            unverified: state.unverifiedImageCount,
            unsupported: state.filteredImageCount,
          }));
        } else {
          renderPanel();
          setStatus(t("scanEmptyVerified", {
            checked: state.checkedCandidateCount,
            static: state.staticImageCount,
            unverified: state.unverifiedImageCount,
            unsupported: state.filteredImageCount,
          }));
        }
        return;
      }

      if (action === "choose-recent") {
        const index = Number(target.dataset.index);
        const candidate = state.recentCandidates[index];
        state.candidatesOpen = false;
        selectCandidate(candidate);
        return;
      }

      if (action === "enable") {
        if (groupUI.mode === "group") confirmGroupAvatar();
        else if (!groupUI.pending) startAvatarApply("selected");
        return;
      }
    });

    document.addEventListener("change", (event) => {
      const target = event.target;

      if (target instanceof HTMLInputElement && isFileInputForAvatarUpload(target)) {
        const file = target.files?.[0];
        if (file) {
          // 先立刻通知页面 Hook，避免 SeaTalk 在文件签名检查完成前就开始上传。
          sendHookConfig("avatar-file-selected", {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
          });
          inspectSelectedAvatarFile(file);
        } else {
          addDiagnostic("文件选择窗口已关闭，但没有选中文件。", "error");
          renderPanel();
        }
        return;
      }

      if (!(target instanceof HTMLSelectElement)) {
        return;
      }

      if (target.getAttribute("data-role") !== "local-select") {
        return;
      }

      const preset = LOCAL_GIF_PRESETS.find((item) => item.key === target.value);
      if (preset) {
        state.examplesOpen = false;
        selectCandidate(preset);
      }
    }, true);
  }

  function createPanel() {
    if (!document.getElementById(PANEL_ID)) {
      const panel = createElement("section", {
        attributes: {
          id: PANEL_ID,
        },
      });
      document.body.appendChild(panel);
    }

    if (!document.getElementById(TOGGLE_ID)) {
      const toggle = createElement("button", {
        textContent: t("helperToggle"),
        attributes: {
          id: TOGGLE_ID,
          type: "button",
          title: t("dragHint"),
        },
      });
      document.body.appendChild(toggle);
      bindToggleDrag(toggle);
      applyFloatingPosition();
      window.addEventListener("resize", () => applyFloatingPosition());
    }

    renderPanel();
  }

  function sendHookConfig(command = "", extra = {}) {
    window.dispatchEvent(
      new CustomEvent(HOOK_EVENTS.configEvent, {
        detail: {
          enabled: state.enabled,
          gifId: state.selected?.gifId || "",
          command,
          ...extra,
        },
      })
    );
  }

  function bindHookStatusEvents() {
    window.addEventListener(HOOK_EVENTS.statusEvent, (event) => {
      const detail = event.detail || {};
      if (detail.type?.startsWith("group-")) return;
      if (detail.attemptId !== undefined) {
        if (detail.attemptId !== state.activeOperation?.id || detail.gifId !== state.activeOperation?.gifId) return;
        if (!state.requestPending) return;
      } else if (state.requestPending && ["error", "compatibility-error", "patched", "direct-submitted", "stage"].includes(detail.type)) {
        return;
      }
      if (detail.code) addDiagnostic("", detail.level || (detail.type === "error" || detail.type === "compatibility-error" ? "error" : "info"), detail.code, detail.errorCode);
      if (detail.type === "hook-started") {
        state.pageHookReady = true;
        addDiagnostic("", "success", "HOOK_READY");
      }

      if (detail.type === "ready") {
        if (detail.mode === "esm-direct") {
          const wasReady = state.directUpdaterReady;
          state.directUpdaterReady = true;
          state.directUpdaterFailed = false;
          state.diagnosticsOpen = false;
          state.chunkName = detail.chunkName || "";
          state.hookStatus = `直接更新入口已就绪${state.chunkName ? `：${state.chunkName}` : ""}。`;
          if (!wasReady) {
            addDiagnostic("", "success", "SERVICE_READY");
            addDiagnostic(`启动自检通过：已找到直接更新入口${state.chunkName ? `（${state.chunkName}）` : ""}。`, "success");
          }
        } else if (!state.directUpdaterReady) {
          state.hookStatus = `已找到旧版更新入口（${detail.count || 0} 个）。`;
        }
      } else if (detail.type === "patched") {
        if (detail.autoDisabled === false) {
          // upload 响应被改写只是第一步，SeaTalk 还要把该 ID 交给个人资料更新流程。
          // 此时不能提前关闭，否则后续 Worker / ContactUpdateUserInfo 就抓不到了。
          state.hookStatus = `已把上传结果改为 GIF ID，正在等待 SeaTalk 提交头像更新。`;
          addDiagnostic(`已改写上传返回字段：${detail.label || "未知入口"}。`, "success");
        } else {
          state.hookStatus = `已替换 avatar 为 ${detail.gifId}，可刷新确认头像。`;
          addDiagnostic(`已替换头像提交参数：${detail.label || "未知入口"}。`, "success");
          showSuccessCelebration(detail.gifId);
          state.enabled = false;
          clearPendingTimeout();
          clearDelayedLoading();
          state.activeAction = "";
          saveState();
        }
      } else if (detail.type === "stage") {
        state.hookStatus = detail.message || "更新流程正在进行。";
        addDiagnostic(state.hookStatus, detail.level === "error" ? "error" : "info");
      } else if (detail.type === "request-busy") {
        // Defensive rejection if the page still has a request unknown to this UI.
        // This is not a queued retry: no new avatar was submitted.
        state.requestPending = false;
        state.enabled = false;
        state.activeAction = "";
        clearPendingTimeout();
        clearVerificationTimer();
        clearDelayedLoading();
        state.hookStatus = t("requestStillPending");
        state.diagnosticsOpen = true;
      } else if (detail.type === "direct-submitted") {
        // 接口已经成功返回时，实际更新任务就完成了，立即恢复按钮。
        // 页面头像变化验证继续在后台运行，只负责补充最终确认，不再锁住操作按钮。
        state.enabled = false;
        state.requestPending = false;
        state.requestSlow = false;
        state.apiConfirmedGifId = detail.gifId;
        startAvatarVerification(state.activeOperation, detail.avatarResourceId || detail.gifId);
        clearPendingTimeout();
        clearDelayedLoading();
        state.activeAction = "";
        saveState();
        state.hookStatus = t("verificationConfirmed");
        addDiagnostic(t("diagnosticApiConfirmed"), "success", "API_SUCCESS");
        showSuccessCelebration(detail.gifId);
        sendHookConfig();
      } else if (detail.type === "compatibility-error") {
        state.directUpdaterReady = false;
        state.directUpdaterFailed = true;
        state.enabled = false;
        clearPendingTimeout();
        clearVerificationTimer();
        clearDelayedLoading();
        state.activeAction = "";
        state.chunkName = detail.chunkName || state.chunkName;
        state.hookStatus = detail.message || "没有找到可用的直接更新入口。";
        addDiagnostic(state.hookStatus, "error");
        state.diagnosticsOpen = true;
      } else if (detail.type === "waiting") {
        state.hookStatus = detail.message || "正在查找更新入口。";
      } else if (detail.type === "disabled") {
        // 这是内部一次性任务结束通知，不再展示成“替换已关闭”，避免让用户误以为操作失败。
      } else if (detail.type === "error") {
        state.requestPending = false;
        state.requestSlow = false;
        state.hookStatus = detail.message || "Hook 出错。";
        addDiagnostic(state.hookStatus, "error");
        if (detail.fallbackAvailable) {
          state.directUpdaterReady = false;
          state.directUpdaterFailed = true;
          addDiagnostic("自动入口确认不可用；可刷新页面或点击主按钮重新检查。", "info");
        }
        state.enabled = false;
        clearPendingTimeout();
        clearVerificationTimer();
        clearDelayedLoading();
        state.activeAction = "";
        state.diagnosticsOpen = true;
        saveState();
      }

      renderPanel();
    });
  }

  function injectPageHook() {
    let acknowledged = false;
    const onStarted = (event) => {
      if (event.detail?.type === "hook-started") acknowledged = true;
    };
    window.addEventListener(HOOK_EVENTS.statusEvent, onStarted);
    let failureCode = "HOOK_NO_ACK";
    try {
      if (typeof unsafeWindow === "undefined" || typeof unsafeWindow.Function !== "function") {
        failureCode = "PAGE_CONTEXT_UNAVAILABLE";
      } else {
        // Only our own bundled function and fixed event names are evaluated.
        // The page's Function gives import() and native hooks the page realm.
        // No DOM script insertion, CSP rewriting, or remote code evaluation.
        const start = unsafeWindow.Function(
          `"use strict"; (${pageHook.toString()})(${JSON.stringify(HOOK_EVENTS)});`
        );
        start();
      }
    } catch (_error) {
      // Do not expose arbitrary exception text that might contain private URLs.
      acknowledged = false;
      failureCode = "PAGE_CONTEXT_EXECUTION_BLOCKED";
    } finally {
      window.removeEventListener(HOOK_EVENTS.statusEvent, onStarted);
    }
    state.pageHookReady = acknowledged;
    if (!acknowledged) {
      window.dispatchEvent(new CustomEvent(HOOK_EVENTS.statusEvent, {
        detail: {
          type: "compatibility-error",
          message: t("hookStartFailed", { code: failureCode }),
          code: failureCode,
        },
      }));
    }
    return acknowledged;
  }

  function pageHook(events) {
    "use strict";

    if (window.__seatalkPersonalGifAvatarHookInstalled) {
      window.dispatchEvent(
        new CustomEvent(events.statusEvent, {
          detail: {
            type: window.__seatalkPersonalGifAvatarHookReady ? "hook-started" : "waiting",
            message: "页面 Hook 已安装，正在复用现有实例。",
          },
        })
      );
      return;
    }

    window.__seatalkPersonalGifAvatarHookInstalled = true;

/* Register the selected sticker for avatar use before updating personal info. */
async function applyRegisteredAvatar(gifId, adapters) {
  const fail = (code, errorCode = null) => {
    const error = new Error(code); error.flowCode = code; error.errorCode = errorCode; throw error;
  };
  const check = () => {
    if (!adapters.active()) fail('RESOURCE_OPERATION_CHANGED');
  };
  if (!/^[A-Za-z0-9]{64}$/.test(gifId) || !['b0701', 'b0705'].includes(gifId.slice(33, 38))) {
    fail('RESOURCE_INVALID');
  }
  const userId = adapters.accountId();
  if (!Number.isSafeInteger(userId) || userId <= 0) fail('ACCOUNT_MISSING');
  const accountCheck = () => { check(); if (adapters.accountId() !== userId) fail('RESOURCE_ACCOUNT_CHANGED'); };
  accountCheck();
  const profile = await adapters.profile(userId);
  accountCheck();
  if (!profile || typeof profile.name !== 'string' || typeof profile.avatar !== 'string') fail('RESOURCE_PROFILE_MISSING');
  adapters.report('RESOURCE_REGISTER_START');
  let registration;
  try { registration = await adapters.register(gifId); }
  catch (_) { fail('RESOURCE_REGISTER_ERROR'); }
  accountCheck();
  const code = registration?.errorCode;
  if (!registration || !Number.isInteger(registration.httpStatus) ||
      registration.httpStatus < 200 || registration.httpStatus >= 300 ||
      (code !== null && code !== undefined && Number(code) !== 0)) fail('RESOURCE_REGISTER_ERROR', code);
  const avatarId = registration.fileName;
  const expectedType = 'b03' + gifId.slice(33, 38).slice(3);
  if (typeof avatarId !== 'string' || !/^[A-Za-z0-9]{64}$/.test(avatarId) ||
      avatarId.slice(33, 38) !== expectedType) fail('RESOURCE_INVALID');
  adapters.report('RESOURCE_REGISTERED');
  let matches = false;
  try { matches = await adapters.sameContent(gifId, avatarId); }
  catch (_) { fail('RESOURCE_CONTENT_ERROR'); }
  accountCheck();
  if (!matches) fail('RESOURCE_CONTENT_ERROR');
  adapters.report('RESOURCE_CONTENT_VERIFIED');
  const latest = await adapters.profile(userId);
  accountCheck();
  if (latest?.name !== profile.name || latest?.avatar !== profile.avatar) fail('RESOURCE_PROFILE_CHANGED');
  adapters.report('API_PENDING');
  await adapters.update(userId, { name: profile.name, avatar: avatarId });
  accountCheck();
  return { avatarId };
}

    const runtime = {
      enabled: false,
      gifId: "",
      webpackRequire: null,
      wrappedCount: 0,
      wrappedFunctions: new WeakMap(),
      scannedObjects: new WeakSet(),
      networkHookInstalled: false,
      rewrittenUploadResponses: new WeakMap(),
      xhrResponseCache: new WeakMap(),
      uploadNoRewriteReported: false,
      messageHookInstalled: false,
      esmUpdater: null,
      esmSessionInfo: null,
      esmChunkUrl: "",
      esmDiscoveryPromise: null,
      esmDiscoveryFailedFor: "",
      directOperation: null,
      avatarFileSelectedAt: 0,
    };

    function isValidGifId(value) {
      return /^[a-zA-Z0-9]{32,}$/.test(String(value || ""));
    }

    function emit(detail) {
      window.dispatchEvent(
        new CustomEvent(events.statusEvent, {
          detail,
        })
      );
    }

    function getMainChunkStylesUrls() {
      const urls = Array.from(document.querySelectorAll("link[href], script[src]"))
        .map((element) => element.href || element.src || "")
        .filter((url) => /\/chunk-styles-[^/]+\.js(?:[?#]|$)/i.test(url));

      return Array.from(new Set(urls)).sort((left, right) => {
        const leftIsMain = /\/seatalk\/fe\/static\/js\/chunk-styles-/i.test(left) ? 0 : 1;
        const rightIsMain = /\/seatalk\/fe\/static\/js\/chunk-styles-/i.test(right) ? 0 : 1;
        return leftIsMain - rightIsMain;
      });
    }

    function findCurrentUserId() {
      const sessionUserId = runtime.esmSessionInfo?.userId;
      if (/^\d+$/.test(String(sessionUserId || ""))) {
        return Number(sessionUserId);
      }

      const candidateUrls = [];
      for (const image of Array.from(document.images)) {
        if (image.currentSrc || image.src) {
          candidateUrls.push(image.currentSrc || image.src);
        }
      }

      try {
        for (const entry of performance.getEntriesByType("resource")) {
          if (entry?.name) {
            candidateUrls.push(entry.name);
          }
        }
      } catch (_error) {
        // 浏览器禁止读取资源列表时，继续使用 DOM 图片地址。
      }

      for (const candidateUrl of candidateUrls) {
        if (!/haiserve\.com\/download\//i.test(candidateUrl)) {
          continue;
        }

        try {
          const userId = new URL(candidateUrl, location.href).searchParams.get("userid");
          if (/^\d+$/.test(String(userId || ""))) {
            return Number(userId);
          }
        } catch (_error) {
          const match = String(candidateUrl).match(/[?&]userid=(\d+)/i);
          if (match) {
            return Number(match[1]);
          }
        }
      }

      return 0;
    }

    async function discoverEsmUpdater({ reportFailure = true } = {}) {
      if (runtime.esmUpdater) {
        return true;
      }

      if (runtime.esmDiscoveryPromise) {
        return runtime.esmDiscoveryPromise;
      }

      runtime.esmDiscoveryPromise = (async () => {
        const chunkUrls = getMainChunkStylesUrls();
        if (!chunkUrls.length) {
          emit({
            type: reportFailure ? "compatibility-error" : "waiting",
            code: reportFailure ? "MODULE_MISSING" : "MODULE_WAIT",
            message: reportFailure
              ? "启动自检失败：等待后仍未发现主站 chunk-styles 文件。请刷新页面或重新检查。"
              : "SeaTalk 页面仍在加载，正在等待主站更新模块。",
          });
          return false;
        }

        for (const chunkUrl of chunkUrls) {
          let moduleNamespace = null;
          try {
            moduleNamespace = await import(chunkUrl);
          } catch (error) {
            runtime.esmDiscoveryFailedFor = chunkUrl;
            if (reportFailure) {
              emit({
                type: "stage",
                level: "error",
                code: "MODULE_IMPORT_FAILED",
                message: `自检无法导入 ${chunkUrl.split("/").pop() || "chunk-styles"}：${String(error?.message || error).slice(0, 180)}`,
              });
            }
            continue;
          }

          let updater = null;
          let sessionInfo = null;
          for (const value of Object.values(moduleNamespace)) {
            if (!value || (typeof value !== "object" && typeof value !== "function")) {
              continue;
            }

            if (
              !updater &&
              typeof value.updateUserInfo === "function" &&
              (value.onUserInfoChanged || value.onUserInfosChanged)
            ) {
              updater = value;
            }

            if (!sessionInfo && /^\d+$/.test(String(value.userId || ""))) {
              sessionInfo = value;
            }
          }

          if (!updater) {
            runtime.esmDiscoveryFailedFor = chunkUrl;
            continue;
          }

          runtime.esmUpdater = updater;
          runtime.esmSessionInfo = sessionInfo;
          runtime.esmChunkUrl = chunkUrl;
          runtime.esmDiscoveryFailedFor = "";
          emit({
            type: "ready",
            mode: "esm-direct",
            count: 1,
            chunkName: chunkUrl.split("/").pop() || chunkUrl,
          });
          return true;
        }

        const failedChunkName = chunkUrls[0]?.split("/").pop() || "chunk-styles";
        emit({
          type: reportFailure ? "compatibility-error" : "waiting",
          chunkName: failedChunkName,
          code: reportFailure ? "SERVICE_MISSING" : "MODULE_WAIT",
          message: reportFailure
            ? `启动自检失败：${failedChunkName} 中没有识别到用户资料 updateUserInfo 服务。SeaTalk 前端结构可能已变化。`
            : `已发现 ${failedChunkName}，正在等待用户资料服务完成加载。`,
        });
        return false;
      })();

      try {
        return await runtime.esmDiscoveryPromise;
      } finally {
        runtime.esmDiscoveryPromise = null;
      }
    }

    async function waitForEsmUpdater(timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      emit({
        type: "waiting",
        message: "正在等待 SeaTalk 用户资料更新模块加载，期间无需重复点击。",
      });

      while (Date.now() < deadline) {
        if (runtime.esmUpdater || (await discoverEsmUpdater({ reportFailure: false }))) {
          return true;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 500));
      }

      return discoverEsmUpdater({ reportFailure: false });
    }


    let groupRevision = 0, groupKey = "", groupOperation = null;
    function readGroupEditor() {
      const overlays = document.querySelectorAll(".chat-setting-name-wrapper .avatar-overlay");
      if (overlays.length !== 1) return null;
      const element = overlays[0];
      // The edit overlay is collapsed until hover; the containing editor is
      // the visibility boundary, while overlay presence indicates editability.
      const wrapper = element.closest(".chat-setting-name-wrapper");
      if (!wrapper || !wrapper.getClientRects().length) return null;
      let fiber = element[Object.keys(element).find(key => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"))];
      for (; fiber; fiber = fiber.return) {
        const props = fiber.memoizedProps;
        if (props?.info?.type === "group" && Number.isSafeInteger(props.info.id) && props.info.id > 0 &&
            typeof props.info.name === "string" && typeof props.actions?.actionChangeGroupInfo === "function") {
          return { id: props.info.id, name: props.info.name, icons: props.info.icons || [], avatarElement: wrapper.querySelector(".common-avatar"), action: props.actions.actionChangeGroupInfo };
        }
      }
      return null;
    }
    function groupAvatarMatches(editor, gifId) {
      if (editor.icons.length === 1 && editor.icons[0] === gifId) return true;
      // Only inspect the avatar containing this group's edit overlay, never chat GIFs.
      const avatar = editor.avatarElement;
      if (!avatar) return false;
      const urls = [];
      for (const node of [avatar, ...avatar.querySelectorAll("*")]) {
        if (node.tagName === "IMG") urls.push(node.currentSrc || node.src);
        const background = getComputedStyle(node).backgroundImage;
        for (const match of background.matchAll(/url\(["']?([^"')]+)["']?\)/g)) urls.push(match[1]);
      }
      return urls.some(value => {
        try { return new URL(value, location.href).pathname.split("/").some(part => part === gifId || (part.startsWith(gifId + "_") && /^\d+$/.test(part.slice(gifId.length + 1)))); }
        catch (_) { return false; }
      });
    }
    function refreshGroupContext() {
      const editor = readGroupEditor();
      const key = editor ? JSON.stringify([editor.id, editor.name]) : "";
      if (key !== groupKey) {
        groupKey = key; groupRevision++;
        emit({ type: "group-context", context: editor ? { id: editor.id, name: editor.name, revision: groupRevision } : null });
      }
      return editor;
    }
    function applyGroupAvatar(detail) {
      const editor = refreshGroupContext();
      const reject = () => emit({ type: "group-result", requestId: detail.requestId, code: "GROUP_TARGET_CHANGED" });
      if (groupOperation || runtime.directOperation || !editor || editor.id !== detail.id || editor.name !== detail.name ||
          groupRevision !== detail.revision || !Number.isSafeInteger(detail.requestId) || detail.requestId <= 0 || !isValidGifId(detail.gifId)) { reject(); return; }
      groupOperation = Object.freeze({ id: editor.id, gifId: detail.gifId, requestId: detail.requestId });
      const operation = groupOperation;
      try { editor.action({ gid: operation.id, info: { i: [operation.gifId] } }); }
      catch (_) { emit({ type: "group-result", requestId: detail.requestId, code: "GROUP_PENDING" }); return; } // A throw does not prove no request was sent.
      const started = Date.now();
      let pendingReported = false;
      const timer = window.setInterval(() => {
        const current = readGroupEditor();
        if (current?.id === operation.id && groupAvatarMatches(current, operation.gifId)) {
          window.clearInterval(timer); groupOperation = null;
          emit({ type: "group-result", requestId: operation.requestId, code: "GROUP_OBSERVED" });
        } else if (!pendingReported && Date.now() - started > 20000) {
          pendingReported = true;
          emit({ type: "group-result", requestId: operation.requestId, code: "GROUP_PENDING" });
        }
      }, 300);
    }
    window.setInterval(refreshGroupContext, 400);
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(refreshGroupContext).observe(document.body, { childList: true, subtree: true });
    }

    function startDirectAvatar(detail) {
      if (groupOperation) return;
      const operation = Object.freeze({ id: detail.attemptId, gifId: detail.gifId });
      if (runtime.directOperation) {
        emit({ type: "request-busy", code: "REQUEST_BUSY", level: "info",
          attemptId: operation.id, gifId: operation.gifId });
        return;
      }
      if (!Number.isSafeInteger(operation.id) || operation.id <= 0 || !isValidGifId(operation.gifId)) {
        emit({ type: "error", attemptId: operation.id, gifId: operation.gifId,
          message: "直接更新已取消：操作编号或 GIF ID 无效。" });
        return;
      }
      // Reserve synchronously, before awaiting discovery or API work. Direct
      // submissions do not use the legacy mutable upload-rewrite configuration.
      runtime.directOperation = operation;
      runtime.enabled = false;
      void applyDirectAvatar(operation);
    }


    function resourceUrl(fileUrl, id) {
      const url = new URL(fileUrl(id));
      if (url.protocol !== "https:" || url.hostname !== "f.haiserve.com" ||
          !url.pathname.startsWith("/download/" + id)) throw Error("RESOURCE_SERVICE_MISSING");
      return url;
    }
    async function discoverAvatarResourceServices() {
      const module = await import(runtime.esmChunkUrl);
      const values = Object.values(module);
      const fileUrl = values.find(value => typeof value === "function" &&
        String(value).includes("maxWidth") && String(value).includes("gfsToken") &&
        String(value).includes("blob:"));
      const urls = Array.from(document.querySelectorAll("link[href],script[src]")).map(el => el.href || el.src || "");
      const expected = new URL(runtime.esmChunkUrl);
      const candidates = [...new Set(urls)].filter(value => {
        try {
          const url = new URL(value, location.href);
          return url.protocol === "https:" && url.origin === expected.origin &&
            /\/seatalk\/fe\/static\/js\/chunk-src-[^/]+\.js$/.test(url.pathname);
        } catch (_) { return false; }
      });
      if (!fileUrl || candidates.length !== 1 || typeof runtime.esmUpdater.forceFetchInfo !== "function") {
        throw Error("RESOURCE_SERVICE_MISSING");
      }
      const accountModule = await import(candidates[0]);
      const sessions = [...new Set(Object.values(accountModule))].filter(value =>
        value && typeof value === "object" && value.loggedIn === true &&
        Number.isSafeInteger(value.userId) && value.userId > 0 &&
        typeof value.fileServerToken === "string" && value.fileServerToken.length > 0);
      if (sessions.length !== 1) throw Error("ACCOUNT_MISSING");
      return { session: sessions[0], fileUrl };
    }

    async function applyDirectAvatar(operation) {
      const report = (detail) => {
        if (runtime.directOperation === operation) {
          emit({ ...detail, attemptId: operation.id, gifId: operation.gifId });
        }
      };
      let result;
      try {
        const ready = await waitForEsmUpdater();
        if (runtime.directOperation !== operation) return;
        if (!ready || !runtime.esmUpdater) {
          result = { type: "error", code: "SERVICE_MISSING", fallbackAvailable: false,
            message: "直接更新失败：没有找到 SeaTalk 用户资料更新服务。请刷新页面或重新检查。" };
          return;
        }
        const services = await discoverAvatarResourceServices();
        const profile = async id => {
          const info = await runtime.esmUpdater.forceFetchInfo(id);
          const own = info?.find(item => item.userid === id)?.userInfo;
          return own ? { name: own.name, avatar: own.avatar } : null;
        };
        const registered = await applyRegisteredAvatar(operation.gifId, {
          active: () => runtime.directOperation === operation,
          accountId: () => services.session.loggedIn === true ? services.session.userId : 0,
          profile,
          report: code => report({ type: "stage", code }),
          register: async gifId => {
            const origin = resourceUrl(services.fileUrl, gifId).origin;
            const url = new URL("/refresh/", origin);
            url.searchParams.set("trace_id", Array.from(crypto.getRandomValues(new Uint32Array(2)),
              value => value.toString(16).padStart(8, "0")).join(""));
            const response = await fetch(url.href, {
              method: "POST", mode: "cors", cache: "no-cache", credentials: "omit",
              headers: { "Content-Type": "application/x-www-form-urlencoded", fid: gifId },
              body: new URLSearchParams({ userid: String(services.session.userId),
                token: services.session.fileServerToken, app: "11", from: "3" }).toString(),
              signal: AbortSignal.timeout(12000),
            });
            const data = await response.json();
            return { httpStatus: response.status, errorCode: data.ErrorCode ?? null, fileName: data.FileName };
          },
          sameContent: async (originalId, avatarId) => {
            const read = async id => {
              const response = await fetch(resourceUrl(services.fileUrl, id).href, { signal: AbortSignal.timeout(8000) });
              if (!response.ok) throw Error("RESOURCE_CONTENT_ERROR");
              const declared = Number(response.headers.get("Content-Length"));
              if (declared > 20 * 1024 * 1024) throw Error("RESOURCE_CONTENT_ERROR");
              const reader = response.body.getReader();
              const chunks = []; let size = 0;
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  size += value.byteLength;
                  if (size > 20 * 1024 * 1024) throw Error("RESOURCE_CONTENT_ERROR");
                  chunks.push(value);
                }
              } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
              if (!size) throw Error("RESOURCE_CONTENT_ERROR");
              const bytes = new Uint8Array(size); let offset = 0;
              for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
              return bytes;
            };
            const a = await read(originalId), b = await read(avatarId);
            return a.length === b.length && a.every((value, index) => value === b[index]);
          },
          update: (id, payload) => Reflect.apply(runtime.esmUpdater.updateUserInfo, runtime.esmUpdater, [id, payload]),
        });
        result = { type: "direct-submitted", avatarResourceId: registered.avatarId,
          chunkName: runtime.esmChunkUrl.split("/").pop() || "" };
      } catch (error) {
        const codes = new Set(["ACCOUNT_MISSING", "RESOURCE_REGISTER_ERROR", "RESOURCE_INVALID",
          "RESOURCE_CONTENT_ERROR", "RESOURCE_PROFILE_MISSING", "RESOURCE_PROFILE_CHANGED",
          "RESOURCE_ACCOUNT_CHANGED", "RESOURCE_OPERATION_CHANGED", "RESOURCE_SERVICE_MISSING"]);
        const code = codes.has(error?.flowCode || error?.message) ? (error.flowCode || error.message) : "API_ERROR";
        result = { type: "error", fallbackAvailable: false, code,
          errorCode: /^-?\d{1,6}$/.test(String(error?.errorCode ?? "")) ? String(error.errorCode) : null,
          message: code === "API_ERROR" ? "SeaTalk 头像更新失败；请检查脱敏错误码，未自动重试。"
            : "头像资源准备未完成，未提交个人头像更新；请检查诊断流程码。" };
      } finally {
        if (runtime.directOperation === operation) {
          // Release BEFORE terminal delivery so an immediate retry is accepted.
          runtime.directOperation = null;
          runtime.enabled = false;
          if (result) emit({ ...result, attemptId: operation.id, gifId: operation.gifId });
        }
      }
    }

    function getWebpackRequireFromChunk(chunkName) {
      const chunk = window[chunkName];
      if (!Array.isArray(chunk)) {
        return null;
      }

      let webpackRequire = null;
      const randomChunkId = `seatalk_personal_gif_avatar_${Date.now()}_${Math.random().toString(16).slice(2)}`;

      try {
        chunk.push([
          [randomChunkId],
          {},
          function (require) {
            webpackRequire = require;
          },
        ]);
      } catch (_error) {
        return null;
      }

      return webpackRequire;
    }

    function findWebpackRequire() {
      if (runtime.webpackRequire?.c) {
        return runtime.webpackRequire;
      }

      const chunkNames = Object.keys(window).filter((key) => /^webpackChunk/i.test(key));
      for (const chunkName of chunkNames) {
        const require = getWebpackRequireFromChunk(chunkName);
        if (require?.c) {
          runtime.webpackRequire = require;
          return require;
        }
      }

      return null;
    }

    function getPatchMode(fn) {
      if (typeof fn !== "function") {
        return "";
      }

      if (fn.__spgaWrapped) {
        return "";
      }

      let source = "";
      try {
        source = Function.prototype.toString.call(fn);
      } catch (_error) {
        return "";
      }

      // 头像上传路径有时只会构造 ContactUpdateUserInfo，avatar 字段可能在上游对象里。
      // 真正是否改写仍由运行时参数里有没有 avatar 决定，所以这里放宽匹配，避免漏拦截。
      if (source.includes("ContactUpdateUserInfo")) {
        return "contact-update";
      }

      // 7.21 版 SeaTalk 会先执行类似 new UserInfo(userid, name, avatar, personalStatus)。
      // 用户断点里修改的 n 正是第三个 avatar 参数，因此同时识别这个数据构造器。
      const assignsAvatar = /this\s*\.\s*avatar\s*=/.test(source);
      const assignsUserId = /this\s*\.\s*(?:userid|userId)\s*=/.test(source);
      const assignsStatus = /this\s*\.\s*personalStatus\s*=/.test(source);
      if (assignsAvatar && assignsUserId && assignsStatus) {
        return "avatar-constructor";
      }

      return "";
    }

    function looksLikeUserInfoPayload(value) {
      if (!value || typeof value !== "object") {
        return false;
      }

      if (value instanceof Node || value instanceof Event) {
        return false;
      }

      return "avatar" in value || ("name" in value && "personalStatus" in value);
    }

    function shouldSkipObject(value) {
      return (
        value instanceof Node ||
        value instanceof Event ||
        value instanceof Blob ||
        value instanceof File ||
        value instanceof FormData ||
        value instanceof ArrayBuffer
      );
    }

    function markPatched(label, options = {}) {
      const autoDisable = options.autoDisable !== false;

      if (autoDisable) {
        // 头像替换是一次性的。成功改写 ContactUpdateUserInfo 入参后立刻关闭，
        // 避免用户后续普通上传头像时继续被替换成 GIF ID。
        runtime.enabled = false;
      }

      emit({
        type: "patched",
        label,
        gifId: runtime.gifId,
        autoDisabled: autoDisable,
      });
    }

    function patchPayload(value, seen = new WeakSet(), depth = 0) {
      if (!value || typeof value !== "object" || depth > 5 || shouldSkipObject(value)) {
        return false;
      }

      if (!runtime.enabled || !isValidGifId(runtime.gifId)) {
        return false;
      }

      if (seen.has(value)) {
        return false;
      }
      seen.add(value);

      let changed = false;

      try {
        if (looksLikeUserInfoPayload(value)) {
          value.avatar = runtime.gifId;
          changed = true;
        }

        for (const key of Object.keys(value)) {
          const child = value[key];
          if (child && typeof child === "object" && patchPayload(child, seen, depth + 1)) {
            changed = true;
          }
        }
      } catch (_error) {
        return false;
      }

      return changed;
    }

    function patchArguments(args) {
      let changed = false;

      for (const arg of args) {
        if (patchPayload(arg)) {
          changed = true;
        }
      }

      return changed;
    }

    function wrapFunction(original, label, patchMode = "contact-update") {
      if (runtime.wrappedFunctions.has(original)) {
        return runtime.wrappedFunctions.get(original);
      }

      const wrapped = function (...args) {
        let changed = patchArguments(args);

        // 对应新版构造器的参数顺序：userid、name、avatar、personalStatus。
        // 第三个参数通常是刚上传 jpg/png 后返回的图片 ID，直接换成选中的 GIF ID。
        if (
          !changed &&
          patchMode === "avatar-constructor" &&
          runtime.enabled &&
          isValidGifId(runtime.gifId) &&
          args.length >= 3
        ) {
          args[2] = runtime.gifId;
          changed = true;
        }

        if (changed) {
          markPatched(label);
        }

        // ES class 只能通过 new 调用；普通函数则保持原来的 this 调用方式。
        if (new.target) {
          return Reflect.construct(original, args, new.target);
        }
        return Reflect.apply(original, this, args);
      };

      try {
        Object.defineProperty(wrapped, "name", {
          value: original.name || "wrappedContactUpdateUserInfo",
          configurable: true,
        });
      } catch (_error) {
        // 部分浏览器不允许改 function.name，忽略即可。
      }

      wrapped.__spgaWrapped = true;
      wrapped.__spgaOriginal = original;
      runtime.wrappedFunctions.set(original, wrapped);
      return wrapped;
    }

    function tryPatchObjectProperty(object, key, path) {
      let descriptor = null;

      try {
        descriptor = Object.getOwnPropertyDescriptor(object, key);
      } catch (_error) {
        return false;
      }

      if (!descriptor || typeof descriptor.value !== "function") {
        return false;
      }

      const original = descriptor.value;
      const patchMode = getPatchMode(original);
      if (!patchMode) {
        return false;
      }

      const wrapped = wrapFunction(original, `${path}.${String(key)}`, patchMode);

      try {
        Object.defineProperty(object, key, {
          ...descriptor,
          value: wrapped,
        });
        return true;
      } catch (_error) {
        try {
          object[key] = wrapped;
          return object[key] === wrapped;
        } catch (__error) {
          return false;
        }
      }
    }

    function scanExports(value, path, depth) {
      if (!value || depth > 4) {
        return 0;
      }

      const valueType = typeof value;
      if (valueType !== "object" && valueType !== "function") {
        return 0;
      }

      if (runtime.scannedObjects.has(value)) {
        return 0;
      }
      runtime.scannedObjects.add(value);

      let count = 0;
      const keys = [];

      try {
        keys.push(...Object.getOwnPropertyNames(value));
      } catch (_error) {
        return 0;
      }

      for (const key of keys) {
        if (key === "caller" || key === "callee" || key === "arguments") {
          continue;
        }

        if (tryPatchObjectProperty(value, key, path)) {
          count += 1;
          continue;
        }

        let child = null;
        try {
          child = value[key];
        } catch (_error) {
          continue;
        }

        if (child && (typeof child === "object" || typeof child === "function")) {
          count += scanExports(child, `${path}.${String(key)}`, depth + 1);
        }
      }

      return count;
    }

    function scanWebpackModules() {
      const require = findWebpackRequire();
      if (!require?.c) {
        // 当前 SeaTalk 主站已经从 webpack 改为 ESM/Vite。只在 ESM 入口也没就绪时提示，
        // 避免旧版扫描结果覆盖“直接更新入口已就绪”的新状态。
        if (!runtime.esmUpdater && !runtime.esmDiscoveryPromise) {
          emit({
            type: "waiting",
            message: "未找到旧版 webpack 运行时，正在改用 ESM chunk 自动发现。",
          });
        }
        return;
      }

      let count = 0;
      const cache = require.c;
      runtime.scannedObjects = new WeakSet();

      for (const moduleId of Object.keys(cache)) {
        const module = cache[moduleId];
        if (!module || !module.exports) {
          continue;
        }

        const patchMode = getPatchMode(module.exports);
        if (patchMode) {
          module.exports = wrapFunction(module.exports, `module:${moduleId}`, patchMode);
          count += 1;
          continue;
        }

        count += scanExports(module.exports, `module:${moduleId}`, 0);
      }

      if (count > 0) {
        runtime.wrappedCount += count;
        emit({
          type: "ready",
          count: runtime.wrappedCount,
        });
      } else if (!runtime.wrappedCount && !runtime.esmUpdater) {
        emit({
          type: "waiting",
          message: "未找到 ContactUpdateUserInfo 更新入口。打开左上角头像资料卡后可再等几秒。",
        });
      }
    }

    function patchJsonStringBody(body, label) {
      if (!runtime.enabled || !isValidGifId(runtime.gifId) || typeof body !== "string") {
        return body;
      }

      if (!body.includes("avatar")) {
        return body;
      }

      try {
        const parsed = JSON.parse(body);
        const changed = patchPayload(parsed);
        if (!changed) {
          return body;
        }

        markPatched(label);
        return JSON.stringify(parsed);
      } catch (_error) {
        return body;
      }
    }

    function patchPlainObjectBody(body, label) {
      if (!runtime.enabled || !isValidGifId(runtime.gifId) || !body || typeof body !== "object") {
        return body;
      }

      if (shouldSkipObject(body)) {
        return body;
      }

      const changed = patchPayload(body);
      if (!changed) {
        return body;
      }

      markPatched(label);
      return body;
    }

    function patchRequestInit(init, label) {
      if (!init || typeof init !== "object" || !("body" in init)) {
        return init;
      }

      const nextInit = { ...init };
      if (typeof nextInit.body === "string") {
        nextInit.body = patchJsonStringBody(nextInit.body, label);
      } else {
        nextInit.body = patchPlainObjectBody(nextInit.body, label);
      }

      return nextInit;
    }

    function isHaiserveUploadUrl(url) {
      const value = String(url || "");
      try {
        const parsed = new URL(value, location.href);
        return /(^|\.)haiserve\.com$/i.test(parsed.hostname) && /\/upload(?:[/?#]|$)/i.test(parsed.pathname);
      } catch (_error) {
        return /haiserve\.com\/upload(?:[?#/]|$)/i.test(value);
      }
    }

    function getFetchUrl(input) {
      if (typeof input === "string") {
        return input;
      }

      try {
        if (input instanceof Request) {
          return input.url || "";
        }
      } catch (_error) {
        return "";
      }

      try {
        if (input instanceof URL) {
          return input.href;
        }
      } catch (_error) {
        return "";
      }

      return "";
    }

    function rewriteUploadResponseText(text, label) {
      if (!runtime.enabled || !isValidGifId(runtime.gifId) || typeof text !== "string") {
        return text;
      }

      const oldText = text;
      let nextText = text;

      // 常见返回形态可能是 JSON：{"FileName":"xxx"} / {"filename":"xxx"} / {"url":"...download/xxx_600"}
      try {
        const parsed = JSON.parse(text);
        const changed = replaceIdsInUploadResponseObject(parsed);
        if (changed) {
          markPatched(label, { autoDisable: false });
          return JSON.stringify(parsed);
        }
      } catch (_error) {
        // 不是 JSON 时继续走文本替换。
      }

      nextText = nextText.replace(/(\/download\/)([A-Za-z0-9]{32,})(?=[_?/#.]|$)/g, `$1${runtime.gifId}`);

      // 上传接口响应通常只有一个刚上传图片 ID。这里只在 upload 响应中替换长 ID，
      // 不影响普通业务请求。
      nextText = nextText.replace(/\b[A-Za-z0-9]{48,}\b/g, runtime.gifId);

      if (nextText !== oldText) {
        markPatched(label, { autoDisable: false });
      }

      return nextText;
    }

    function replaceIdsInUploadResponseObject(value, seen = new WeakSet(), depth = 0) {
      if (!value || typeof value !== "object" || depth > 6 || shouldSkipObject(value)) {
        return false;
      }

      if (seen.has(value)) {
        return false;
      }
      seen.add(value);

      let changed = false;
      const idLikeKeys = /^(id|fid|fileid|file_id|filename|file_name|mediaid|media_id|imageid|image_id|avatar|url|uri|downloadurl|download_url)$/i;

      for (const key of Object.keys(value)) {
        const item = value[key];

        if (typeof item === "string") {
          let nextValue = item;

          if (item.includes("/download/")) {
            nextValue = item.replace(/(\/download\/)([A-Za-z0-9]{32,})(?=[_?/#.]|$)/g, `$1${runtime.gifId}`);
          } else if (idLikeKeys.test(key) && /^[A-Za-z0-9]{32,}$/.test(item)) {
            nextValue = runtime.gifId;
          }

          if (nextValue !== item) {
            value[key] = nextValue;
            changed = true;
          }
        } else if (item && typeof item === "object") {
          if (replaceIdsInUploadResponseObject(item, seen, depth + 1)) {
            changed = true;
          }
        }
      }

      return changed;
    }

    function rewriteXhrUploadResponse(xhr, label) {
      if (!runtime.enabled || !isValidGifId(runtime.gifId)) {
        return;
      }

      if (runtime.rewrittenUploadResponses.has(xhr)) {
        return;
      }

      let originalText = "";
      try {
        originalText = xhr.responseText;
      } catch (_error) {
        try {
          const response = xhr.response;
          if (response && typeof response === "object" && patchPlainObjectBody(response, label)) {
            runtime.rewrittenUploadResponses.set(xhr, response);
            return;
          }
        } catch (__error) {
          return;
        }
      }

      const rewrittenText = rewriteUploadResponseText(originalText, label);
      if (rewrittenText === originalText) {
        if (!runtime.uploadNoRewriteReported) {
          runtime.uploadNoRewriteReported = true;
          emit({
            type: "waiting",
            message: "已捕获 f.haiserve.com/upload 响应，但未在响应里找到可替换的图片 ID。需要查看该请求的 Response 内容继续适配。",
          });
        }
        return;
      }

      runtime.rewrittenUploadResponses.set(xhr, rewrittenText);

      try {
        Object.defineProperty(xhr, "responseText", {
          configurable: true,
          get() {
            return runtime.rewrittenUploadResponses.get(xhr) || rewrittenText;
          },
        });
      } catch (_error) {
        // 部分浏览器不允许覆盖 responseText，后面的 response 覆盖仍可能生效。
      }

      try {
        Object.defineProperty(xhr, "response", {
          configurable: true,
          get() {
            if (xhr.responseType && xhr.responseType !== "text") {
              return runtime.rewrittenUploadResponses.get(xhr) || rewrittenText;
            }
            return runtime.rewrittenUploadResponses.get(xhr) || rewrittenText;
          },
        });
      } catch (_error) {
        // 忽略只读属性覆盖失败。
      }
    }

    function rewriteXhrValueWhenRead(xhr, originalValue, responseName) {
      if (!runtime.enabled || !isValidGifId(runtime.gifId)) {
        return originalValue;
      }

      const requestUrl = xhr.__spgaRequestMeta?.url || "";
      if (!isHaiserveUploadUrl(requestUrl)) {
        return originalValue;
      }

      // 同一个响应可能会被 SeaTalk 多次读取。缓存改写结果，避免重复发送状态消息。
      let cache = runtime.xhrResponseCache.get(xhr);
      if (!cache) {
        cache = Object.create(null);
        runtime.xhrResponseCache.set(xhr, cache);
      }
      if (Object.prototype.hasOwnProperty.call(cache, responseName)) {
        return cache[responseName];
      }

      const label = `xhr-read:${responseName}:${requestUrl}`;
      let rewrittenValue = originalValue;

      if (typeof originalValue === "string") {
        rewrittenValue = rewriteUploadResponseText(originalValue, label);
      } else if (originalValue && typeof originalValue === "object" && !shouldSkipObject(originalValue)) {
        // responseType="json" 时浏览器直接返回对象，需要原地替换其中的图片 ID。
        if (replaceIdsInUploadResponseObject(originalValue)) {
          markPatched(label, { autoDisable: false });
        }
      }

      cache[responseName] = rewrittenValue;
      return rewrittenValue;
    }

    function installXhrResponseGetterHooks() {
      // 旧实现是在 load/readystatechange 事件里覆盖 responseText。
      // SeaTalk 自己的回调可能先执行并读走原值，所以 7.21 版必须在“读取属性”这一刻改写。
      for (const responseName of ["responseText", "response"]) {
        let descriptor = null;
        try {
          descriptor = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, responseName);
        } catch (_error) {
          continue;
        }

        if (!descriptor?.get || descriptor.configurable === false || descriptor.get.__spgaWrapped) {
          continue;
        }

        const originalGetter = descriptor.get;
        const wrappedGetter = function () {
          const originalValue = Reflect.apply(originalGetter, this, []);
          return rewriteXhrValueWhenRead(this, originalValue, responseName);
        };
        wrappedGetter.__spgaWrapped = true;

        try {
          Object.defineProperty(XMLHttpRequest.prototype, responseName, {
            ...descriptor,
            get: wrappedGetter,
          });
        } catch (_error) {
          // 浏览器若禁止修改原型 getter，仍保留下面的 load 事件兜底逻辑。
        }
      }
    }

    function installMessageHooks() {
      if (runtime.messageHookInstalled) {
        return;
      }
      runtime.messageHookInstalled = true;

      // 新版 SeaTalk 通过 DedicatedWorker / MessagePort 执行联系人更新。
      // 如果消息还保持普通对象形态，就在进入 Worker 前递归寻找 avatar 并替换。
      const targets = [
        [window.Worker?.prototype, "Worker.postMessage"],
        [window.MessagePort?.prototype, "MessagePort.postMessage"],
        [window.BroadcastChannel?.prototype, "BroadcastChannel.postMessage"],
      ];

      for (const [prototype, label] of targets) {
        if (!prototype || typeof prototype.postMessage !== "function" || prototype.postMessage.__spgaWrapped) {
          continue;
        }

        const originalPostMessage = prototype.postMessage;
        const wrappedPostMessage = function (message, ...rest) {
          let changed = false;
          try {
            changed = patchPayload(message);
          } catch (_error) {
            changed = false;
          }

          if (changed) {
            markPatched(label);
          }
          return Reflect.apply(originalPostMessage, this, [message, ...rest]);
        };
        wrappedPostMessage.__spgaWrapped = true;

        try {
          prototype.postMessage = wrappedPostMessage;
        } catch (_error) {
          // 某些浏览器对象不可写时跳过，不影响其他 hook。
        }
      }
    }

    function installNetworkHooks() {
      if (runtime.networkHookInstalled) {
        return;
      }
      runtime.networkHookInstalled = true;

      const originalFetch = window.fetch;
      if (typeof originalFetch === "function") {
        window.fetch = function patchedFetch(input, init) {
          let nextInput = input;
          let nextInit = init;
          const requestUrl = getFetchUrl(input);

          try {
            if (input instanceof Request) {
              // Request.body 只能读取一次，不能安全同步改写。这里保守处理 init.body。
              nextInit = patchRequestInit(init, "fetch:init");
            } else {
              nextInit = patchRequestInit(init, "fetch:init");
            }
          } catch (_error) {
            nextInput = input;
            nextInit = init;
          }

          const result = Reflect.apply(originalFetch, this, [nextInput, nextInit]);
          if (!isHaiserveUploadUrl(requestUrl)) {
            return result;
          }

          emit({
            type: "stage",
            message: `已捕获头像上传请求：${requestUrl}`,
          });

          return result.then((response) => {
            if (!runtime.enabled || !isValidGifId(runtime.gifId)) {
              return response;
            }

            return response
              .clone()
              .text()
              .then((text) => {
                const rewrittenText = rewriteUploadResponseText(text, `fetch:${requestUrl}`);
                if (rewrittenText === text) {
                  if (!runtime.uploadNoRewriteReported) {
                    runtime.uploadNoRewriteReported = true;
                    emit({
                      type: "stage",
                      level: "error",
                      message: `上传接口已返回 HTTP ${response.status}，但响应里没有找到 FileName/filename/图片 ID。`,
                    });
                  }
                  return response;
                }

                return new Response(rewrittenText, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: response.headers,
                });
              })
              .catch((error) => {
                emit({
                  type: "stage",
                  level: "error",
                  message: `读取上传响应失败：${String(error?.message || error).slice(0, 180)}`,
                });
                return response;
              });
          }).catch((error) => {
            emit({
              type: "stage",
              level: "error",
              message: `头像上传请求失败：${String(error?.message || error).slice(0, 180)}`,
            });
            throw error;
          });
        };
      }

      const originalOpen = XMLHttpRequest.prototype.open;
      const originalSend = XMLHttpRequest.prototype.send;

      // 必须先安装 getter hook，确保 SeaTalk 第一次读取上传响应时拿到的就是 GIF ID。
      installXhrResponseGetterHooks();
      installMessageHooks();

      XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
        this.__spgaRequestMeta = {
          method,
          url: String(url || ""),
        };
        return Reflect.apply(originalOpen, this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function patchedSend(body) {
        let nextBody = body;
        const requestUrl = this.__spgaRequestMeta?.url || "";

        try {
          const label = `xhr:${requestUrl || "unknown"}`;
          if (typeof body === "string") {
            nextBody = patchJsonStringBody(body, label);
          } else {
            nextBody = patchPlainObjectBody(body, label);
          }
        } catch (_error) {
          nextBody = body;
        }

        if (isHaiserveUploadUrl(requestUrl)) {
          const xhr = this;
          const label = `xhr-upload:${requestUrl}`;
          emit({
            type: "stage",
            message: `已捕获头像上传请求：${requestUrl}`,
          });
          const patchWhenDone = () => {
            if (xhr.readyState === 4) {
              if (xhr.status < 200 || xhr.status >= 300) {
                emit({
                  type: "stage",
                  level: "error",
                  message: `头像上传失败：HTTP ${xhr.status || 0} ${xhr.statusText || ""}`.trim(),
                });
              }
              rewriteXhrUploadResponse(xhr, label);
            }
          };

          try {
            xhr.addEventListener("readystatechange", patchWhenDone, true);
            xhr.addEventListener("load", patchWhenDone, true);
          } catch (_error) {
            // 忽略监听失败，原始上传流程继续。
          }
        }

        return Reflect.apply(originalSend, this, [nextBody]);
      };

      emit({
        type: "waiting",
        message: "已安装自动发现、上传响应和 Worker 诊断 Hook。",
      });
    }

    window.addEventListener(events.configEvent, (event) => {
      const detail = event.detail || {};
      if (detail.command === "apply-group") { applyGroupAvatar(detail); return; }
      if (detail.command === "apply-direct") {
        startDirectAvatar(detail);
        return;
      }
      if (runtime.directOperation) return;
      runtime.enabled = Boolean(detail.enabled);
      runtime.gifId = isValidGifId(detail.gifId) ? detail.gifId : "";

      if (detail.command === "avatar-file-selected") {
        runtime.avatarFileSelectedAt = Date.now();
        emit({
          type: "stage",
          message: `页面 Hook 已收到文件选择事件：${String(detail.fileName || "未命名文件")}`,
        });
      }


      if (!runtime.enabled) {
        emit({
          type: "disabled",
        });
      }

      scanWebpackModules();
      installNetworkHooks();
      discoverEsmUpdater({ reportFailure: false });
    });

    window.addEventListener("unhandledrejection", (event) => {
      if (!runtime.enabled) {
        return;
      }

      const reasonText = String(event.reason?.message || event.reason || "");
      if (!/worker\s+init\s+error/i.test(reasonText)) {
        return;
      }

      // DevTools 在断点暂停较久时，SeaTalk 的 Worker 初始化可能超时。
      // 这里只更新助手状态，不调用 preventDefault，也不隐藏网页自身的报错。
      runtime.enabled = false;
      emit({
        type: "error",
        message: "SeaTalk Worker 初始化失败。本次替换已关闭，请刷新页面后直接用助手上传，不要停在手动断点。",
      });
    });

    // SeaTalk 是单页应用，相关 chunk 可能在打开头像资料卡后才加载。
    // 定时扫描可以在模块后加载时自动补上 hook。
    scanWebpackModules();
    installNetworkHooks();
    discoverEsmUpdater({ reportFailure: false });
    window.setInterval(scanWebpackModules, 1800);
    window.setInterval(() => {
      if (!runtime.esmUpdater) {
        discoverEsmUpdater({ reportFailure: false });
      }
    }, 5000);
    window.__seatalkPersonalGifAvatarHookReady = true;
    emit({ type: "hook-started" });
  }


  // Collections are run in the page realm, where SeaTalk owns its React state.
  function openCollectionsWorkspace() {
    const hint = document.getElementById('spga-collections-hint');
    try {
      if (typeof unsafeWindow === "undefined" || typeof unsafeWindow.Function !== "function") throw new Error('page-context');
      unsafeWindow.Function(`return (${launchFavoritesGallery.toString()})(${JSON.stringify(LOCAL_GIF_PRESETS.map(({ label, gifId }) => ({ label, gifId })))}, ${JSON.stringify(state.locale)});`)();
      document.getElementById(PANEL_ID)?.classList.remove('spga-open');
      if (hint) hint.textContent = '';
    } catch (_) {
      if (hint) hint.textContent = groupText(
        '请先打开聊天输入框旁的表情按钮，切换到爱心收藏页签，再点击「我的表情」。若仍无法打开，请刷新后重试。',
        'Open the sticker picker beside the message composer, select Favorites (heart), then click My stickers. Reload if it still cannot open.'
      );
    }
  }

/* Integrated favorites window. Signed URLs and all workspace state stay in page memory. */
function launchFavoritesGallery(presets = [], initialLocale = 'zh') {
/* Only authored UI copy is translated; sticker names and share-code data are never translated. */
function createFavoritesLocalizer(initialLocale = 'zh') {
  let locale = initialLocale === 'en' ? 'en' : 'zh';
  const labels = {
    "整理、搜索、分享你的 SeaTalk 收藏表情，也能设置 GIF 头像。": "Organize, search and share your SeaTalk favorite stickers, and set GIF avatars.",
    "语言": "Language",
    "图片形式": "Image format",
    "全部形式": "All formats",
    "未知": "Unknown",
    "备注状态": "Note status",
    "全部备注": "All notes",
    "已备注": "With notes",
    "未备注": "Without notes",
    "需复核": "Needs review",
    "检测状态": "Inspection status",
    "全部检测状态": "All inspection states",
    "已识别": "Inspected",
    "识别失败": "Inspection failed",
    "自动识别": "Automatic detection",
    "动图（手动）": "Animated (manual)",
    "静态图（手动）": "Still image (manual)",
    "未知（手动）": "Unknown (manual)",
    "手动标注优先于检测结果；选择「自动识别」可撤销手动标注。未检测或识别失败也能编辑备注。保存备注后将解除「需复核」。": "Manual labels override detection. Select Automatic detection to remove the override. You can edit notes even without a successful inspection. Saving notes clears Needs review.",
    "「图片形式」按生效的动图、静态图或未知筛选；「备注状态」筛选已备注、未备注或需复核；「检测状态」单独查看未检测、已识别或识别失败。可先识别动图，也可在备注编辑中手动指定图片形式；手动标注优先，选择「自动识别」可恢复检测结果。未检测或识别失败不影响备注、搜索或分享。": "Image format filters the effective animated, still or unknown value. Note status filters notes or items needing review. Inspection status separately filters uninspected, inspected or failed images. Inspect animations or manually set a format in the note editor. Manual labels take priority; Automatic detection removes the override. Inspection is not required to edit, search or share notes.",
    "SeaTalk 表情助手": "SeaTalk Sticker Helper",
    "SeaTalk 表情助手 · 我的表情": "SeaTalk Sticker Helper · My stickers",
    "调整侧栏宽度": "Resize sidebar",
    "拖动此栏移动窗口": "Drag this bar to move the window",
    "使用指南": "Guide",
    "切换分栏与浮窗": "Switch between split view and floating window",
    "分栏": "Split view",
    "浮窗": "Float",
    "恢复默认位置和大小": "Reset window position and size",
    "收起我的表情": "Minimize favorites",
    "收起，保留当前选择": "Minimize and keep selections",
    "关闭批量管理": "Close favorites",
    "✕ 关闭": "✕ Close",
    "助手功能": "Helper tools",
    "GIF 头像": "GIF avatars",
    "我的表情": "My stickers",
    "搜索表情名称": "Search sticker names",
    "搜索收藏": "Search favorites",
    "显示范围": "Show",
    "全部收藏": "All favorites",
    "已选择": "Selected",
    "图片类型": "Image type",
    "全部类型": "All types",
    "动图": "Animated",
    "静态图": "Still image",
    "未检测": "Not inspected",
    "未能识别": "Could not identify",
    "识别动图": "Inspect animation",
    "导入口令": "Import code",
    "浏览和分享无需先识别动图。": "You can browse and share without inspecting animation.",
    "停止识别": "Stop inspection",
    "开发工具": "Developer tools",
    "导出已选 JSON": "Export selected JSON",
    "查看全部收藏": "Show all favorites",
    "首页": "First",
    "上一页": "Previous",
    "下一页": "Next",
    "末页": "Last",
    "跳至": "Page",
    "页": "",
    "跳转页码": "Page number",
    "跳转": "Go",
    "已选择 0 个": "0 selected",
    "先选择要分享或删除的表情。": "Select stickers to share or remove.",
    "全选本页": "Select page",
    "查看已选": "Review selected",
    "清空选择": "Clear selection",
    "生成分享口令": "Share code",
    "删除所选表情": "Remove selected",
    "调整窗口大小": "Resize window",
    "拖动调整大小，也可用方向键调整": "Drag to resize, or use the arrow keys",
    "我的表情使用指南": "My stickers guide",
    "关闭使用指南": "Close guide",
    "开始前": "Before you start",
    "在 SeaTalk 打开表情面板，切换到爱心「收藏」页签，再打开助手的「我的表情」。": "Open SeaTalk's sticker picker, select the heart Favorites tab, then open My stickers in the helper.",
    "选择和查看表情": "Select and preview stickers",
    "点击图片可放大，勾选复选框可选择。「全选本页」只选择当前页；翻页或切换筛选后，之前的选择仍会保留。点击「查看已选」可统一核对。": "Click an image to enlarge it and check its box to select it. Select page affects only the current page. Paging and filtering keep earlier selections. Use Review selected to check them all.",
    "如需只看动图，先点击「识别动图」，再筛选「动图」。浏览和分享无需先识别。识别失败的图片会显示「未能识别」，不会当成静态图。": "To show only animations, first choose Inspect animation, then filter by Animated. Browsing and sharing need no inspection. Failed images appear as Could not identify, rather than still images.",
    "分享给朋友": "Share with friends",
    "选择表情 → 点击「生成分享口令」→ 复制完整口令发给朋友。": "Select stickers → Share code → Copy the complete code and send it to a friend.",
    "每次最多分享 100 个。表情越多，口令越长。点击名称旁的编辑按钮可修改分享名称，不会修改 SeaTalk 原收藏。": "Share up to 100 stickers per code. More stickers produce a longer code. Edit a name beside a sticker to change its share name; the SeaTalk favorite is not renamed.",
    "添加朋友分享的表情": "Add stickers shared by friends",
    "点击「导入口令」→ 粘贴完整口令 → 点击「解析并预览」→ 选择表情 → 确认添加。": "Import code → Paste the complete code → Parse and preview → Select stickers → Confirm adding them.",
    "已收藏的表情不会重复添加，但可以导入备注。已有备注默认保留，并合并去重关键词；也可逐条选择使用朋友的备注。预览失败的新表情暂时不能添加。": "Existing favorites are not added again, but their notes can be imported. Your notes are kept and keywords merged by default. You can choose a friend's notes for each sticker. New stickers with failed previews cannot be added.",
    "删除不需要的收藏": "Remove unwanted favorites",
    "选择表情 → 点击「删除所选表情」→ 核对图片和数量 → 确认删除。": "Select stickers → Remove selected → Check the images and count → Confirm removal.",
    "删除只影响你的收藏，不会删除聊天消息。本助手无法撤销删除，分享口令也不保证能恢复。筛选之外的已选表情也会包括在确认清单中。": "Removal affects only your favorites, not chat messages. The helper cannot undo removal, and a share code does not guarantee recovery. The confirmation includes selected stickers outside the current filter.",
    "收起、关闭和结果核对": "Minimize, close and check results",
    "点击顶栏「−」可收起为小入口，保留页码、筛选、勾选和识别进度；点击入口可恢复。宽屏时自动分栏，SeaTalk 在左侧、助手在右侧；拖动分隔线调整宽度。点击「浮窗」可切换为自由窗口，再拖动顶栏移动、拖动右下角调整大小。收起或关闭后恢复原页面布局。": "Use − to minimize while keeping your page, filters, selections and inspection progress. Click the small entry to restore. Wide screens use split view with SeaTalk on the left; drag the divider to resize. Choose Float to move the window by its title bar or resize its lower-right corner. Closing or minimizing restores SeaTalk's original layout.",
    "操作结果不确定时，先刷新 SeaTalk 核对收藏，再决定是否重试。刷新会清空本次勾选。添加或删除进行中时，停止会等待当前表情的结果，再停止后续操作。": "If a result is uncertain, reload SeaTalk and check favorites before retrying. Reloading clears selections. During add or removal, Stop waits for the current sticker result before stopping later items.",
    "知道了，返回管理": "Got it",
    "表情预览": "Sticker preview",
    "关闭预览": "Close preview",
    "放大预览": "Enlarged preview",
    "返回管理": "Back to favorites",
    "分享所选表情": "Share selected stickers",
    "关闭分享": "Close sharing",
    "复制完整口令发给朋友，对方可在「导入口令」中预览并添加。": "Copy the complete code and send it to a friend. They can preview and add it with Import code.",
    "分享口令": "Share code",
    "复制分享口令": "Copy share code",
    "关闭导入": "Close import",
    "粘贴好友的完整口令，先预览并选择，再确认添加。": "Paste the complete code, preview and select stickers, then confirm adding them.",
    "粘贴分享口令": "Paste share code",
    "解析并预览": "Parse and preview",
    "全选可添加": "Select available",
    "取消": "Cancel",
    "停止后续添加": "Stop adding",
    "确认添加所选表情": "Add selected stickers",
    "从我的表情中移除": "Remove from my favorites",
    "关闭删除确认": "Close removal confirmation",
    "删除后无法在本助手撤销。口令不保证能恢复，请核对以下表情。": "The helper cannot undo removal, and a code does not guarantee recovery. Check the stickers below.",
    "停止后续删除": "Stop removal",
    "确认删除": "Confirm removal",
    "开发者导出": "Developer export",
    "关闭导出": "Close export",
    "导出 JSON": "Export JSON",
    "下载 JSON": "Download JSON",
    "复制 JSON": "Copy JSON",
    "请先打开 SeaTalk 表情面板，切换到爱心「收藏」，再打开「我的表情」。": "Open SeaTalk's sticker picker, select the heart Favorites tab, then open My stickers.",
    "请先打开 SeaTalk 爱心收藏面板，再重新操作。": "Open SeaTalk's heart Favorites tab, then try again.",
    "当前账号尚未核对，请稍后重新打开。": "The account has not been verified yet. Reopen favorites shortly.",
    "每次最多分享 100 个，请分批选择。": "Select up to 100 stickers per share code.",
    "翻页和筛选会保留选择。": "Paging and filtering keep your selections.",
    "每次最多分享 100 个": "Share up to 100 stickers per code",
    "先选择表情": "Select stickers first",
    "请先刷新核对上次删除结果": "Reload and check the previous removal result first",
    "删除所有已选表情，下一步核对清单": "Remove all selected stickers after reviewing the list",
    "返回筛选": "Back to filters",
    " · 正在识别": " · Inspecting",
    " · 正在添加": " · Adding",
    " · 正在删除": " · Removing",
    "正在识别图片类型": "Inspecting image types",
    "先识别图片类型，再筛选": "Inspect image types before filtering",
    "当前没有符合条件的已选表情": "No selected stickers match these filters",
    "没有找到符合条件的表情": "No stickers match these filters",
    "识别完成后，这里会显示符合筛选条件的表情。": "Matching stickers will appear here after inspection.",
    "未检测的表情还没有分类。识别只用于区分动图和静态图，浏览和分享不受影响。": "Uninspected stickers are not classified yet. Inspection separates animations from still images; you can browse and share without it.",
    "可以调整搜索或筛选条件。之前在其他页选择的表情仍会保留。": "Try a different search or filter. Your selections on other pages are kept.",
    "正在等待当前结果，随后停止。": "Waiting for the current result before stopping.",
    "放大预览 ": "Preview ",
    "预览加载失败": "Preview could not load",
    "分享名称 ": "Share name: ",
    "编辑分享名称 ": "Edit share name: ",
    "只修改分享名称": "Edit only the share name",
    "保存": "Save",
    "选择此表情": "Select this sticker",
    "选择": "Select",
    "正在停止后续操作，请等待当前结果后关闭。": "Stopping later operations. Wait for the current result before closing.",
    "请先填写已选表情的分享名称。": "Enter a share name for each selected sticker first.",
    "已复制": "Copied",
    "请按 ⌘C / Ctrl+C 复制": "Press ⌘C / Ctrl+C to copy",
    "无法核对当前账号，添加和删除已停用。请刷新 SeaTalk 后重新打开。": "The current account could not be verified. Adding and removal are disabled. Reload SeaTalk and reopen favorites.",
    "已经完成分类，无需重复检测。": "Classification is complete. No need to inspect again.",
    "已停止识别，已完成的分类仍然保留。": "Inspection stopped. Completed classifications are kept.",
    "收藏列表已变化，已停止。": "The favorites list changed. Operation stopped.",
    "本次结果未确认，已停止。": "The result is unconfirmed. Operation stopped.",
    "删除请求未确认，已停止后续操作。": "Removal was not confirmed. Later operations stopped.",
    "已停止后续删除。": "Later removals stopped. ",
    "请先打开 SeaTalk 爱心收藏面板": "Open SeaTalk's heart Favorites tab first",
    "无法生成安全的表情预览": "A safe sticker preview could not be created",
    "未识别当前收藏服务，请登录 SeaTalk 后刷新": "Favorites service unavailable. Sign in to SeaTalk and reload.",
    "SeaTalk 收藏服务结构已变化，请停止操作并反馈": "The SeaTalk favorites service changed. Stop and report the issue.",
    "分享口令已复制，发给朋友即可。": "Share code copied. You can send it to a friend.",
    "请按 ⌘C / Ctrl+C 复制完整口令。": "Press ⌘C / Ctrl+C to copy the complete code.",
    "正在停止后续添加，等待当前表情结果…": "Stopping later additions. Waiting for the current sticker result…",
    "口令已变化，请重新解析预览。": "The code changed. Parse and preview it again.",
    "正在准备预览…": "Preparing previews…",
    "请先登录 SeaTalk": "Sign in to SeaTalk first",
    "添加 ": "Add ",
    "已收藏 · 自动跳过": "Already saved · Skipped",
    "等待预览": "Waiting for preview",
    "预览就绪 · 可添加": "Preview ready · Can add",
    "图片尺寸无效": "Invalid image dimensions",
    "预览不可用 · 不可添加": "Preview unavailable · Cannot add",
    "；请刷新收藏核对后再操作。": " Reload and check favorites before continuing.",
    "已收藏": "Saved",
    "无法核对窗口所属账号，请刷新 SeaTalk 后重新打开。": "The window's account could not be verified. Reload SeaTalk and reopen favorites.",
    "登录账号已变化，已停止操作。请刷新 SeaTalk 后重新打开。": "The signed-in account changed. Operation stopped. Reload SeaTalk and reopen favorites.",
    "请选择 1–100 个表情": "Select 1–100 stickers",
    "口令包含无效的表情或名称": "The code contains an invalid sticker or name",
    "口令过长或无效，最多支持 100 个表情": "The code is too long or invalid. Up to 100 stickers are supported.",
    "请粘贴完整的 STGIF1 分享口令": "Paste the complete STGIF1 share code",
    "分享口令损坏或内容无效，请重新复制": "The code is damaged or invalid. Copy it again.",
    "请先预览并选择可添加的表情": "Preview and select available stickers first",
    "账号或窗口状态已变化，已停止添加": "The account or window changed. Adding stopped.",
    "添加请求未确认，已停止后续操作": "The addition was not confirmed. Later operations stopped.",
    "添加结果尚未确认，已停止。请刷新收藏核对，勿立即重复添加": "The addition is unconfirmed. Operation stopped. Reload favorites and check before adding again.",
    "请刷新 SeaTalk 核对保存结果。": "Reload SeaTalk to check saved results.",
    "设置": "Settings",
    "搜索名称、关键词或表情文字": "Search notes, keywords or text",
    "发送所选表情": "Send selected",
    "发送到当前会话": "Send to this conversation",
    "附带备注名称、关键词与表情文字（不含私人说明）": "Include names, keywords and sticker text (no private notes)",
    "同时导入备注，已有备注默认保留": "Import notes too; keep existing notes by default",
    "编辑备注与关键词": "Edit notes and keywords",
    "关闭备注编辑": "Close note editor",
    "备注名称": "Display name",
    "关键词": "Keywords",
    "用逗号分隔，例如：工作，上班，打工人": "Separate keywords with commas, e.g. work, office, busy",
    "表情文字": "Text on the sticker",
    "私人说明（默认不分享）": "Private note (not shared by default)",
    "保存在当前账号的油猴本地存储中，不会修改 SeaTalk 收藏原名称。": "Saved in Tampermonkey for the current account. SeaTalk favorite names are not changed.",
    "保存到本机": "Save locally",
    "个人备注备份与恢复": "Back up and restore notes",
    "关闭个人设置": "Close settings",
    "备份包含全部备注、关键词、表情文字与私人说明，不含图片、账号或登录凭据。导入只恢复备注，不会添加、删除或发送表情。": "Backups contain all names, keywords, sticker text and private notes, without images, accounts or credentials. Import restores notes only; it does not add, remove or send stickers.",
    "导出个人备份": "Export personal backup",
    "选择备份或标签文件": "Choose a backup or label file",
    "已有备注默认保留；可逐条选择使用导入备注。AI 需复核项默认不勾选。": "Keep existing notes by default, or choose imported notes individually. AI items needing review are not selected by default.",
    "合并并去重关键词": "Merge and deduplicate keywords",
    "全选（含需复核项）": "Select all (including review items)",
    "选择无需复核项": "Select items not needing review",
    "清空勾选": "Clear selection",
    "确认导入备注": "Confirm importing notes",
    "确认发送表情": "Confirm sticker send",
    "关闭发送确认": "Close send confirmation",
    "只发送本次确认的表情；切换账号或会话后停止。结果未确认时不会自动重发。": "Send only the stickers confirmed here. Changing accounts or conversations stops the operation. Unconfirmed sends are never retried automatically.",
    "停止后续发送": "Stop later sends",
    "确认发送": "Confirm send",
    "备注、备份与发送": "Notes, backups and sending",
    "备注自动保存在当前账号的油猴本地存储。可在「设置」导出备份或预览导入标签文件。分享可附带备注，但不包含私人说明。含备注的分享口令需要 5.1 或更新版本；取消附带备注可生成兼容旧版的口令。预览或选择表情后，核对目标会话并确认发送；切换账号或会话后停止。": "Notes are saved in Tampermonkey for the current account. Use Settings to export a backup or preview imported labels. Share codes can include notes, but never private notes. Codes with notes require version 5.1 or later. Uncheck metadata to create a code compatible with older versions. Preview or select stickers, check the destination and confirm sending. Changing accounts or conversations stops the operation.",
    "每次最多分享 100 个。表情越多，口令越长。点击名称旁的编辑按钮可保存备注、关键词和表情文字，用于搜索，不会修改 SeaTalk 原收藏。": "Share up to 100 stickers per code. More stickers produce longer codes. Edit a sticker to save its name, keywords and visible text for searching. SeaTalk favorites are not renamed.",
    "请粘贴完整的 STGIF1 或 STGIF2 分享口令": "Paste the complete STGIF1 or STGIF2 share code"
};
  const messages = new Map();
  function ui(zh, en) {
    const pair = [zh, en]; messages.set(zh, pair); messages.set(en, pair);
    return pair[locale === 'en' ? 1 : 0];
  }
  function textFor(value, target) {
    const index = target === 'en' ? 1 : 0;
    if (messages.has(value)) return messages.get(value)[index];
    if (Object.hasOwn(labels, value)) return index ? labels[value] : value;
    return value;
  }
  function tr(value) {
    if (Object.hasOwn(labels, value)) return ui(value, labels[value]);
    return textFor(value, locale);
  }
  function bindStatic(root) {
    const bindings = [];
    const visit = node => {
      if (node.nodeType === 3) {
        const value = node.textContent, key = value.trim();
        if (Object.hasOwn(labels, key)) bindings.push(() => { if (node.isConnected) node.textContent = value.replace(key, tr(key)); });
      } else if (node.nodeType === 1 && node.tagName !== 'STYLE') {
        for (const name of ['aria-label', 'title', 'placeholder', 'alt']) {
          const value = node.getAttribute(name);
          if (Object.hasOwn(labels, value)) bindings.push(() => node.setAttribute(name, tr(value)));
        }
        for (const child of node.childNodes) visit(child);
      }
    };
    for (const child of root.childNodes) visit(child);
    return () => bindings.forEach(apply => apply());
  }
  return { ui, tr, textFor, bindStatic, setLocale(value) { locale = value === 'en' ? 'en' : 'zh'; }, get locale() { return locale; } };
}

  const language = createFavoritesLocalizer(initialLocale);
  const { ui, tr } = language;
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

/* Bind a collection snapshot once; evaluate the live native account before every mutation. */
function nativeWorkspaceAccountId(services) {
  try {
    const id = typeof services?.accountId === 'function' ? services.accountId()
      : services?.session?.loggedIn === true ? services.session.userId : 0;
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  } catch (_) { return 0; }
}
function createWorkspaceAccountGuard(services, originalSource, currentSource) {
  const id = nativeWorkspaceAccountId(services);
  if (!id || currentSource() !== originalSource) throw Error('无法核对窗口所属账号，请刷新 SeaTalk 后重新打开。');
  return () => {
    if (nativeWorkspaceAccountId(services) !== id) throw Error('登录账号已变化，已停止操作。请刷新 SeaTalk 后重新打开。');
    return id;
  };
}

  const existing = document.getElementById('st-favorites-curator');
  if (existing) { existing.__setLocale?.(initialLocale); existing.__open?.(); return { reopened: true }; }
  const pickerSelector = '.sealabs-stickers-panel .sealabs-sticker, .sealabs-stickers-panel .sticker-wrapper';
  const seed = document.querySelector(pickerSelector);
  if (!seed) throw Error(tr('请先打开 SeaTalk 表情面板，切换到爱心「收藏」，再打开「我的表情」。'));
  function readSource(element, requireActions = true) {
    let fiber = element?.[Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'))];
    let list, actions;
    for (let count = 0; fiber && count < 24; count++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.isCustomTab === true && Array.isArray(props.stickers)) list = props.stickers;
      if (props?.actions?.actionRemoveCustomStickers) actions = props.actions;
    }
    if (!list || requireActions && !actions) throw Error(tr('请先打开 SeaTalk 爱心收藏面板，再重新操作。'));
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
    const number = items.length + 1, providedName = known.get(item.id) || item.name;
    const generatedName = providedName ? null : ui(`收藏 ${number}`, `Favorite ${number}`);
    items.push({ gifId: item.id, url: url.href, label: String(providedName || generatedName).slice(0, 80),
      originalLabel: String(providedName || generatedName).slice(0,80), number, generatedName, existing: known.has(item.id), selected: false, animation: 'unknown' });
  }
  let sendingBusy = false, sendPreparing = false, metadataSaving = false, zoomItem = null;
  let scanning = false, scanCancelled = false, deleting = false, stop = false, deleteNeedsReview = false;
  let workspaceAccountCheck = null, workspaceAccountState = 'pending';
  const assertWorkspaceAccount = () => { if (!workspaceAccountCheck) throw Error(tr('当前账号尚未核对，请稍后重新打开。')); return workspaceAccountCheck(); };
  let page = 0, pending = [], selectedView = null, geometryCustom = false;
  const size = 48, activeRequests = new Set();
  const host = document.createElement('section'); host.id = 'st-favorites-curator';
  host.dataset.open = host.dataset.managed = 'true';
  host.dataset.locale = language.locale; host.lang = language.locale;
  host.setAttribute('aria-label', tr('SeaTalk 表情助手 · 我的表情'));
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
    .workspace-language{display:flex;gap:2px;padding:3px;border:1px solid #d0d5dd;border-radius:10px;background:#edf2f7}.workspace-language button{border:0;background:transparent;color:#59677b;font-size:12px;padding:5px 8px;min-height:28px}.workspace-language [aria-pressed=true]{background:#fff;color:#0866c6;font-weight:600;box-shadow:0 1px 4px #152b4620}@container(max-width:700px){#dragHandle{flex-wrap:wrap}#dragHandle h1{flex-basis:calc(100% - 30px)}.window-controls{width:100%;justify-content:flex-end;flex-wrap:wrap}.workspace-language{margin-right:auto}}
    .filter-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.filter-toolbar label{display:flex;flex:1;min-width:115px;flex-direction:column;gap:4px;font-size:12px;color:#667085}.filter-toolbar select{width:100%;min-width:0;font-size:13px}.metadata-form label{display:flex;flex-direction:column;gap:6px;margin:0 0 14px;font-size:13px}.metadata-form textarea{height:75px;font:inherit}.metadata-choice{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:12px}.file-label{font-size:12px}.file-label input{display:block;max-width:100%;margin-top:6px}.metadata-import-list{max-height:38dvh;overflow:auto;margin-top:12px}.metadata-import-row{padding:10px 0;border-top:1px solid #e4e7ec}.metadata-import-row label{display:flex;align-items:center;gap:8px}.metadata-import-row p{font-size:12px;overflow-wrap:anywhere}.metadata-import-row select{max-width:100%}.import-card select{width:100%;font-size:11px;padding:5px}.selection-bar{flex-wrap:wrap}.selection-message{min-width:100%;display:flex;align-items:center;gap:10px}.selection-bar>.spacer{display:none}
  </style>
  <button id="dockDivider" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" hidden></button><section class="app">
    <div id="dragHandle" title="拖动此栏移动窗口"><span class="grip" aria-hidden="true">⠿</span><h1>SeaTalk 表情助手</h1><div class="window-controls"><div class="workspace-language" role="group" aria-label="语言"><button data-workspace-locale="zh" aria-pressed="false">中文</button><button data-workspace-locale="en" aria-pressed="false">EN</button></div><button id="guideOpen">使用指南</button><button id="settingsOpen">设置</button><button id="dockToggle" aria-label="切换分栏与浮窗" disabled>分栏</button><button id="resetPosition" class="icon-button" aria-label="恢复默认位置和大小" title="恢复默认位置和大小">↺</button><button id="minimize" class="icon-button" aria-label="收起我的表情" title="收起，保留当前选择">−</button><button id="close" class="danger-fill" aria-label="关闭批量管理">✕ 关闭</button></div></div>
    <nav class="workspace-tabs" aria-label="助手功能" role="tablist"><button id="backAvatar" role="tab" aria-selected="false">GIF 头像</button><button role="tab" aria-selected="true" aria-current="page">我的表情</button></nav>
    <header><p id="summary"></p><div class="toolbar"><input id="search" type="search" placeholder="搜索名称、关键词或表情文字" aria-label="搜索收藏"><select id="filter" aria-label="显示范围"><option value="all">全部收藏</option><option value="selected">已选择</option></select><button id="scan">识别动图</button><button id="importOpen">导入口令</button></div><div class="filter-toolbar"><label>图片形式<select id="animation" aria-label="图片形式"><option value="all">全部形式</option><option value="animated">动图</option><option value="static">静态图</option><option value="unknown">未知</option></select></label><label>备注状态<select id="metadataFilter" aria-label="备注状态"><option value="all">全部备注</option><option value="annotated">已备注</option><option value="unannotated">未备注</option><option value="review">需复核</option></select></label><label>检测状态<select id="detectionFilter" aria-label="检测状态"><option value="all">全部检测状态</option><option value="unknown">未检测</option><option value="recognized">已识别</option><option value="failed">识别失败</option></select></label></div><div class="status-row"><span id="scanStatus" role="status">浏览和分享无需先识别动图。</span><button id="scanStop" hidden>停止识别</button></div><details id="hiddenTools" hidden><summary>开发工具</summary><button id="export">导出已选 JSON</button></details></header>
    <main><div class="grid"></div><div id="emptyState" class="empty" hidden><h2 id="emptyTitle"></h2><p id="emptyMessage"></p><button id="emptyScan" hidden>识别动图</button><button id="emptyReset">查看全部收藏</button></div></main>
    <footer><div class="pagination"><button id="first">首页</button><button id="prev">上一页</button><span id="page"></span><button id="next">下一页</button><button id="last">末页</button><label>跳至 <input id="jump" type="number" min="1" step="1" value="1" aria-label="跳转页码"> 页</label><button id="jumpGo">跳转</button></div><div class="selection-bar"><div class="selection-message"><span id="count">已选择 0 个</span><div id="selectionHint">先选择要分享或删除的表情。</div></div><button id="selectPage">全选本页</button><button id="viewSelected">查看已选</button><button id="clear">清空选择</button><span class="spacer"></span><button id="sendSelected" class="primary">发送所选表情</button><button id="shareOpen">生成分享口令</button><button id="remove" class="danger">删除所选表情</button></div></footer><button id="resizeHandle" aria-label="调整窗口大小" title="拖动调整大小，也可用方向键调整"></button>
  </section>
  <dialog id="guideDialog" aria-labelledby="guideTitle"><div class="dialog-header"><h2 id="guideTitle">我的表情使用指南</h2><button data-close="guideDialog" aria-label="关闭使用指南">×</button></div><div class="dialog-body guide"><p>整理、搜索、分享你的 SeaTalk 收藏表情，也能设置 GIF 头像。</p>
    <section><h3>开始前</h3><p>在 SeaTalk 打开表情面板，切换到爱心「收藏」页签，再打开助手的「我的表情」。</p></section>
    <section><h3>选择和查看表情</h3><p>点击图片可放大，勾选复选框可选择。「全选本页」只选择当前页；翻页或切换筛选后，之前的选择仍会保留。点击「查看已选」可统一核对。</p><p>「图片形式」按生效的动图、静态图或未知筛选；「备注状态」筛选已备注、未备注或需复核；「检测状态」单独查看未检测、已识别或识别失败。可先识别动图，也可在备注编辑中手动指定图片形式；手动标注优先，选择「自动识别」可恢复检测结果。未检测或识别失败不影响备注、搜索或分享。</p></section>
    <section><h3>分享给朋友</h3><p>选择表情 → 点击「生成分享口令」→ 复制完整口令发给朋友。</p><p>每次最多分享 100 个。表情越多，口令越长。点击名称旁的编辑按钮可保存备注、关键词和表情文字，用于搜索，不会修改 SeaTalk 原收藏。</p></section>
    <section><h3>添加朋友分享的表情</h3><p>点击「导入口令」→ 粘贴完整口令 → 点击「解析并预览」→ 选择表情 → 确认添加。</p><p>已收藏的表情不会重复添加，但可以导入备注。已有备注默认保留，并合并去重关键词；也可逐条选择使用朋友的备注。预览失败的新表情暂时不能添加。</p></section>
    <section><h3>删除不需要的收藏</h3><p>选择表情 → 点击「删除所选表情」→ 核对图片和数量 → 确认删除。</p><p>删除只影响你的收藏，不会删除聊天消息。本助手无法撤销删除，分享口令也不保证能恢复。筛选之外的已选表情也会包括在确认清单中。</p></section>
    <section><h3>收起、关闭和结果核对</h3><p>点击顶栏「−」可收起为小入口，保留页码、筛选、勾选和识别进度；点击入口可恢复。宽屏时自动分栏，SeaTalk 在左侧、助手在右侧；拖动分隔线调整宽度。点击「浮窗」可切换为自由窗口，再拖动顶栏移动、拖动右下角调整大小。收起或关闭后恢复原页面布局。</p><p>操作结果不确定时，先刷新 SeaTalk 核对收藏，再决定是否重试。刷新会清空本次勾选。添加或删除进行中时，停止会等待当前表情的结果，再停止后续操作。</p></section>
<section><h3>备注、备份与发送</h3><p>备注自动保存在当前账号的油猴本地存储。可在「设置」导出备份或预览导入标签文件。分享可附带备注，但不包含私人说明。含备注的分享口令需要 5.1 或更新版本；取消附带备注可生成兼容旧版的口令。预览或选择表情后，核对目标会话并确认发送；切换账号或会话后停止。</p></section></div><div class="dialog-actions"><span></span><button id="guideClose" class="primary">知道了，返回管理</button></div></dialog>
  <dialog id="zoom" aria-labelledby="zoomTitle"><div class="dialog-header"><h2 id="zoomTitle">表情预览</h2><button data-close="zoom" aria-label="关闭预览">×</button></div><div class="dialog-body"><img class="zoom-image" alt="放大预览"><p></p></div><div class="dialog-actions"><span></span><button id="zoomClose">返回管理</button><button id="sendZoom" class="primary">发送到当前会话</button></div></dialog>
  <dialog id="sharing" aria-labelledby="shareTitle"><div class="dialog-header"><h2 id="shareTitle">分享所选表情</h2><button data-close="sharing" aria-label="关闭分享">×</button></div><div class="dialog-body"><p>复制完整口令发给朋友，对方可在「导入口令」中预览并添加。</p><label class="metadata-choice"><input id="shareIncludeMetadata" type="checkbox" checked> 附带备注名称、关键词与表情文字（不含私人说明）</label><textarea id="shareCode" readonly aria-label="分享口令"></textarea><p id="shareStatus" role="status"></p></div><div class="dialog-actions"><button id="shareClose">返回管理</button><button id="shareCopy" class="primary">复制分享口令</button></div></dialog>
  <dialog id="importing" aria-labelledby="importTitle"><div class="dialog-header"><h2 id="importTitle">导入口令</h2><button data-close="importing" aria-label="关闭导入">×</button></div><div class="dialog-body"><p>粘贴好友的完整口令，先预览并选择，再确认添加。</p><textarea id="importCode" aria-label="粘贴分享口令" maxlength="2097152" placeholder="STGIF1.…"></textarea><div class="inline-actions"><button id="importParse">解析并预览</button><button id="importSelect">全选可添加</button></div><label class="metadata-choice"><input id="shareImportMetadata" type="checkbox" checked> 同时导入备注，已有备注默认保留</label><div id="importPreview" class="import-grid"></div><p id="importStatus" role="status"></p></div><div class="dialog-actions"><button id="importCancel">取消</button><div class="right-actions"><button id="importStop" hidden>停止后续添加</button><button id="importConfirm" class="primary" disabled>确认添加所选表情</button></div></div></dialog>
  <dialog id="deletion" aria-labelledby="deleteTitle"><div class="dialog-header"><h2 id="deleteTitle">从我的表情中移除</h2><button data-close="deletion" aria-label="关闭删除确认">×</button></div><div class="dialog-body"><p id="deleteSummary"></p><p>删除后无法在本助手撤销。口令不保证能恢复，请核对以下表情。</p><div id="deletePreview" class="thumb-list"></div><p id="deleteProgress" role="status"></p></div><div class="dialog-actions"><button id="deleteCancel">取消</button><div class="right-actions"><button id="deleteStop" hidden>停止后续删除</button><button id="deleteConfirm" class="danger-fill">确认删除</button></div></div></dialog>
  <dialog id="output" aria-labelledby="exportTitle"><div class="dialog-header"><h2 id="exportTitle">开发者导出</h2><button data-close="output" aria-label="关闭导出">×</button></div><div class="dialog-body"><textarea readonly aria-label="导出 JSON"></textarea><p id="message"></p></div><div class="dialog-actions"><button id="outputClose">返回管理</button><div class="right-actions"><button id="download">下载 JSON</button><button id="copy" class="primary">复制 JSON</button></div></div></dialog>

<dialog id="personalEditor" aria-labelledby="personalEditorTitle"><div class="dialog-header"><h2 id="personalEditorTitle">编辑备注与关键词</h2><button data-close="personalEditor" aria-label="关闭备注编辑">×</button></div><div class="dialog-body metadata-form"><label>备注名称<input id="personalName" maxlength="80" required></label><label>关键词<input id="personalKeywords" maxlength="2000" placeholder="用逗号分隔，例如：工作，上班，打工人"></label><label>图片形式<select id="personalAnimation"><option value="auto">自动识别</option><option value="animated">动图（手动）</option><option value="static">静态图（手动）</option><option value="unknown">未知（手动）</option></select></label><p id="personalDetectionStatus"></p><p>手动标注优先于检测结果；选择「自动识别」可撤销手动标注。未检测或识别失败也能编辑备注。保存备注后将解除「需复核」。</p><label>表情文字<textarea id="personalVisibleText" maxlength="500"></textarea></label><label>私人说明（默认不分享）<textarea id="personalNote" maxlength="1000"></textarea></label><p>保存在当前账号的油猴本地存储中，不会修改 SeaTalk 收藏原名称。</p><p id="personalEditorStatus" role="status"></p></div><div class="dialog-actions"><button data-close="personalEditor">取消</button><button id="personalSave" class="primary">保存到本机</button></div></dialog>
<dialog id="personalSettings" aria-labelledby="personalSettingsTitle"><div class="dialog-header"><h2 id="personalSettingsTitle">个人备注备份与恢复</h2><button data-close="personalSettings" aria-label="关闭个人设置">×</button></div><div class="dialog-body"><p>备份包含全部备注、关键词、表情文字与私人说明，不含图片、账号或登录凭据。导入只恢复备注，不会添加、删除或发送表情。</p><div class="inline-actions"><button id="personalExport">导出个人备份</button><label class="file-label">选择备份或标签文件<input id="personalImportFile" type="file" accept=".json,application/json"></label></div><p id="personalSettingsStatus" role="status"></p><section id="personalImportPanel" hidden><p>已有备注默认保留；可逐条选择使用导入备注。AI 需复核项默认不勾选。</p><label><input id="personalMergeKeywords" type="checkbox" checked> 合并并去重关键词</label><div class="inline-actions"><button id="personalSelectAll">全选（含需复核项）</button><button id="personalSelectSafe">选择无需复核项</button><button id="personalClearImport">清空勾选</button></div><div id="personalImportRows" class="metadata-import-list"></div></section></div><div class="dialog-actions"><button data-close="personalSettings">返回管理</button><button id="personalImportConfirm" class="primary" disabled>确认导入备注</button></div></dialog>
<dialog id="sendConfirmation" aria-labelledby="sendTitle"><div class="dialog-header"><h2 id="sendTitle">确认发送表情</h2><button id="sendClose" aria-label="关闭发送确认">×</button></div><div class="dialog-body"><p id="sendTarget" class="notice"></p><p id="sendSummary"></p><div id="sendPreview" class="thumb-list"></div><p id="sendStatus" role="status"></p><p>只发送本次确认的表情；切换账号或会话后停止。结果未确认时不会自动重发。</p></div><div class="dialog-actions"><button id="sendCancel">取消</button><div class="right-actions"><button id="sendStop" hidden>停止后续发送</button><button id="sendConfirm" class="primary">确认发送</button></div></div></dialog>
`;
  const applyStaticLocale = language.bindStatic(root);
  applyStaticLocale();
  root.querySelector('.app').lang = language.locale;
  const $ = selector => root.querySelector(selector);
  const activeItems = () => items.filter(item => !item.deleted);
  const selection = () => items.filter(item => item.selected && !item.deleted);
  const matches = item => {
    if (item.deleted) return false;
    const query = $('#search').value.trim().toLowerCase();
    return (!query || personalMetadataMatches({name:item.label,keywords:item.metadata?.keywords || [],visibleText:item.metadata?.visibleText || '',note:item.metadata?.note || ''},query)) &&
      ($('#filter').value !== 'selected' || item.selected) &&
      ($('#animation').value === 'all' || effectiveAnimation(item) === $('#animation').value) &&
      ($('#metadataFilter').value === 'all' || ($('#metadataFilter').value === 'review' ? item.metadata?.needsReview === true : $('#metadataFilter').value === 'annotated' ? !!item.metadata : !item.metadata)) &&
      ($('#detectionFilter').value === 'all' || ($('#detectionFilter').value === 'recognized' ? ['animated','static'].includes(item.animation) : item.animation === $('#detectionFilter').value));
  };
  const filtered = () => items.filter(matches);
  const effectiveAnimation = item => item.metadata?.animationOverride && item.metadata.animationOverride !== 'auto' ? item.metadata.animationOverride : ['animated','static'].includes(item.animation) ? item.animation : 'unknown';
  const detectionText = item => ({animated:tr('动图'),static:tr('静态图'),unknown:tr('未检测'),failed:tr('识别失败')})[item.animation];
  const badgeText = item => {
    const manual=item.metadata?.animationOverride && item.metadata.animationOverride !== 'auto';
    const value=manual ? ({animated:tr('动图'),static:tr('静态图'),unknown:tr('未知')})[effectiveAnimation(item)]+ui(' · 手动',' · Manual') : detectionText(item);
    return value+(item.metadata?.needsReview ? ui(' · 需复核',' · Needs review') : '');
  };
  const busy = () => deleting || importingBusy || sendingBusy || sendPreparing || metadataSaving;
  const selectionOutside = () => selection().filter(item => !matches(item)).length;
  function updateSummary() {
    const list = activeItems(), classified = list.filter(item => ['animated', 'static'].includes(effectiveAnimation(item))).length;
    $('#summary').textContent = ui(`我的表情 ${list.length.toLocaleString()} 个`, `My stickers: ${list.length.toLocaleString(language.locale)}`) + (classified || list.some(item => item.animation === 'failed')
      ? ui(` · 动图 ${list.filter(item => effectiveAnimation(item) === 'animated').length.toLocaleString()} · 静态 ${list.filter(item => effectiveAnimation(item) === 'static').length.toLocaleString()}`, ` · Animated ${list.filter(item => effectiveAnimation(item) === 'animated').length.toLocaleString(language.locale)} · Still ${list.filter(item => effectiveAnimation(item) === 'static').length.toLocaleString(language.locale)}`) +
        (list.some(item => item.animation === 'unknown') ? ui(` · 未检测 ${list.filter(item => item.animation === 'unknown').length}`, ` · Not inspected ${list.filter(item => item.animation === 'unknown').length}`) : '') +
        (list.some(item => item.animation === 'failed') ? ui(` · 未能识别 ${list.filter(item => item.animation === 'failed').length}`, ` · Could not identify ${list.filter(item => item.animation === 'failed').length}`) : '') : '');
  }
  function count() {
    const selected = selection(), outside = selectionOutside(), locked = busy();
    for (const button of root.querySelectorAll('[data-workspace-locale]')) button.setAttribute('aria-pressed',String(button.dataset.workspaceLocale === language.locale));
    for (const check of root.querySelectorAll('.grid .card-bottom input[type=checkbox]')) check.disabled = locked;
    for (const edit of root.querySelectorAll('.grid .edit-name')) edit.disabled = locked || !personalReady;
    $('#count').textContent = ui(`已选择 ${selected.length} 个`, `${selected.length} selected`);
    $('#selectionHint').textContent = outside ? ui(`其中 ${outside} 个不在当前筛选中`, `${outside} outside the current filter`) : selected.length > 100 ? tr('每次最多分享 100 个，请分批选择。') : selected.length ? tr('翻页和筛选会保留选择。') : tr('先选择要分享或删除的表情。');
    $('#shareOpen').disabled = locked || !selected.length || selected.length > 100 || selected.some(item => !item.label.trim());
    $('#shareOpen').title = selected.length > 100 ? tr('每次最多分享 100 个') : !selected.length ? tr('先选择表情') : tr('生成分享口令');
    let accountReady = workspaceAccountState === 'ready';
    if (accountReady) { try { assertWorkspaceAccount(); } catch (_) { accountReady = false; } }
    $('#remove').disabled = locked || scanning || deleteNeedsReview || !selected.length || !accountReady;
    $('#remove').title = deleteNeedsReview ? tr('请先刷新核对上次删除结果') : !selected.length ? tr('先选择表情') : tr('删除所有已选表情，下一步核对清单');
    $('#clear').disabled = locked || !selected.length;
    $('#viewSelected').disabled = locked || (!selected.length && !selectedView && $('#filter').value !== 'selected');
    $('#viewSelected').textContent = selectedView ? tr('返回筛选') : tr('查看已选');
    $('#selectPage').disabled = locked || !filtered().length;
    $('#scan').disabled = locked || scanning;
    $('#importOpen').disabled = locked || scanning || !accountReady || !personalReady;
    for (const selector of ['#search', '#filter', '#animation', '#metadataFilter', '#detectionFilter']) $(selector).disabled = locked;
    $('#settingsOpen').disabled = locked || !personalReady || !accountReady;
    $('#sendSelected').disabled = locked || scanning || sendUncertain || !selected.length || selected.length > 100 || !accountReady;
    $('#sendZoom').disabled = locked || sendUncertain || !zoomItem || !accountReady;
    $('#personalImportFile').disabled = $('#personalExport').disabled = metadataSaving || !personalReady || !accountReady;
    for (const selector of ['#personalSelectAll','#personalSelectSafe','#personalClearImport','#personalMergeKeywords','#personalName','#personalKeywords','#personalVisibleText','#personalNote','#personalAnimation']) $(selector).disabled = metadataSaving;
    for (const entry of personalDraft?.rows || []) { entry.check.disabled = metadataSaving; entry.mode.disabled = metadataSaving || !personalRecords().has(entry.row.gifId); }
    const task = sendingBusy ? ui(' · 正在发送',' · Sending') : scanning ? tr(' · 正在识别') : importingBusy ? tr(' · 正在添加') : deleting ? tr(' · 正在删除') : '';
    mini.textContent = tr('SeaTalk 表情助手') + ui(` · 收藏 · 已选 ${selected.length} 个`, ` · Favorites · ${selected.length} selected`) + task;
    mini.setAttribute('aria-label', ui('恢复 SeaTalk 表情助手，已选择 ' + selected.length + ' 个', 'Restore SeaTalk Sticker Helper, ' + selected.length + ' selected') + task);
  }
  function renderEmpty() {
    const empty = !filtered().length;
    $('#emptyState').hidden = !empty;
    if (!empty) return;
    const unknown = activeItems().some(item => effectiveAnimation(item) === 'unknown' && item.animation === 'unknown');
    const typeRequiresScan = ['animated', 'static'].includes($('#animation').value) && unknown;
    $('#emptyTitle').textContent = scanning ? tr('正在识别图片类型') : typeRequiresScan ? ui('先检测或手动标注图片形式','Inspect or manually label the image format') : $('#filter').value === 'selected' ? tr('当前没有符合条件的已选表情') : tr('没有找到符合条件的表情');
    $('#emptyMessage').textContent = scanning ? tr('识别完成后，这里会显示符合筛选条件的表情。') : typeRequiresScan ? ui('可点击「识别动图」，或切换到「全部形式」，编辑备注中的图片形式。备注、搜索和分享不依赖检测。','Choose Inspect animation, or switch to All formats and set a format in the note editor. Notes, search and sharing do not require inspection.') : tr('可以调整搜索或筛选条件。之前在其他页选择的表情仍会保留。');
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
    if (id === 'deletion' && deleting) { stop = true; $('#deleteProgress').textContent = tr('正在等待当前结果，随后停止。'); return; }
    closeDialog($('#' + id));
  });
  function render() {
    const list = filtered(); page = Math.max(0, Math.min(page, Math.ceil(list.length / size) - 1));
    $('.grid').replaceChildren();
    for (const item of list.slice(page * size, (page + 1) * size)) {
      const card = document.createElement('article'); card.className = 'card' + (item.selected ? ' chosen' : '');
      const preview = document.createElement('button'); preview.className = 'preview'; preview.title = tr('放大预览 ') + item.label;
      const image = document.createElement('img'); image.src = item.url; image.alt = item.label; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { image.alt = tr('预览加载失败'); };
      preview.append(image); preview.onclick = () => {
        zoomItem = item; $('#zoom img').src = item.url; $('#zoom p').textContent = item.label; count(); openDialog($('#zoom'));
      };
      const title = document.createElement('div'); title.className = 'card-title';
      const nameText = document.createElement('span'); nameText.className = 'card-name'; nameText.textContent = item.label; nameText.title = item.label;
      const edit = document.createElement('button'); edit.className='edit-name'; edit.textContent='✎';
      edit.setAttribute('aria-label',ui('编辑备注与关键词 ','Edit notes and keywords: ')+item.label);edit.title=tr('编辑备注与关键词');edit.disabled=busy() || !personalReady;
      edit.onclick=()=>openPersonalEditor(item);title.append(nameText,edit);
      const bottom = document.createElement('div'); bottom.className = 'card-bottom';
      const badge = document.createElement('span'); badge.className = 'badge'; badge.dataset.id = item.gifId; badge.dataset.kind = effectiveAnimation(item); badge.title = ui('自动检测：','Automatic detection: ')+detectionText(item); badge.textContent = badgeText(item);
      const label = document.createElement('label'), check = document.createElement('input'); check.type = 'checkbox'; check.checked = item.selected; check.disabled = busy(); check.setAttribute('aria-label', tr('选择此表情'));
      check.onchange = () => {
        if (busy()) { check.checked = item.selected; return; }
        item.selected = check.checked;
        if ($('#filter').value === 'selected') {
          const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll;
        } else { card.classList.toggle('chosen', item.selected); count(); }
      };
      label.append(check, tr('选择')); bottom.append(badge, label); card.append(preview, title, bottom); $('.grid').append(card);
    }
    $('#page').textContent = ui(`${page + 1} / ${Math.max(1, Math.ceil(list.length / size))} 页 · ${list.length} 个`, `Page ${page + 1} / ${Math.max(1, Math.ceil(list.length / size))} · ${list.length} stickers`);
    $('#jump').max = Math.max(1, Math.ceil(list.length / size)); $('#jump').value = page + 1;
    $('#first').disabled = $('#prev').disabled = page === 0;
    $('#last').disabled = $('#next').disabled = (page + 1) * size >= list.length;
    $('main').scrollTop = 0; updateSummary(); count(); renderEmpty();
  }
  $('#search').oninput = $('#filter').onchange = $('#animation').onchange = $('#metadataFilter').onchange = $('#detectionFilter').onchange = () => { page = 0; render(); };
  $('#first').onclick = () => { page = 0; render(); };
  $('#last').onclick = () => { page = Math.max(0, Math.ceil(filtered().length / size) - 1); render(); };
  $('#prev').onclick = () => { page--; render(); }; $('#next').onclick = () => { page++; render(); };
  function jumpToPage() {
    const value = Number($('#jump').value), max = Math.max(1, Math.ceil(filtered().length / size));
    if (!Number.isInteger(value) || value < 1 || value > max) { $('#scanStatus').textContent = ui(`请输入 1–${max} 的整数页码。`, `Enter a whole page number from 1 to ${max}.`); return; }
    page = value - 1; render();
  }
  $('#jumpGo').onclick = jumpToPage;
  $('#jump').onkeydown = event => { if (event.key === 'Enter') jumpToPage(); };
  $('#selectPage').onclick = () => { if (busy()) return; filtered().slice(page * size, (page + 1) * size).forEach(item => item.selected = true); render(); };
  $('#clear').onclick = () => { if (busy()) return; items.forEach(item => item.selected = false); render(); };
  $('#viewSelected').onclick = () => {
    if (busy()) return;
    if (selectedView) {
      $('#search').value = selectedView.search; $('#animation').value = selectedView.animation; $('#metadataFilter').value = selectedView.metadata; $('#detectionFilter').value = selectedView.detection; $('#filter').value = selectedView.filter; page = selectedView.page; selectedView = null;
    } else {
      selectedView = { search: $('#search').value, animation: $('#animation').value, metadata: $('#metadataFilter').value, detection: $('#detectionFilter').value, filter: $('#filter').value, page };
      $('#search').value = ''; $('#animation').value = $('#metadataFilter').value = $('#detectionFilter').value = 'all'; $('#filter').value = 'selected'; page = 0;
    }
    render();
  };
  $('#emptyReset').onclick = () => { $('#search').value = ''; $('#animation').value = $('#metadataFilter').value = $('#detectionFilter').value = $('#filter').value = 'all'; selectedView = null; page = 0; render(); };
  $('#emptyScan').onclick = () => $('#scan').click();
  function revealWorkspace() {
    host.dataset.open = host.dataset.managed = 'true'; host.style.display = ''; mini.hidden = true;
    document.getElementById('seatalk-personal-gif-avatar-panel')?.classList.remove('spga-open');
    if (geometryCustom) { const rect = host.getBoundingClientRect(); clampWindow(rect.left, rect.top); }
    count(); window.dispatchEvent(new CustomEvent('spga:layout-change'));
  }
  function setWorkspaceLocale(value) {
    const next = value === 'en' ? 'en' : 'zh';
    if (next === language.locale) return;
    language.setLocale(next); host.dataset.locale = next; host.lang = next; $('.app').lang = next;
    applyStaticLocale(); host.setAttribute('aria-label', tr('SeaTalk 表情助手 · 我的表情'));
    for (const item of items) {
      if (item.generatedName && item.label === item.generatedName) {
        item.generatedName = ui(`收藏 ${item.number}`, `Favorite ${item.number}`); item.label = item.generatedName;
      }
    }
    for (const item of imported) item.check.setAttribute('aria-label', tr('添加 ') + item.label);
    for (const selector of ['#scanStatus', '#shareStatus', '#importStatus', '#deleteSummary', '#deleteProgress', '#message', '#personalEditorStatus', '#personalDetectionStatus', '#personalSettingsStatus', '#sendStatus', '#sendSummary']) {
      const node = $(selector); node.textContent = tr(node.textContent);
    }
    for (const node of root.querySelectorAll('.import-card p,.import-card select option,.metadata-import-row select option')) node.textContent = tr(node.textContent);
    personalDraft?.rows.forEach(entry=>entry.refreshCopy?.());
    if (editorItem) $('#personalDetectionStatus').textContent=ui('自动检测：','Automatic detection: ')+detectionText(editorItem);
    const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll;
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
  }
  for (const button of root.querySelectorAll('[data-workspace-locale]')) button.onclick=()=>{
    const locale=button.dataset.workspaceLocale;
    setWorkspaceLocale(locale);
    window.dispatchEvent(new CustomEvent('spga:locale-request',{detail:locale}));
  };
  host.__setLocale = setWorkspaceLocale;
  const localeChanged = event => setWorkspaceLocale(event.detail);
  window.addEventListener('spga:locale-change', localeChanged);
  host.__open = revealWorkspace;
  host.__close = hideWorkspace;
  function minimizeWorkspace() {
    if (root.querySelector('dialog[open]')) return;
    host.dataset.open = 'false'; host.style.display = 'none'; mini.hidden = false; count(); window.dispatchEvent(new CustomEvent('spga:layout-change')); mini.focus();
  }
  mini.onclick = () => { if (!host.isConnected) { mini.remove(); return; } revealWorkspace(); $('#minimize').focus(); };
  function hideWorkspace(back = false) {
    if (busy()) {
      stop = importStopped = sendStopped = true; sendPrepareGeneration++; $('#scanStatus').textContent = tr('正在停止后续操作，请等待当前结果后关闭。'); return false;
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
    if (selected.some(item => !item.label.trim())) { $('#scanStatus').textContent = tr('请先填写已选表情的分享名称。'); return; }
    $('#output textarea').value = JSON.stringify(selected.map(item => ({ label: item.label.trim(), gifId: item.gifId })), null, 2);
    $('#message').textContent = ui(`共 ${selected.length} 个，仅含名称与表情标识。`, `${selected.length} stickers; names and resource IDs only.`); openDialog($('#output'));
  };
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText($('#output textarea').value); $('#message').textContent = tr('已复制'); } catch (_) { $('#output textarea').select(); $('#message').textContent = tr('请按 ⌘C / Ctrl+C 复制'); } };
  $('#download').onclick = () => { const url = URL.createObjectURL(new Blob([$('#output textarea').value], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = 'seatalk-selected-stickers.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };

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
    const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  $('#settingsOpen').onclick=()=>{
    if(busy() || !personalReady)return;
    $('#personalSettingsStatus').textContent=ui(`当前账号已保存 ${personalSnapshot.items.length} 条个人备注。`,`This account has ${personalSnapshot.items.length} saved notes.`);
    openDialog($('#personalSettings'));
  };
  $('#personalExport').onclick=()=>{
    try{assertWorkspaceAccount();downloadMetadata(exportPersonalSettings(personalSnapshot.items),'seatalk-personal-settings-'+new Date().toISOString().slice(0,10)+'.json');}
    catch(error){$('#personalSettingsStatus').textContent=metadataMessage(error.message);}
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
      $('#personalSettingsStatus').textContent=ui(`已保存 ${count} 条备注；没有更改 SeaTalk 收藏。`,`Saved ${count} notes. SeaTalk favorites were not changed.`);
    }catch(error){$('#personalSettingsStatus').textContent=metadataMessage(error.message);}
    finally{updatePersonalImportCount();}
  };


  let sendDraft=null,sendStopped=false,sendUncertain=false,sendMonitor=null,sendPrepareGeneration=0;
  const sendMessage = code => ({
    SEND_TARGET_UNAVAILABLE:ui('无法核对当前普通会话。请打开单聊或群聊；话题窗口暂不支持发送。','The current conversation could not be verified. Open a direct or group chat; threads are not supported.'),
    SEND_TARGET_CHANGED:ui('账号或目标会话已变化，本次发送已停止。','The account or target conversation changed. This send was stopped.'),
    SEND_SELECTION_INVALID:ui('请选择 1–100 个当前收藏中的表情。','Select 1–100 stickers from your current favorites.'),
    SEND_SERVICE_UNAVAILABLE:ui('当前页面未识别到原生发送入口，请刷新后重试。','The native sticker sender is unavailable. Reload and try again.'),
    SEND_PREVIEW_FAILED:ui('表情预览未能就绪，未发送此表情。','The sticker preview is not ready. This sticker was not sent.'),
    SEND_FAILED:ui('SeaTalk 显示发送失败，已停止后续发送。','SeaTalk reported a send failure. Later sends stopped.'),
    SEND_UNCONFIRMED:ui('发送结果尚未确认，已停止。请核对聊天记录，刷新前不会再次发送。','Sending is unconfirmed and has stopped. Check the conversation. Further sends are disabled until reload.'),
  })[code] || ui('发送流程已停止，请核对聊天记录后再操作。','Sending stopped. Check the conversation before continuing.');
  function stopSendMonitor(){if(sendMonitor){sendMonitor();sendMonitor=null;}}
  function visibleSendEditor(){const editors=[...document.querySelectorAll('.messages-message-editor')].filter(node=>node.getClientRects().length);return editors.length===1;}
  function guardSend(draft){
    if(!draft || draft.invalid)throw Error('SEND_TARGET_CHANGED');
    try{
      assertWorkspaceAccount();
      if(nativeWorkspaceAccountId(draft.services)!==draft.account || !sameStickerSendTarget(draft.target,currentStickerSendTarget(draft.services,visibleSendEditor())))throw Error();
      for(const item of draft.items)if(!liveSource().list.some(row=>row.id===item.gifId || row.url===item.gifId))throw Error();
    }catch(_){draft.invalid=true;throw Error('SEND_TARGET_CHANGED');}
  }
  async function openStickerSend(selected){
    if(busy() || sendUncertain || !selected.length)return;
    if(root.querySelector('dialog[open]') && !$('#zoom').open)return;
    if($('#zoom').open)closeDialog($('#zoom'));
    const generation=++sendPrepareGeneration;sendPreparing=true;count();
    try{
      assertWorkspaceAccount();const services=await discoverShareServices();assertWorkspaceAccount();if(generation!==sendPrepareGeneration || host.dataset.open!=='true')return;
      if(typeof services.sendSticker!=='function' || typeof services.store.subscribe!=='function')throw Error('SEND_SERVICE_UNAVAILABLE');
      const target=currentStickerSendTarget(services,visibleSendEditor());
      sendDraft={services,target,account:nativeWorkspaceAccountId(services),items:selected.map(item=>Object.freeze({gifId:item.gifId,url:item.url,label:item.label})),invalid:false};
      if(sendDraft.items.length>100)throw Error('SEND_SELECTION_INVALID');guardSend(sendDraft);
      $('#sendTarget').textContent=ui('发送到：','Send to: ')+target.name;
      $('#sendSummary').textContent=ui(`将逐条发送 ${selected.length} 张表情。请核对会话和图片。`,`Send ${selected.length} stickers one at a time. Check the conversation and images.`);
      $('#sendStatus').textContent='';$('#sendPreview').replaceChildren();$('#sendConfirm').disabled=false;$('#sendStop').hidden=true;
      for(const item of sendDraft.items){const img=document.createElement('img');img.src=item.url;img.alt=item.label;img.referrerPolicy='no-referrer';$('#sendPreview').append(img);}
      if(!openDialog($('#sendConfirmation')))return;
      const watch=()=>{try{guardSend(sendDraft);}catch(_){$('#sendConfirm').disabled=true;$('#sendStatus').textContent=sendMessage('SEND_TARGET_CHANGED');}};
      const unsubscribe=services.store.subscribe(watch),timer=setInterval(watch,300);
      sendMonitor=()=>{clearInterval(timer);unsubscribe();};$('#sendCancel').focus();
    }catch(error){$('#scanStatus').textContent=sendMessage(error.message);}
    finally{sendPreparing=false;count();}
  }
  function closeSend(){if(sendingBusy){sendStopped=true;$('#sendStatus').textContent=ui('等待当前发送结果后停止。','Waiting for the current send result before stopping.');return;}stopSendMonitor();closeDialog($('#sendConfirmation'));}
  $('#sendSelected').onclick=()=>openStickerSend(selection());
  $('#sendZoom').onclick=()=>{if(zoomItem)openStickerSend([zoomItem]);};
  $('#sendClose').onclick=$('#sendCancel').onclick=closeSend;
  $('#sendStop').onclick=()=>{sendStopped=true;$('#sendStatus').textContent=ui('等待当前发送结果后停止。','Waiting for the current send result before stopping.');};
  $('#sendConfirmation').addEventListener('cancel',event=>{if(sendingBusy){event.preventDefault();closeSend();}});
  $('#sendConfirmation').addEventListener('close',()=>{if(!$('#sendConfirmation').open)stopSendMonitor();});
  $('#sendConfirm').onclick=async()=>{
    if(busy() || sendUncertain || !sendDraft || sendDraft.invalid)return;
    const draft=sendDraft;try{guardSend(draft);}catch(error){$('#sendStatus').textContent=sendMessage(error.message);return;}
    sendingBusy=true;sendStopped=false;$('#sendConfirm').disabled=true;$('#sendStop').hidden=false;render();
    let issued=0,completed=0;
    try{
      const result=await sendSelectedStickers(draft.items,{
        guard:()=>guardSend(draft),stopped:()=>sendStopped,pause:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
        preview:async item=>{
          if(globalThis.__SPGA_TEST_MODE__===true && draft.services.previewDimensions)return draft.services.previewDimensions(item);
          const img=new Image();img.referrerPolicy='no-referrer';img.src=validPreviewUrl(draft.services.fileUrl,item.gifId);
          let timer;try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SEND_PREVIEW_FAILED')),10000);})]);return {width:img.naturalWidth,height:img.naturalHeight};}
          catch(_){throw Error('SEND_PREVIEW_FAILED');}finally{clearTimeout(timer);}
        },
        send:(item,dimensions)=>{
          guardSend(draft);const ticket={before:new Set(Object.values(draft.services.store.getState().messages.messages||{}).map(message=>String(message.cid))),cid:null,rejected:false};
          issued++;
          Promise.resolve(draft.services.sendSticker({session:{id:draft.target.id,type:draft.target.type},customSticker:{n:'',url:item.gifId,w:dimensions.width,h:dimensions.height}})).catch(()=>ticket.rejected=true);
          return ticket;
        },
        receipt:async(item,ticket)=>{
          const deadline=Date.now()+20000;
          while(Date.now()<deadline){
            guardSend(draft);
            const receipt=findStickerSendReceipt(draft.services.store.getState().messages.messages,ticket.before,draft.target,item.gifId,draft.account,draft.services.tag,ticket.cid);
            if(receipt.cid)ticket.cid=receipt.cid;
            if(['confirmed','failed'].includes(receipt.status))return receipt.status;
            if(receipt.status==='ambiguous' || ticket.rejected)return 'pending';
            await new Promise(resolve=>setTimeout(resolve,250));
          }
          return 'pending';
        },
        report:(done,total)=>{
          completed=done;const item=items.find(item=>item.gifId===draft.items[done-1].gifId);if(item)item.selected=false;
          $('#sendStatus').textContent=ui(`已观察到 SeaTalk 确认 ${done} / ${total} 张表情。`,`SeaTalk confirmation observed for ${done} / ${total} stickers.`);render();
        },
      });
      $('#sendStatus').textContent=ui(`SeaTalk 已确认 ${result.sent} 张表情${result.stopped?'，已停止后续发送':''}。`,`SeaTalk confirmed ${result.sent} stickers.${result.stopped?' Later sends stopped.':''}`);
    }catch(error){sendUncertain=issued>completed && error.message!=='SEND_FAILED';$('#sendStatus').textContent=sendMessage(error.message)+(sendUncertain && error.message!=='SEND_UNCONFIRMED'?' '+sendMessage('SEND_UNCONFIRMED'):'');}
    finally{sendingBusy=false;$('#sendStop').hidden=true;$('#sendConfirm').disabled=true;stopSendMonitor();render();}
  };

  async function detect(item) {
    const controller = new AbortController(); activeRequests.add(controller);
    const timer = setTimeout(() => controller.abort(), 10000);
    let decoder, reader;
    try {
      const response = await fetch(item.url, { credentials: 'include', signal: controller.signal });
      if (!response.ok || Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw Error('unavailable');
      reader = response.body.getReader(); const chunks = []; let length = 0;
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        length += value.byteLength; if (length > 20 * 1024 * 1024) throw Error('too large');
        chunks.push(value);
      }
      const bytes = new Uint8Array(length); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
      const type = ascii(0, 3) === 'GIF' ? 'image/gif' : ascii(1, 4) === 'PNG' ? 'image/png' : ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP' ? 'image/webp' : bytes[0] === 255 && bytes[1] === 216 ? 'image/jpeg' : '';
      if (!type || !('ImageDecoder' in window)) throw Error('unsupported');
      decoder = new ImageDecoder({ data: bytes, type }); await decoder.tracks.ready;
      const frames = decoder.tracks.selectedTrack?.frameCount;
      if (!Number.isInteger(frames) || frames < 1) throw Error('unknown');
      if (!scanCancelled && !controller.signal.aborted) item.animation = frames > 1 ? 'animated' : 'static';
    } catch (_) {
      if (!scanCancelled) item.animation = controller.signal.aborted ? 'unknown' : 'failed';
    } finally {
      clearTimeout(timer); decoder?.close(); activeRequests.delete(controller);
      if (reader) { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }
  $('#scanStop').onclick = () => { scanCancelled = true; activeRequests.forEach(controller => controller.abort()); };
  $('#scan').onclick = async () => {
    if (scanning || busy()) return;
    scanning = true; scanCancelled = false; $('#scanStop').hidden = false; count();
    const queue = activeItems().filter(item => ['unknown', 'failed'].includes(item.animation));
    let next = 0, done = 0;
    const status = () => {
      $('#scanStatus').textContent = queue.length ? ui(`正在识别 ${done} / ${queue.length}，筛选条件和选择都会保留。`, `Inspecting ${done} / ${queue.length}. Filters and selections are kept.`) : tr('已经完成分类，无需重复检测。');
      updateSummary();
    };
    status(); renderEmpty();
    const worker = async () => {
      while (!scanCancelled && next < queue.length && host.isConnected) {
        const item = queue[next++]; await detect(item); done++; status();
        const badge = [...root.querySelectorAll('.badge')].find(element => element.dataset.id === item.gifId);
        if (badge) { badge.textContent = badgeText(item); badge.dataset.kind = effectiveAnimation(item); badge.title = ui('自动检测：','Automatic detection: ')+detectionText(item); }
      }
    };
    try { await Promise.all([worker(), worker(), worker()]); }
    finally {
      scanning = false; $('#scanStop').hidden = true;
      const failures = activeItems().filter(item => item.animation === 'failed').length;
      $('#scanStatus').textContent = scanCancelled ? tr('已停止识别，已完成的分类仍然保留。') : queue.length
        ? ui(`识别完成${failures ? `，${failures} 个未能识别，可再次点击重试` : ''}。`, `Inspection complete.${failures ? ` ${failures} could not be identified. Inspect again to retry.` : ''}`) : tr('已经完成分类，无需重复检测。');
      updateSummary();
      if ($('#animation').value !== 'all' || $('#detectionFilter').value !== 'all') { const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll; }
      else { count(); renderEmpty(); }
    }
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  $('#remove').onclick = () => {
    if (busy() || scanning || deleteNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = tr(error.message); count(); return; }
    pending = selection().map(item => Object.freeze({ gifId: item.gifId, url: item.url, label: item.label }));
    if (!pending.length) return;
    const outside = selectionOutside();
    $('#deleteSummary').textContent = ui(`即将移除 ${pending.length} 个收藏${outside ? `，其中 ${outside} 个不在当前筛选中` : ''}。不会删除聊天消息。`, `Remove ${pending.length} favorites${outside ? `, including ${outside} outside the current filter` : ''}. Chat messages will not be deleted.`);
    $('#deletePreview').replaceChildren();
    for (const item of pending) {
      const image = document.createElement('img'); image.src = item.url; image.alt = item.label; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      $('#deletePreview').append(image);
    }
    $('#deleteProgress').textContent = ''; $('#deleteConfirm').disabled = false; $('#deleteCancel').disabled = false; $('#deleteCancel').textContent = tr('取消');
    if (openDialog($('#deletion'))) $('#deleteCancel').focus();
  };
  $('#deleteCancel').onclick = () => { if (!deleting) closeDialog($('#deletion')); };
  $('#deletion').addEventListener('cancel', event => { if (deleting) { event.preventDefault(); stop = true; $('#deleteProgress').textContent = tr('正在等待当前结果，随后停止。'); } });
  $('#deleteStop').onclick = () => { stop = true; $('#deleteProgress').textContent = tr('正在等待当前结果，随后停止。'); };
  $('#deleteConfirm').onclick = async () => {
    if (deleting || importingBusy || sendingBusy || metadataSaving || !pending.length || deleteNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { deleteNeedsReview = true; $('#deleteProgress').textContent = tr(error.message); count(); return; }
    deleting = true; stop = false; $('#deleteConfirm').disabled = $('#deleteCancel').disabled = true; $('#deleteStop').hidden = false; count();
    let done = 0, error = '';
    try {
      for (const item of pending) {
        if (stop) break;
        assertWorkspaceAccount();
        const current = liveSource();
        if (!current.list.some(sticker => sticker.id === item.gifId)) { error = tr('收藏列表已变化，已停止。'); break; }
        $('#deleteProgress').textContent = ui(`正在移除 ${done + 1} / ${pending.length}…`, `Removing ${done + 1} / ${pending.length}…`);
        assertWorkspaceAccount();
        await current.actions.actionRemoveCustomStickers([item.gifId]);
        assertWorkspaceAccount();
        let absent = false;
        for (let attempt = 0; attempt < 24; attempt++) {
          await pause(500); assertWorkspaceAccount();
          if (!liveSource().list.some(sticker => sticker.id === item.gifId)) { absent = true; break; }
        }
        if (!absent) { error = tr('本次结果未确认，已停止。'); break; }
        const original = items.find(value => value.gifId === item.gifId);
        original.deleted = true; original.selected = false; done++; count();
        await pause(800);
      }
    } catch (_) { error = tr('删除请求未确认，已停止后续操作。'); }
    finally {
      deleting = false; deleteNeedsReview = Boolean(error); $('#deleteStop').hidden = true; $('#deleteCancel').disabled = false;
      $('#deleteCancel').textContent = tr('返回管理');
      $('#deleteProgress').textContent = ui(`页面收藏已观察到移除 ${done} / ${pending.length} 个。${language.textFor(error, 'zh') || (stop ? '已停止后续删除。' : '')}请刷新 SeaTalk 核对保存结果。`, `Removal observed for ${done} / ${pending.length} favorites. ${language.textFor(error, 'en') || (stop ? 'Later removals stopped. ' : '')} Reload SeaTalk to check saved results.`);
      render();
    }
  };

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

  let importingBusy = false, importStopped = false, importGeneration = 0, importNeedsReview = false;
  let imported = [], importServices = null, importAccountId = 0;
  const pauseImport = ms => new Promise(resolve => setTimeout(resolve, ms));
  const ownList = () => {
    const list = importServices?.store.getState()?.messages?.customStickers;
    if (!Array.isArray(list)) throw Error(tr('请先打开 SeaTalk 爱心收藏面板'));
    return list;
  };
  const importedResourceIds = new Map();
  function savedStickerId(id) {
    const expected=importedResourceIds.get(id) || id;
    const match=ownList().find(item=>item.id===id || item.url===id || item.id===expected || item.url===expected);
    if (!match) return null;
    return [match.id,match.url].find(value=>validMetadataId(value)) || null;
  }
  const alreadySaved = id => savedStickerId(id) !== null;
  // Observe only the exact resource refresh performed by this confirmed native add.
  // Requests and responses pass through unchanged; no credentials or response bodies are stored.
  function observeImportRefresh(item) {
    if (globalThis.__SPGA_TEST_MODE__ === true) return () => {};
    const originalFetch=window.fetch, account=importAccountId, generation=importGeneration;
    const allowedHost=new URL(validPreviewUrl(importServices.fileUrl,item.gifId)).hostname;
    let active=true;
    const wrapped=function(input,init) {
      let matching=false;
      try {
        const request=input instanceof Request ? input : null;
        const url=new URL(request ? request.url : String(input),location.href);
        const headers=new Headers(init?.headers ?? request?.headers);
        matching=url.protocol==='https:' && url.hostname===allowedHost && url.pathname==='/refresh/' &&
          String(init?.method ?? request?.method ?? 'GET').toUpperCase()==='POST' && headers.get('fid')===item.gifId;
      } catch (_) { /* Leave unrelated requests untouched. */ }
      const response=originalFetch.apply(this,arguments);
      if (!matching) return response;
      return response.then(async result=>{
        if (active && result.ok) {
          try {
            const text=await result.clone().text();
            if(text.length<=65536) {
              const payload=JSON.parse(text);
              if(active && generation===importGeneration && account===importAccountId &&
                nativeWorkspaceAccountId(importServices)===account && host.isConnected &&
                (!payload.ErrorCode || Number(payload.ErrorCode)===0) && validMetadataId(payload.FileName)) {
                assertWorkspaceAccount(); importedResourceIds.set(item.gifId,payload.FileName);
              }
            }
          } catch (_) { /* Missing evidence remains unconfirmed. */ }
        }
        return result;
      });
    };
    window.fetch=wrapped;
    return ()=>{active=false;if(window.fetch===wrapped)window.fetch=originalFetch;};
  }
  function validPreviewUrl(fileUrl, id) {
    const url = new URL(fileUrl(id));
    if (url.protocol !== 'https:' || url.hostname !== 'f.haiserve.com' ||
        !url.pathname.startsWith('/download/' + id)) throw Error(tr('无法生成安全的表情预览'));
    return url.href;
  }
  async function discoverShareServices() {
    if (globalThis.__SPGA_TEST_MODE__ === true && globalThis.__SPGA_SHARE_FIXTURE_SERVICES__) {
      return globalThis.__SPGA_SHARE_FIXTURE_SERVICES__;
    }
    const links = [...new Set(Array.from(document.querySelectorAll('link[href],script[src]'), e => e.href || e.src || ''))];
    const locate = name => {
      const matches = links.filter(value => {
        try { const url = new URL(value); return url.protocol === 'https:' &&
          url.hostname === 'static.cdn.haiserve.com' &&
          new RegExp('/seatalk/fe/static/js/chunk-' + name + '-[^/]+\\.js$').test(url.pathname); }
        catch (_) { return false; }
      });
      if (matches.length !== 1) throw Error(tr('未识别当前收藏服务，请登录 SeaTalk 后刷新'));
      return matches[0];
    };
    const [module, constants, accountModule] = await Promise.all([
      import(locate('styles')), import(locate('db-pure')), import(locate('src')),
    ]);
    const one = (values, predicate) => {
      const found = [...new Set(values)].filter(predicate);
      if (found.length !== 1) throw Error(tr('SeaTalk 收藏服务结构已变化，请停止操作并反馈'));
      return found[0];
    };
    const values = Object.values(module);
    const actions = one(values, value => value && typeof value.actionAddCustomStickerFromMessage === 'function');
    const store = one(values, value => value && typeof value.getState === 'function' && typeof value.dispatch === 'function');
    const fileUrl = one(values, value => typeof value === 'function' && ['blob:', 'maxWidth', 'gfsToken'].every(word => String(value).includes(word)));
    const tags = one(Object.values(constants), value => value && typeof value === 'object' && typeof value.MESSAGE_CUSTOM_STICKER === 'string');
    const session = one(Object.values(accountModule), value => value && typeof value === 'object' &&
      value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
    const senders = [...new Set(values)].filter(value => typeof value === 'function' &&
      ['customSticker','MESSAGE_CUSTOM_STICKER','senderId','recipientId','sendMessage'].every(word => String(value).includes(word)));
    const sendSticker = typeof actions.actionSendStickerMessage === 'function' ? payload => actions.actionSendStickerMessage(payload) : senders.length === 1 ? senders[0] : null;
    return { actions, store, fileUrl, session, sendSticker, tag: tags.MESSAGE_CUSTOM_STICKER,
      accountId: () => {
        const current = [...new Set(Object.values(accountModule))].filter(value => value && typeof value === 'object' && value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
        return current.length === 1 ? current[0].userId : 0;
      } };
  }
  $('#shareOpen').onclick = () => {
    if (busy() || !selection().length || selection().length > 100) return;
    const selected = items.filter(item => item.selected && !item.deleted);
    try {
      $('#shareCode').value = encodeStickerShare(selected.map((item,index) => $('#shareIncludeMetadata').checked ?
        {gifId:item.gifId,label:item.label,keywords:item.metadata?.keywords || [],visibleText:item.metadata?.visibleText || ''} : {gifId:item.gifId,label:'Sticker '+(index+1)}));
      $('#shareStatus').textContent = ui(`共 ${selected.length} 个表情${selectionOutside() ? `，其中 ${selectionOutside()} 个不在当前筛选中` : ''}。请复制完整口令；表情越多，口令越长。`, `${selected.length} stickers${selectionOutside() ? `, including ${selectionOutside()} outside the current filter` : ''}. Copy the complete code; more stickers make it longer.`);
      if (openDialog($('#sharing'))) $('#shareCopy').focus();
    } catch (error) { $('#scanStatus').textContent = tr(error.message); }
  };
  $('#shareIncludeMetadata').onchange = () => $('#shareOpen').onclick();
  $('#shareCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#shareCode').value); $('#shareStatus').textContent = tr('分享口令已复制，发给朋友即可。'); }
    catch (_) { $('#shareCode').focus(); $('#shareCode').select(); $('#shareStatus').textContent = tr('请按 ⌘C / Ctrl+C 复制完整口令。'); }
  };
  $('#shareClose').onclick = () => closeDialog($('#sharing'));
  const updateImportButton = () => {
    $('#importConfirm').disabled = importingBusy || importNeedsReview || !imported.some(item => item.selected && (item.ready && !item.saved || item.saved && $('#shareImportMetadata').checked));
  };
  $('#importOpen').onclick = () => {
    if (deleting || importingBusy || scanning) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = tr(error.message); count(); return; }
    if (openDialog($('#importing'))) $('#importCode').focus();
  };
  function cancelImport() {
    if (importingBusy) { importStopped = true; $('#importStatus').textContent = tr('正在停止后续添加，等待当前表情结果…'); return; }
    importGeneration++; closeDialog($('#importing'));
  }
  $('#importCancel').onclick = cancelImport;
  $('#importing').addEventListener('cancel', event => { event.preventDefault(); cancelImport(); });
  $('#importStop').onclick = () => { importStopped = true; $('#importStatus').textContent = tr('正在停止后续添加，等待当前表情结果…'); };
  $('#importCode').oninput = () => {
    if (importingBusy) return;
    importGeneration++; imported = []; $('#importPreview').replaceChildren();
    $('#importStatus').textContent = tr('口令已变化，请重新解析预览。'); updateImportButton();
  };
  $('#importSelect').onclick = () => {
    if (importingBusy) return;
    imported.forEach(item => { if (item.ready && !item.saved) { item.selected = true; item.check.checked = true; } });
    updateImportButton();
  };
  $('#importParse').onclick = async () => {
    if (importingBusy) return;
    const generation = ++importGeneration;
    importNeedsReview = false;
    imported = []; $('#importPreview').replaceChildren(); updateImportButton();
    try {
      const stickers = decodeStickerShare($('#importCode').value);
      $('#importStatus').textContent = tr('正在准备预览…');
      const found = await discoverShareServices();
      if (generation !== importGeneration || !$('#importing').open) return;
      importServices = found;
      const account = importServices.session;
      if (account.loggedIn !== true || !Number.isSafeInteger(account.userId) || account.userId <= 0) throw Error(tr('请先登录 SeaTalk'));
      assertWorkspaceAccount(); importAccountId = nativeWorkspaceAccountId(importServices);
      ownList();
      imported = stickers.map(item => ({ ...item, ready: false, selected: false, saved: alreadySaved(item.gifId), metadataPolicy:'keep',
        url: validPreviewUrl(importServices.fileUrl, item.gifId) }));
      for (const item of imported) {
        const card = document.createElement('div'); card.className = 'import-card';
        const image = document.createElement('img'); image.alt = item.label; image.referrerPolicy = 'no-referrer';
        const label = document.createElement('label');
        const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = !(item.saved && $('#shareImportMetadata').checked);
        check.setAttribute('aria-label', tr('添加 ') + item.label); item.check = check;
        const status = document.createElement('p'); status.style.fontSize = '12px';
        status.textContent = item.saved ? ui('已收藏 · 可选择导入备注','Already saved · Can import notes') : tr('等待预览'); item.status = status;
        check.onchange = () => { item.selected = check.checked; updateImportButton(); };
        image.onload = () => {
          if (generation !== importGeneration) return;
          item.width = image.naturalWidth; item.height = image.naturalHeight;
          item.ready = item.width > 0 && item.height > 0 && item.width <= 20000 && item.height <= 20000;
          check.disabled = importingBusy || !(item.saved ? $('#shareImportMetadata').checked : item.ready);
          status.textContent = item.saved ? ui('已收藏 · 可选择导入备注','Already saved · Can import notes') : item.ready ? tr('预览就绪 · 可添加') : tr('图片尺寸无效');
          updateImportButton();
        };
        image.onerror = () => {
          if (generation !== importGeneration) return;
          item.ready = false; if (!item.saved) { item.selected = false; check.checked = false; } check.disabled = !(item.saved && $('#shareImportMetadata').checked);
          status.textContent = item.saved ? ui('已有收藏，可导入备注；预览不可用','Already saved; notes can be imported. Preview unavailable.') : tr('预览不可用 · 不可添加'); updateImportButton();
        };
        const policy=document.createElement('select');policy.setAttribute('aria-label',ui('备注冲突处理 ','Note conflict policy: ')+item.label);
        for(const [value,zh,en] of [['keep','保留我的备注，合并关键词','Keep my note, merge keywords'],['replace','使用分享备注，合并关键词','Use shared note, merge keywords']]){const option=document.createElement('option');option.value=value;option.textContent=ui(zh,en);policy.append(option);}
        policy.disabled=!personalRecords().has(item.gifId);policy.onchange=()=>item.metadataPolicy=policy.value;
        label.append(check, item.label); card.append(image, label, status, policy); $('#importPreview').append(card);
        image.src = item.url;
      }
      $('#importStatus').textContent = ui(`共 ${imported.length} 个表情，已收藏 ${imported.filter(item => item.saved).length} 个。请勾选预览成功的表情，确认后添加。`, `${imported.length} stickers; ${imported.filter(item => item.saved).length} already saved. Select stickers with ready previews, then confirm adding them.`);
    } catch (error) {
      if (generation !== importGeneration) return;
      imported = []; $('#importPreview').replaceChildren();
      $('#importStatus').textContent = tr(error.message); updateImportButton();
    }
  };
  $('#shareImportMetadata').onchange=()=>{
    for(const item of imported){item.check.disabled=!(item.saved ? $('#shareImportMetadata').checked : item.ready);if(item.check.disabled){item.selected=false;item.check.checked=false;}}
    updateImportButton();
  };
  $('#importConfirm').onclick = async () => {
    if (importingBusy || deleting || sendingBusy || metadataSaving || scanning || importNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#importStatus').textContent = tr(error.message); return; }
    const selected = imported.filter(item => item.selected && (item.ready && !item.saved || item.saved && $('#shareImportMetadata').checked));
    if (!selected.length) return;
    const generation = importGeneration;
    const metadataRevision=personalSnapshot.revision,metadataPlan=new Map();
    try{
      if($('#shareImportMetadata').checked){
        for(const item of selected){
          const incoming=normalizePersonalRecord({gifId:item.gifId,name:item.label,keywords:item.keywords || [],visibleText:item.visibleText || '',animationOverride:personalRecords().get(savedStickerId(item.gifId) || item.gifId)?.animationOverride || 'auto',source:'shared',updatedAt:new Date().toISOString()});
          metadataPlan.set(item.gifId,mergePersonalRecord(personalRecords().get(savedStickerId(item.gifId) || item.gifId),incoming,item.metadataPolicy==='replace',true));
        }
      }
    }catch(error){$('#importStatus').textContent=metadataMessage(error.message);return;}
    importingBusy = true; importStopped = false;
    let stopObservingRefresh=()=>{};
    for (const id of ['importCode', 'importParse', 'importSelect', 'importConfirm', 'remove', 'scan']) $('#' + id).disabled = true;
    imported.forEach(item => item.check.disabled = true);
    $('#importStop').hidden = false; count();
    try {
      const newStickers=selected.filter(item=>!alreadySaved(item.gifId));
      const result = newStickers.length ? await addSharedStickers(newStickers, {
        accountId: () => nativeWorkspaceAccountId(importServices),
        active: () => host.isConnected && importGeneration === generation && nativeWorkspaceAccountId(importServices) === importAccountId,
        stopped: () => importStopped,
        has: alreadySaved, pause: pauseImport,
        report: text => $('#importStatus').textContent = ui(text, text.replace(/^正在添加 (\d+) \/ (\d+)…$/, 'Adding $1 / $2…')),
        add: item => {
          stopObservingRefresh();stopObservingRefresh=observeImportRefresh(item);
          return importServices.actions.actionAddCustomStickerFromMessage({tag:importServices.tag,
            content:{fileId:item.gifId,width:item.width,height:item.height}});
        },
      }) : {added:0,skipped:0,stopped:false};
      let notes=0;
      if(metadataPlan.size && !result.stopped){
        assertWorkspaceAccount();if(personalSnapshot.revision!==metadataRevision)throw Error('METADATA_CHANGED');
        const records=personalRecords();
        for(const [id,row] of metadataPlan){const savedId=savedStickerId(id);if(savedId){const mapped=normalizePersonalRecord({...row,gifId:savedId});const choice=selected.find(item=>item.gifId===id);records.set(savedId,mergePersonalRecord(records.get(savedId),mapped,choice?.metadataPolicy==='replace',true));notes++;}}
        if(notes)await savePersonalRows([...records.values()]);
      }
      $('#importStatus').textContent = ui(`已保存 ${notes} 条备注。`, `Saved ${notes} notes. `) + ui(`页面收藏已观察到添加 ${result.added} 个，跳过 ${result.skipped} 个${result.stopped ? '，已停止后续添加' : ''}。请刷新 SeaTalk 核对保存结果。`, `Addition observed for ${result.added} stickers; ${result.skipped} skipped.${result.stopped ? ' Later additions stopped.' : ''} Reload SeaTalk to check saved results.`);
    } catch (error) { importNeedsReview = true; $('#importStatus').textContent = error.message.startsWith('METADATA_') ? metadataMessage(error.message) : tr(error.message); }
    finally {
      stopObservingRefresh();
      importingBusy = false; $('#importStop').hidden = true;
      for (const id of ['importCode', 'importParse', 'importSelect', 'remove', 'scan']) $('#' + id).disabled = false;
      for (const item of imported) {
        try { item.saved = alreadySaved(item.gifId); } catch (_) { /* Keep uncertain results unconfirmed. */ }
        if (item.saved) {
          item.selected = false; item.check.checked = false; item.status.textContent = tr('已收藏');
          const canonicalId=savedStickerId(item.gifId);
          const existing = items.find(old => old.gifId === canonicalId);
          if (existing) existing.deleted = false;
          else items.push({gifId:canonicalId,label:item.label,originalLabel:item.label,url:validPreviewUrl(importServices.fileUrl,canonicalId),existing:known.has(canonicalId),selected:false,animation:'unknown'});
        }
        item.check.disabled = !(item.saved ? $('#shareImportMetadata').checked : item.ready);
      }
      refreshPersonalLabels(); updateImportButton(); render();
    }
  };
  host.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyJ') {
      event.preventDefault(); $('#hiddenTools').hidden = !$('#hiddenTools').hidden;
    }
  });

  discoverShareServices().then(async services => {
    workspaceAccountCheck = createWorkspaceAccountGuard(services, source, () => liveSource().list);
    workspaceAccountState = 'ready'; await loadPersonalSettings(services); count();
  }).catch(() => {
    workspaceAccountState = 'failed';
    $('#scanStatus').textContent = tr('无法核对当前账号，添加和删除已停用。请刷新 SeaTalk 后重新打开。'); count();
  });
  render();
  window.dispatchEvent(new CustomEvent('spga:layout-change'));
  return { sourceCount: source.length, uniqueCount: items.length, existingCount: items.filter(item => item.existing).length };
}

function installHelperLayout() {
/* CSS-only side-by-side layout; native React nodes, zoom and chat content are untouched. */
function planHelperSplit(viewportWidth, kind, preferredWidth, nativeAvailable = true) {
  if (!nativeAvailable || !['favorites', 'avatar'].includes(kind) || !Number.isFinite(viewportWidth)) return null;
  const nativeMin = 900, gap = 36, min = kind === 'favorites' ? 460 : 340;
  const max = Math.min(kind === 'favorites' ? 800 : 460, viewportWidth - nativeMin - gap);
  if (max < min) return null;
  const fallback = kind === 'favorites' ? Math.min(760, viewportWidth * 0.38) : 390;
  const width = Math.round(Math.max(min, Math.min(max, Number.isFinite(preferredWidth) ? preferredWidth : fallback)));
  return { width, nativeWidth: viewportWidth - width - gap, min, max };
}

  if (window.__spgaHelperLayout) { window.__spgaHelperLayout.refresh(); return window.__spgaHelperLayout; }
  const root = document.documentElement, style = document.createElement('style');
  style.id = 'spga-helper-split-layout';
  style.textContent = `html[data-spga-dock-kind] #root .home-main-window {
    position:fixed!important;left:12px!important;top:12px!important;right:auto!important;bottom:auto!important;
    width:calc(100vw - var(--spga-dock-width) - 36px)!important;height:calc(100dvh - 24px)!important;
    min-width:0!important;max-width:none!important;max-height:none!important;margin:0!important;transform:none!important;border-radius:7px!important;}
    html[data-spga-dock-kind] #root .misc-info {visibility:hidden!important}
    html[data-spga-dock-kind="favorites"] #st-favorites-curator,
    html[data-spga-dock-kind="avatar"] #seatalk-personal-gif-avatar-panel {
      position:fixed!important;left:auto!important;right:12px!important;top:12px!important;bottom:auto!important;
      width:var(--spga-dock-width)!important;height:calc(100dvh - 24px)!important;max-height:calc(100dvh - 24px)!important;
      max-width:calc(100vw - 24px)!important;transform:none!important;margin:0!important;}`;
  document.head.append(style);
  let frame = 0, last = '';
  const nativeAvailable = () => {
    const nodes = document.querySelectorAll('#root .home-main-window');
    if (nodes.length !== 1) return false;
    const rect = nodes[0].getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && getComputedStyle(nodes[0]).display !== 'none';
  };
  function refresh() {
    const favorites = document.getElementById('st-favorites-curator'), avatar = document.getElementById('seatalk-personal-gif-avatar-panel');
    const kind = favorites?.dataset.open === 'true' ? 'favorites' : favorites?.dataset.managed !== 'true' && avatar?.classList.contains('spga-open') ? 'avatar' : null;
    const host = kind === 'favorites' ? favorites : avatar;
    const available = nativeAvailable();
    const preferred = host?.dataset.dockWidth ? Number(host.dataset.dockWidth) : undefined;
    const plan = planHelperSplit(innerWidth, kind, preferred, available);
    const docked = Boolean(plan && host?.dataset.layout !== 'floating');
    const stateKey = `${kind}|${innerWidth}|${innerHeight}|${plan?.width}|${docked}`;
    if (stateKey !== last) {
      last = stateKey;
      if (docked) { root.dataset.spgaDockKind = kind; root.style.setProperty('--spga-dock-width', plan.width + 'px'); }
      else { delete root.dataset.spgaDockKind; root.style.removeProperty('--spga-dock-width'); }
    }
    for (const node of [favorites, avatar].filter(Boolean)) {
      const next = String(docked && node === host);
      if (node.dataset.docked !== next) node.dataset.docked = next;
    }
    if (favorites) {
      const text = (zh, en) => favorites.dataset.locale === 'en' ? en : zh;
      const button = favorites.shadowRoot?.getElementById('dockToggle'), divider = favorites.shadowRoot?.getElementById('dockDivider');
      if (button) {
        button.disabled = !planHelperSplit(innerWidth, 'favorites', preferred, available);
        button.textContent = docked && kind === 'favorites' ? text('浮窗', 'Float') : text('分栏', 'Split view');
        button.title = button.disabled ? text('当前页面或窗口宽度不适合分栏，将使用浮窗', 'Split view is unavailable at this window size or on this page; using a floating window') : docked && kind === 'favorites' ? text('切换为可拖动浮窗', 'Switch to a draggable floating window') : text('在右侧分栏，SeaTalk 使用左侧空间', 'Open a sidebar on the right, with SeaTalk on the left');
      }
      if (divider) {
        divider.hidden = !(docked && kind === 'favorites');
        if (plan) { divider.setAttribute('aria-valuemin', String(plan.min)); divider.setAttribute('aria-valuemax', String(Math.floor(plan.max))); divider.setAttribute('aria-valuenow', String(plan.width)); }
      }
    }
    return { kind, docked, plan };
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; refresh(); }); };
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'data-open', 'data-managed', 'data-layout', 'data-dock-width'] });
  window.addEventListener('resize', schedule);
  window.addEventListener('spga:layout-change', refresh);
  const api = { refresh, dispose() {
    observer.disconnect(); if (frame) cancelAnimationFrame(frame);
    window.removeEventListener('resize', schedule); window.removeEventListener('spga:layout-change', refresh);
    delete root.dataset.spgaDockKind; root.style.removeProperty('--spga-dock-width'); style.remove(); delete window.__spgaHelperLayout;
  } };
  window.__spgaHelperLayout = api; refresh(); return api;
}

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

async function discoverPersonalSettingsAccount() {
  const urls = [...new Set(Array.from(document.querySelectorAll('link[href],script[src]'), element => element.href || element.src || ''))].filter(value => {
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'static.cdn.haiserve.com' && /\/seatalk\/fe\/static\/js\/chunk-src-[^/]+\.js$/.test(url.pathname); } catch (_) { return false; }
  });
  if (urls.length !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  const module = await import(urls[0]);
  const sessions = [...new Set(Object.values(module))].filter(value => value && typeof value === 'object' && value.loggedIn === true && Number.isSafeInteger(value.userId) && value.userId > 0);
  if (sessions.length !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  return sessions[0].userId;
}
function installPersonalSettingsBridge() {
  if (window.__spgaSettingsBridgeInstalled) return;
  window.__spgaSettingsBridgeInstalled = true;
  window.addEventListener('spga:settings-request', async event => {
    let request;
    try {
      if (typeof event.detail !== 'string' || event.detail.length > 10 * 1024 * 1024) return;
      request = JSON.parse(event.detail);
      if (!request || !/^[a-z0-9-]{8,80}$/i.test(request.id) || !Number.isSafeInteger(request.account) || request.account <= 0 || !['load','save'].includes(request.kind)) return;
      // Verify the live page account independently; a DOM event cannot choose another account's notes.
      const currentAccount = await unsafeWindow.Function(`return (${discoverPersonalSettingsAccount.toString()})();`)();
      if (currentAccount !== request.account) throw Error('METADATA_ACCOUNT_CHANGED');
      const key = 'seatalk-personal-sticker-settings-v1:' + request.account;
      const current = validateSettingsSnapshot(GM_getValue(key,{schema:1,revision:0,items:[]}));
      let result = current;
      if (request.kind === 'save') {
        if (current.revision !== request.revision) throw Error('METADATA_CHANGED');
        result = validateSettingsSnapshot({schema:1,revision:current.revision+1,items:request.items});
        GM_setValue(key,result);
      }
      window.dispatchEvent(new CustomEvent('spga:settings-response',{detail:JSON.stringify({id:request.id,ok:true,value:result})}));
    } catch (error) {
      if (request?.id) window.dispatchEvent(new CustomEvent('spga:settings-response',{detail:JSON.stringify({id:request.id,ok:false,error:['METADATA_ACCOUNT_CHANGED','METADATA_CHANGED','METADATA_STORAGE_INVALID','METADATA_INVALID','METADATA_DUPLICATE','METADATA_KEYWORDS_LIMIT'].includes(error.message)?error.message:'METADATA_SAVE_FAILED'})}));
    }
  });
}

  function setHelperLocale(locale) {
    if (locale !== "zh" && locale !== "en") return;
    state.locale = locale;
    saveState();
    renderPanel();
    window.dispatchEvent(new CustomEvent("spga:locale-change", {detail:locale}));
  }
  window.addEventListener("spga:locale-request", event => setHelperLocale(event.detail));
  function startHelperLayout() {
    try {
      if (typeof unsafeWindow !== "undefined" && typeof unsafeWindow.Function === "function") {
        unsafeWindow.Function(`return (${installHelperLayout.toString()})();`)();
      }
    } catch (_) { /* Keep the ordinary floating helper if layout setup is unavailable. */ }
  }
  function init() {
    startHelperLayout();
    installPersonalSettingsBridge();
    window.visualViewport?.addEventListener("resize", positionPanelNearToggle);
    window.visualViewport?.addEventListener("scroll", positionPanelNearToggle);
    window.addEventListener('spga:collections-back', () => {
      document.getElementById(PANEL_ID)?.classList.add('spga-open');
      positionPanelNearToggle();
    });
    readSavedState();
    injectStyles();
    createPanel();
    showUpdateNoticeIfNeeded();
    bindPanelEvents();
    bindHookStatusEvents();
    bindGroupStatus();
    injectPageHook();
    sendHookConfig();
  }

  // 仅供本地自动测试读取纯解析函数。正常安装时没有这个标记，不会暴露任何接口。
  if (globalThis.__SPGA_TEST_MODE__ === true) {
    globalThis.__SPGA_TEST_API__ = {
      installHelperLayout, launchFavoritesGallery, openCollectionsWorkspace, groupUI, bindGroupStatus, confirmGroupAvatar, bindPanelEvents, injectStyles,
      localizeDiagnosticMessage, panelViewport, bindPanelDrag, positionPanelNearToggle,
      sanitizeDiagnosticText,
      getDiagnosticEnvironment,
      buildDiagnosticReport,
      addDiagnostic,
      copyDiagnosticReport,
      showManualDiagnosticReport,
      createPanel,
      renderPanel,
      bindHookStatusEvents,
      startAvatarApply,
      startAvatarVerification,
      showSuccessCelebration, showUpdateNotice,
      state,
      countGifFrames,
      countAnimatedWebpFrames,
      countAnimatedPngFrames,
      detectAnimationFromBytes,
      sortRecentCandidates,
      isStickerPickerContextText,
      shouldShowUpdateNotice,
    };
    return;
  }

  if (document.body) {
    init();
  } else {
    window.addEventListener("DOMContentLoaded", init, { once: true });
  }
})();
