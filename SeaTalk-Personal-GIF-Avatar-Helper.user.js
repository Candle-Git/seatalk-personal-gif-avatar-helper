// ==UserScript==
// @name         SeaTalk 个人 GIF 头像助手
// @name:en      SeaTalk Personal GIF Avatar Helper
// @namespace    https://seatalkweb.com/
// @version      4.0.0
// @description  将聊天中的 GIF 设为个人或群头像，支持群目标确认、成功提示和脱敏诊断。
// @description:en Use chat GIFs as personal or group avatars, with group confirmation, success feedback and sanitized diagnostics.
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
   * 2. 点击右下角“GIF头像助手”。
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
  const SCRIPT_VERSION = "4.0.0";
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
      title: "SeaTalk GIF 头像助手",
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
      updateTitle: "支持更新群头像了！",
      updateSubtitle: "4.0.0：让你的个人头像和群头像一起动起来。",
      updateHighlightOne: "新增「当前群头像」页签，打开群设置即可识别目标群",
      updateHighlightTwo: "每次更换群头像前，确认群名与 GIF 预览",
      updateHighlightThree: "自动检查群头像更新，成功弹窗后可继续更换",
      updateHighlightFour: "全新紧凑界面；随机挑选先预览，再点击更换",
      updateClose: "知道了，去试试！",
      toggleLabel: "语言",
      helperToggle: "GIF头像助手",
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
      title: "SeaTalk GIF Avatar",
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
      updateTitle: "Group GIF avatars are here!",
      updateSubtitle: "4.0.0: bring both personal and group avatars to life.",
      updateHighlightOne: "New Group avatar tab: open group settings to identify the target",
      updateHighlightTwo: "Confirm the group name and GIF before every group update",
      updateHighlightThree: "Automatically check the group avatar and show a success popup",
      updateHighlightFour: "Compact UI: preview random GIFs before applying them",
      updateClose: "Got it — let me try!",
      toggleLabel: "Language",
      helperToggle: "GIF Avatar",
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
      console.warn("[SeaTalk GIF Avatar Helper] 读取本地设置失败：", error);
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
      console.warn("[SeaTalk GIF Avatar Helper] 保存本地设置失败：", error);
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

  function positionPanelNearToggle() {
    const toggle = document.getElementById(TOGGLE_ID);
    const panel = document.getElementById(PANEL_ID);
    if (!toggle || !panel || !panel.classList.contains("spga-open")) {
      return;
    }

    const margin = 10;
    const gap = 10;
    const toggleRect = toggle.getBoundingClientRect();
    const panelWidth = Math.min(390, window.innerWidth - margin * 2);
    const availableHeight = Math.max(220, window.innerHeight - margin * 2);

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

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
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
        overflow: auto;
        overscroll-behavior: contain;
      }

      body:has(#${PANEL_ID}.spga-open) #${TOGGLE_ID} { visibility: hidden; }
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
      textContent: "GIF!",
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
    if (item.level === "error") {
      return `${t("diagnosticErrorGeneric")} ${item.message}`;
    }
    if (item.level === "success") {
      return `${t("diagnosticSuccessGeneric")} ${item.message}`;
    }
    return `${t("diagnosticInfoGeneric")} ${item.message}`;
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
    const close = createButton("×", "close-panel");
    close.setAttribute("aria-label", groupText("关闭助手", "Close helper"));
    close.addEventListener("click", () => panel.classList.remove("spga-open"));
    header.append(close);

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
        title: `SeaTalk GIF Avatar Helper v${SCRIPT_VERSION}`,
        "aria-label": `SeaTalk GIF Avatar Helper version ${SCRIPT_VERSION}`,
      },
    });
    const creditRow = createElement("div", { className: "spga-credit-row" });
    creditRow.append(creditButton, versionBadge);
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

    panel.append(header, body, footer);
    window.requestAnimationFrame(positionPanelNearToggle);
  }

  function buildStatusText() {
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

  function startAvatarVerification(operation) {
    clearVerificationTimer();
    const startedAt = Date.now();
    state.verificationTimer = window.setInterval(() => {
      // Even an already-queued timer must not mutate a later attempt.
      if (state.activeOperation !== operation) return;
      const currentUrls = getCurrentPersonalAvatarUrls();
      const containsGifId = currentUrls.some((url) => url.includes(operation.gifId));
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
          state.locale = locale;
          saveState();
          renderPanel();
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
        startAvatarVerification(state.activeOperation);
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
        const userId = findCurrentUserId();
        if (!userId) {
          result = { type: "error", code: "ACCOUNT_MISSING", fallbackAvailable: false,
            message: "直接更新失败：没有识别到当前账号 ID。请刷新页面后重试。" };
          return;
        }
        report({ type: "stage", code: "API_PENDING",
          message: "当前账号已识别，正在提交 ContactUpdateUserInfo。" });
        await Reflect.apply(runtime.esmUpdater.updateUserInfo, runtime.esmUpdater, [
          userId, { avatar: operation.gifId },
        ]);
        result = { type: "direct-submitted", chunkName: runtime.esmChunkUrl.split("/").pop() || runtime.esmChunkUrl };
      } catch (error) {
        result = { type: "error", fallbackAvailable: false, code: "API_ERROR",
          errorCode: /^-?\d{1,6}$/.test(String(error?.errorCode ?? "")) ? String(error.errorCode) : null,
          message: `SeaTalk 直接更新失败：${String(error?.message || error || "未知错误").slice(0, 240)}` };
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

  function init() {
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
      groupUI, bindGroupStatus, confirmGroupAvatar, bindPanelEvents, injectStyles,
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
      showSuccessCelebration,
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
