// ==UserScript==
// @name         SeaTalk 表情助手
// @name:zh-CN   SeaTalk 表情助手 · v5.3.0
// @name:en      SeaTalk Sticker Helper · v5.3.0
// @namespace    https://seatalkweb.com/
// @version      5.3.0
// @description  从聊天工具栏点选发送表情，拖选收藏，按组整理、搜索和备份个人备注。
// @description:en Send a sticker from the chat toolbar, collect stickers from messages, and organize, search and back up your notes.
// @author       Yixin.Zhong × Codex
// @match        https://seatalkweb.com/*
// @match        https://*.seatalkweb.com/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      f.haiserve.com
// @run-at       document-idle
// @downloadURL  https://update.greasyfork.org/scripts/588931/SeaTalk%20Sticker%20Helper.user.js
// @updateURL    https://update.greasyfork.org/scripts/588931/SeaTalk%20Sticker%20Helper.meta.js
// ==/UserScript==

(function () {
  "use strict";

  /*
   * 从聊天输入框工具栏打开表情快选。
   * 在管理页中选择、分组和备注。批量发送会列出会话与所选表情供核对。
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
  const SCRIPT_VERSION = "5.3.0";
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
      selectedChecking: "已选好，点击应用时会检查头像服务。",
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
      statusChecking: "点击应用时会检查头像服务。",
      statusApplying: "正在更新头像。",
      requestStillPending: "上一请求仍在等待接口返回，请勿重复提交。",
      statusError: "遇到问题，请展开调试信息查看详情。",
      verificationConfirmed: "SeaTalk 已确认更新成功。页面头像显示可能有短暂缓存。",
      verificationObserved: "页面头像已同步更新。",
      successTitle: "GIF 成功！",
      successMessage: "快去给你的同事炫耀吧",
      successSubtitle: "你的动态头像已经成功上线。",
      successClose: "好耶！",
      nativeViewUnavailable: "头像已保存，SeaTalk 主界面暂未显示。刷新页面即可继续。",
      reloadSeaTalk: "刷新 SeaTalk",
      updateBadge: "NEW",
      updateVersion: "版本 {version}",
      updateTitle: "从聊天工具栏打开表情快选",
      updateSubtitle: "在聊天中发送表情，在管理页整理收藏。",
      updateHighlightOne: "点一张直接发送到当前聊天",
      updateHighlightTwo: "从聊天拖选多张表情，确认后收藏",
      updateHighlightThree: "按组整理收藏，批量写备注",
      updateHighlightFour: "在管理页按住 Ctrl 或 ⌘ 多选，按住 Shift 连选",
      updateClose: "知道了，去试试！",
      toggleLabel: "语言",
      helperToggle: "SeaTalk 表情助手",
      dragHint: "可拖动到不挡操作的位置",
      credit: "Yixin.Zhong × Codex 制作",
      creditEasterEggMessage: "已解锁 GIF 头像",
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
      selectedChecking: "Selected. The avatar service is checked when you apply.",
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
      statusChecking: "The avatar service is checked when you apply.",
      statusApplying: "Updating your avatar.",
      requestStillPending: "The previous request is still pending. Please wait before submitting again.",
      statusError: "Something went wrong. Expand diagnostics for details.",
      verificationConfirmed: "SeaTalk confirmed the update. The visible avatar may be briefly cached.",
      verificationObserved: "The avatar is now updated on the page.",
      successTitle: "GIF applied!",
      successMessage: "Go show it off to your teammates",
      successSubtitle: "Your animated avatar is now live.",
      successClose: "Love it!",
      nativeViewUnavailable: "Your avatar was saved. Refresh SeaTalk to restore the main view.",
      reloadSeaTalk: "Refresh SeaTalk",
      updateBadge: "NEW",
      updateVersion: "Version {version}",
      updateTitle: "Open Quick stickers in the chat toolbar",
      updateSubtitle: "Send from your chat and organize favorites in My stickers.",
      updateHighlightOne: "Click a sticker to send it to the current chat",
      updateHighlightTwo: "Drag across chat stickers and confirm to save them",
      updateHighlightThree: "Organize favorites in groups and edit notes in batches",
      updateHighlightFour: "Use Ctrl or ⌘ to toggle items and Shift to select a range",
      updateClose: "Got it — let me try!",
      toggleLabel: "Language",
      helperToggle: "SeaTalk Sticker Helper",
      dragHint: "Drag this button anywhere convenient",
      credit: "Made by Yixin.Zhong × Codex",
      creditEasterEggMessage: "GIF avatars unlocked",
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
  const avatarCheck = { sequence: 0, active: 0, checkpoint: "", restored: false };
  const CHECK_STORAGE_KEY = STORAGE_KEY + ":check:" + SCRIPT_VERSION;
  const CHECK_MESSAGES = {
    CHECK_MODULES: ["正在查找头像模块并观察主界面", "Checking avatar modules and observing the main view"],
    CHECK_PROFILE: ["正在读取当前个人资料并观察主界面", "Reading your profile and observing the main view"],
    CHECK_OK: ["两步检查均完成，观察期间主界面持续可见", "Both checks completed and the main view stayed visible"],
    CHECK_NO_VIEW: ["检查开始时未找到可见的 SeaTalk 主界面", "The SeaTalk main view was unavailable before the check"],
    CHECK_MODULES_VIEW_LOST: ["查找模块期间，SeaTalk 主界面消失", "The main view disappeared during the module check"],
    CHECK_PROFILE_VIEW_LOST: ["读取资料期间，SeaTalk 主界面消失", "The main view disappeared during the profile check"],
    CHECK_MODULES_FAILED: ["头像模块检查失败", "The avatar module check failed"],
    CHECK_PROFILE_FAILED: ["当前账号的资料读取检查失败", "The profile check for the current account failed"],
    CHECK_MODULES_TIMEOUT: ["等待头像模块超时", "The module check timed out"],
    CHECK_PROFILE_TIMEOUT: ["等待读取资料超时", "The profile check timed out"],
    CHECK_HOOK_FAILED: ["页面未响应检查请求", "The page did not acknowledge the check"],
    CHECK_BUSY: ["另一项头像操作正在进行，检查未开始", "Another avatar operation is active"],
  };
  const state = {
    avatarUnlocked: false,
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
    RESOURCE_SERVICE_MISSING: ["submit", "头像资源服务不兼容，未提交头像更新", "Avatar resource service incompatible; no update submitted"],
    RESOURCE_FILE_URL_MISSING: ["discovery", "未找到图片地址服务", "Image URL service not found"],
    RESOURCE_FILE_URL_AMBIGUOUS: ["discovery", "图片地址服务匹配不唯一", "Multiple image URL services matched"],
    RESOURCE_PROFILE_SERVICE_MISSING: ["discovery", "未找到个人资料读取服务", "Profile read service not found"],
    RESOURCE_MODULE_DECLARATIONS_INVALID: ["discovery", "无法唯一确认当前版本的头像模块", "Could not identify the current build’s avatar modules unambiguously"],
    RESOURCE_ACCOUNT_MODULE_MISSING: ["discovery", "已加载资源中未找到兼容的账号模块", "No compatible account module found in loaded resources"],
    RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED: ["discovery", "账号模块加载失败", "Account module import failed"],
    ACCOUNT_AMBIGUOUS: ["discovery", "登录账号匹配不唯一，已停止更新", "Multiple signed-in accounts matched; update stopped"],
    API_PENDING: ["submit", "正在提交头像更新", "Submitting avatar update"],
    API_SUCCESS: ["submit", "接口已确认更新成功", "API confirmed the update"],
    API_ERROR: ["submit", "接口返回错误，请检查 Console 后重试", "API returned an error; check Console before retrying"],
    VISUAL_SUCCESS: ["verification", "已观察到页面头像变化", "Avatar change observed on page"],
    NATIVE_VIEW_UNAVAILABLE: ["verification", "头像已保存，但 SeaTalk 主界面暂未显示", "Avatar saved, but the SeaTalk main view is unavailable"],
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
      ...(Object.hasOwn(CHECK_MESSAGES, avatarCheck.checkpoint) ? { avatarCheck: avatarCheck.checkpoint } : {}),
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
    const toggle = document.getElementById('spga-quick-toggle') || document.getElementById(TOGGLE_ID);
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
    let helperActivated = false;
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
      if (panel?.classList.toggle("spga-open")) {
        if (!helperActivated) {
          helperActivated = true;
          activateHelperPanel(panel);
        } else if (state.avatarUnlocked) {
          renderPanel();
        }
        if (!state.avatarUnlocked) openCollectionsWorkspace();
      }
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

      #${SUCCESS_MODAL_ID} .spga-success-recovery { margin: 10px 0; font-size: 13px; }
      #${SUCCESS_MODAL_ID} .spga-success-recovery p { margin: 0 0 6px; }

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

  function syncCollectionsNavigation() {
    const workspace = document.getElementById("st-favorites-curator");
    const tabs = workspace?.shadowRoot?.querySelector(".workspace-tabs");
    if (tabs) tabs.hidden = !state.avatarUnlocked;
  }

  function bindCreditGesture(panel) {
    if (state.avatarUnlocked) return;
    const clicks = [];
    const reset = () => { clicks.length = 0; };
    const onClick = event => {
      const path = event.composedPath();
      if (!path[0]?.closest?.('#helperCredit,[data-action="credit-easter-egg"]')) { reset(); return; }
      const workspace = document.getElementById("st-favorites-curator");
      const credit = workspace?.dataset.open === "true"
        ? workspace.shadowRoot?.getElementById("helperCredit")
        : panel.classList.contains("spga-open") && panel.querySelector('[data-action="credit-easter-egg"]');
      if (!credit || !path.includes(credit)) { reset(); return; }
      const now = performance.now();
      while (clicks.length && now - clicks[0] > 10000) clicks.shift();
      clicks.push(now);
      if (clicks.length < 20) return;

      state.avatarUnlocked = true;
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", reset);
      showCreditEasterEgg(credit);
      syncCollectionsNavigation();
      bindHookStatusEvents();
      bindGroupStatus();
      new MutationObserver(syncGroupWatch).observe(panel, { attributes: true, attributeFilter: ["class"] });
      if (panel.classList.contains("spga-open")) renderPanel();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", reset);
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

  let dismissSuccessNotice;
  function showSuccessCelebration(gifId, groupName = "") {
    const normalizedGifId = String(gifId || state.selected?.gifId || "");
    if (state.successModalShownForGifId === normalizedGifId) {
      return;
    }
    state.successModalShownForGifId = normalizedGifId;
    // Do not steal focus/selection from a report the user is copying.
    if (state.manualDiagnosticReport) return;

    dismissSuccessNotice?.();
    const previousFocus = document.activeElement;

    const overlay = createElement("div", {
      attributes: {
        id: SUCCESS_MODAL_ID,
        "aria-labelledby": `${SUCCESS_MODAL_ID}-title`,
        role: "dialog",
        "aria-modal": "true",
      },
    });
    const card = createElement("div", { className: "spga-success-card" });

    for (let index = 0; index < 4; index += 1) {
      card.append(createElement("span", { className: "spga-success-spark", attributes: { "aria-hidden": "true" } }));
    }
    card.append(createElement("div", { className: "spga-success-badge", textContent: "✓", attributes: { "aria-hidden": "true" } }));

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
    const closeButton = createElement("button", {
      className: "spga-success-close",
      textContent: t("successClose"),
      attributes: {
        type: "button",
      },
    });

    const closeModal = () => {
      document.removeEventListener("keydown", handleKeyDown);
      const restoreFocus = overlay.contains(document.activeElement);
      overlay.remove();
      dismissSuccessNotice = null;
      if (restoreFocus && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
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
    dismissSuccessNotice = closeModal;

    card.append(title, message);
    card.append(createElement("p", { className: "spga-success-subtitle",
      textContent: groupName ? groupText("可以继续选择 GIF 并更换，无需刷新。", "You can choose another GIF without refreshing.") : t("successSubtitle") }));
    if (!groupName) {
      const recovery = createElement("div", { className: "spga-success-recovery", attributes: { hidden: "" } });
      const reload = createElement("button", { textContent: t("reloadSeaTalk"), attributes: { type: "button" } });
      reload.addEventListener("click", () => location.reload());
      recovery.append(createElement("p", { textContent: t("nativeViewUnavailable") }), reload);
      card.append(recovery);
    }
    card.append(closeButton);
    overlay.append(card);
    document.body.append(overlay);
    closeButton.focus({ preventScroll: true });
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
    if (groupUI.mode === "personal") {
      if (!avatarCheck.restored) {
        avatarCheck.restored = true;
        try {
          const saved = sessionStorage.getItem(CHECK_STORAGE_KEY);
          if (Object.hasOwn(CHECK_MESSAGES, saved)) avatarCheck.checkpoint = saved;
        } catch (_) { /* Storage may be disabled. */ }
      }
      const check = createButton(groupText("只检查，不更换头像", "Check without changing avatar"), "check-avatar");
      check.disabled = Boolean(avatarCheck.active || state.requestPending || groupUI.pending);
      wrapper.append(check, createElement("div", { textContent: avatarCheckText(),
        attributes: { "data-role": "avatar-check-result", role: "status" } }));
    }
    const copyButton = createElement("button", {
      className: "spga-button",
      textContent: state.locale === "zh" ? "复制脱敏诊断" : "Copy sanitized diagnostics",
      attributes: { type: "button", "data-action": "copy-diagnostics" },
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

  function createCreditRow() {
    const creditButton = createElement("button", {
      className: "spga-credit",
      textContent: t("credit"),
      attributes: {
        type: "button",
        "aria-label": t("credit"),
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
    return creditRow;
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
    heading.append(createElement("h2", { className: "spga-title", textContent: t("title") }));
    if (state.avatarUnlocked) heading.append(createElement("p", { className: "spga-subtitle", textContent: t("subtitle") }));
    header.append(heading, createLanguageToggle());
    bindPanelDrag(header, panel);
    const close = createButton("×", "close-panel");
    close.setAttribute("aria-label", groupText("关闭助手", "Close helper"));
    close.classList.add("spga-window-close");
    close.title = groupText("关闭助手，保留当前选择", "Close helper; keep your selection");
    close.addEventListener("click", () => panel.classList.remove("spga-open"));
    const minimize = createButton("−", "minimize-panel");
    minimize.classList.add("spga-window-minimize");
    minimize.setAttribute("aria-label", groupText("收起助手", "Minimize helper"));
    minimize.title = groupText("收起，保留当前选择", "Minimize; keep your selection");
    minimize.addEventListener("click", () => panel.classList.remove("spga-open"));
    header.append(minimize, close);

    if (!state.avatarUnlocked) {
      const body = createElement("div", { className: "spga-body" });
      const card = createElement("section", { className: "spga-path-card" });
      const open = createButton(groupText("打开我的表情", "Open my stickers"), "open-favorites", "spga-button-primary");
      open.addEventListener("click", openCollectionsWorkspace);
      card.append(createElement("h3", { className: "spga-path-title", textContent: groupText("我的表情", "My stickers") }),
        createElement("p", { className: "spga-path-description", attributes: { id: "spga-collections-hint", role: "status" },
          textContent: groupText("在聊天输入框旁打开表情面板，切换到爱心收藏页，再打开我的表情。", "Open the sticker picker beside the chat composer, select Favorites (heart), then open My stickers.") }), open);
      body.append(card);
      const footer = createElement("footer", { className: "spga-sticky-footer" });
      footer.append(createCreditRow());
      panel.append(header, body, footer);
      window.requestAnimationFrame(positionPanelNearToggle);
      return;
    }

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
    applyButton.disabled = personalApplyDisabled();
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
    if (avatarCheck.active) applyButton.disabled = true;
    randomButton.disabled = randomButton.disabled || !!groupUI.pending;
    footer.append(status, applyButton, createCreditRow());

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

  function isNativeMainViewVisible() {
    const view = document.querySelector("#root .home-main-window");
    return Boolean(view?.getClientRects().length);
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
    let missingViewChecks = 0;
    state.verificationTimer = window.setInterval(() => {
      // Even an already-queued timer must not mutate a later attempt.
      if (state.activeOperation !== operation) return;
      if (!state.requestPending && state.apiConfirmedGifId === operation.gifId &&
          operation.nativeViewWasVisible && !isNativeMainViewVisible()) {
        // Give the native view time to remount before treating it as unavailable.
        if (++missingViewChecks < 2) return;
        clearVerificationTimer();
        state.hookStatus = t("nativeViewUnavailable");
        addDiagnostic("", "info", "NATIVE_VIEW_UNAVAILABLE");
        document.getElementById(SUCCESS_MODAL_ID)?.querySelector(".spga-success-recovery")?.removeAttribute("hidden");
        renderPanel();
        return;
      }
      missingViewChecks = 0;
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
    if (!state.avatarUnlocked || groupUI.pending || avatarCheck.active) return;
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

    const operation = Object.freeze({ id: state.diagnosticAttempt, gifId: state.selected.gifId,
      nativeViewWasVisible: isNativeMainViewVisible() });
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

  function syncGroupWatch() {
    if (!state.avatarUnlocked) return;
    const watching = groupUI.mode === "group" && document.getElementById(PANEL_ID)?.classList.contains("spga-open");
    if (watching && !state.pageHookReady && !injectPageHook()) return;
    if (state.pageHookReady) sendHookConfig(watching ? "watch-group" : "unwatch-group");
  }

  function createTargetSelector() {
    const box = createElement("div", { className: "spga-path-card" });
    const row = createElement("div", { className: "spga-target-tabs", attributes: { role: "tablist", "aria-label": groupText("头像目标", "Avatar target") } });
    for (const [mode, zh, en] of [["personal", "我的头像", "My avatar"], ["group", "当前群头像", "Group avatar"]]) {
      const button = createElement("button", { textContent: groupText(zh, en), attributes: { type: "button", role: "tab", "aria-selected": String(groupUI.mode === mode) } });
      button.className = "spga-button spga-target-tab";
      button.disabled = !!groupUI.pending || state.requestPending || Boolean(avatarCheck.active);
      button.addEventListener("click", () => {
        groupUI.mode = mode; groupUI.message = "";
        syncGroupWatch();
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
    if (!state.avatarUnlocked || groupUI.dialog || groupUI.pending || state.requestPending || avatarCheck.active || !groupUI.context || !isCustomGifStickerId(state.selected?.gifId)) return;
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
    const panel = document.getElementById(PANEL_ID);
    bindCreditGesture(panel);
    panel.addEventListener("click", async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const action = target.getAttribute("data-action");
      if (!action) {
        return;
      }
      if (action === "check-avatar") {
        startAvatarCheck();
        return;
      }

      if (action === "set-locale") {
        const locale = target.dataset.locale;
        if (locale === "zh" || locale === "en") {
          setHelperLocale(locale);
        }
        return;
      }

      if (!state.avatarUnlocked) return;
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

    panel.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }

      if (!state.avatarUnlocked || target.getAttribute("data-role") !== "local-select") {
        return;
      }

      const preset = LOCAL_GIF_PRESETS.find((item) => item.key === target.value);
      if (preset) {
        state.examplesOpen = false;
        selectCandidate(preset);
      }
    }, true);
  }

  function activateHelperPanel(panel) {
    installPersonalSettingsBridge();
    startHelperLayout();
    bindPanelEvents();
    renderPanel();
    showUpdateNoticeIfNeeded();
  }

  function createPanel({ renderContents = true } = {}) {
    if (!document.getElementById(PANEL_ID)) {
      const panel = createElement("section", {
        attributes: {
          id: PANEL_ID,
        },
      });
      document.body.appendChild(panel);
    }

    if (renderContents) renderPanel();
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

  function personalApplyDisabled() {
    return Boolean(!state.selected || state.requestPending || groupUI.pending || avatarCheck.active ||
      (state.enabled && !state.directUpdaterFailed));
  }

  function avatarCheckText() {
    if (!Object.hasOwn(CHECK_MESSAGES, avatarCheck.checkpoint)) return "";
    const message = CHECK_MESSAGES[avatarCheck.checkpoint][state.locale === "zh" ? 0 : 1];
    return groupText("最近检查记录", "Last check") + " · " + avatarCheck.checkpoint + " · " + message;
  }

  function showAvatarCheck(code) {
    if (!Object.hasOwn(CHECK_MESSAGES, code)) return;
    avatarCheck.checkpoint = code;
    avatarCheck.restored = true;
    try { sessionStorage.setItem(CHECK_STORAGE_KEY, code); } catch (_) { /* In-memory result is still available. */ }
    // Updating the read-only check must not remount GIF previews or initiate image loads.
    const panel = document.getElementById?.(PANEL_ID);
    if (!panel) return;
    const result = panel.querySelector('[data-role="avatar-check-result"]');
    if (result) result.textContent = avatarCheckText();
    const check = panel.querySelector('[data-action="check-avatar"]');
    if (check) check.disabled = Boolean(avatarCheck.active || state.requestPending || groupUI.pending);
    const apply = panel.querySelector('[data-action="enable"]');
    if (apply && groupUI.mode === "personal") apply.disabled = personalApplyDisabled();
    for (const tab of panel.querySelectorAll('[role="tab"]')) {
      tab.disabled = Boolean(avatarCheck.active || state.requestPending || groupUI.pending);
    }
    if (groupUI.mode === "personal") setStatus(buildStatusText());
  }

  function startAvatarCheck() {
    if (!state.avatarUnlocked || avatarCheck.active || state.requestPending || groupUI.pending || groupUI.dialog || groupUI.mode !== "personal") return;
    const checkId = ++avatarCheck.sequence;
    avatarCheck.active = checkId;
    if (!state.pageHookReady && !injectPageHook()) {
      avatarCheck.active = 0;
      showAvatarCheck("CHECK_HOOK_FAILED");
      return;
    }
    let acknowledged = false;
    const onCheck = ({ detail }) => {
      if (detail?.type === "avatar-check" && detail.checkId === checkId) acknowledged = true;
    };
    window.addEventListener(HOOK_EVENTS.statusEvent, onCheck);
    try {
      window.dispatchEvent(new CustomEvent(HOOK_EVENTS.configEvent, { detail: { command: "check-avatar", checkId } }));
    } finally {
      window.removeEventListener(HOOK_EVENTS.statusEvent, onCheck);
      if (!acknowledged) {
        avatarCheck.active = 0;
        showAvatarCheck("CHECK_HOOK_FAILED");
      }
    }
  }

  function bindHookStatusEvents() {
    window.addEventListener(HOOK_EVENTS.statusEvent, (event) => {
      const detail = event.detail || {};
      if (detail.type === "avatar-check") {
        if (!avatarCheck.active || detail.checkId !== avatarCheck.active || !Object.hasOwn(CHECK_MESSAGES, detail.code)) return;
        if (!["CHECK_MODULES", "CHECK_PROFILE"].includes(detail.code)) avatarCheck.active = 0;
        showAvatarCheck(detail.code);
        return;
      }
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
          if (!avatarCheck.active) state.diagnosticsOpen = false;
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

      if (!avatarCheck.active) renderPanel();
    });
  }

  function injectPageHook() {
    if (!state.avatarUnlocked) return false;
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

/* Discover only observed SeaTalk modules; never guess a build hash or an account. */
const AVATAR_RESOURCE_DISCOVERY_CODES = [
  'RESOURCE_FILE_URL_MISSING', 'RESOURCE_FILE_URL_AMBIGUOUS',
  'RESOURCE_PROFILE_SERVICE_MISSING', 'RESOURCE_MODULE_DECLARATIONS_INVALID', 'RESOURCE_ACCOUNT_MODULE_MISSING',
  'RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED', 'ACCOUNT_MISSING', 'ACCOUNT_AMBIGUOUS',
];

const AVATAR_CDN_MODULE = /^https:\/\/static\.cdn\.haiserve\.com\/seatalk\/fe\/static\/js\/chunk-(styles|src|db-pure)-[A-Za-z0-9_-]+\.js$/;
// This is an entry dependency of the standalone media viewer. Evaluating it
// mounts a second application in #root, even when the viewer was only prefetched.
const MEDIA_VIEWER_MODULE = 'https://static.cdn.haiserve.com/seatalk/fe/static/js/chunk-src-DcOtnrHP.js';

function getAvatarModuleCandidates() {
  const html = document.documentElement;
  const declaredBuild = html?.getAttribute('data-web-semantic-version') === '3.72.0' &&
    html.getAttribute('data-release-hash') === 'cba35692d';
  const styles = new Set(), accounts = new Set();
  let viewerDeclared = false;
  const selector = declaredBuild ? 'link[rel~="modulepreload"][href]'
    : 'link[rel~="modulepreload"][href],script[type="module"][src]';
  for (const el of document.head.querySelectorAll(selector)) {
    const url = el.href || el.src;
    const family = typeof url === 'string' && AVATAR_CDN_MODULE.exec(url)?.[1];
    if (family === 'styles') styles.add(url);
    if (url === MEDIA_VIEWER_MODULE) viewerDeclared = true;
    else if (family === 'db-pure' || (!declaredBuild && family === 'src')) accounts.add(url);
  }
  if ((declaredBuild && styles.size !== 1) || styles.size > 1 ||
      (!accounts.size && (declaredBuild || viewerDeclared))) throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');
  if (styles.size && !accounts.size && typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function') {
    // On other builds, accept only an actual script dependency from the narrow
    // db-pure family. Fetch, preload and historical chunk-src entries are not
    // evidence that the main app evaluated them.
    for (const entry of performance.getEntriesByType('resource')) {
      if (entry.initiatorType === 'script' && AVATAR_CDN_MODULE.exec(entry.name)?.[1] === 'db-pure') accounts.add(entry.name);
    }
  }
  if (styles.size && !accounts.size) throw Error('RESOURCE_ACCOUNT_MODULE_MISSING');
  if (accounts.size > 1) throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');
  return { styles: [...styles], accounts: [...accounts], declaredBuild };
}

function findAvatarUpdater(module, declaredBuild) {
  return Object.values(module).find(value => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
    // In this build ContactService stores its dispatcher as an own data field.
    // Looking up arbitrary method names first can touch unrelated lazy exports.
    if (declaredBuild && !Object.getOwnPropertyDescriptor(value, 'onUserInfoChanged')?.value) return false;
    return typeof value.updateUserInfo === 'function' && (value.onUserInfoChanged || value.onUserInfosChanged);
  });
}

async function resolveAvatarResourceServices({ chunkUrl, updater, module, urls, loadModule }) {
  const fileUrls = [...new Set(Object.values(module))].filter(value => {
    if (typeof value !== 'function') return false;
    const source = Function.prototype.toString.call(value);
    return source.includes('maxWidth') && source.includes('gfsToken') && source.includes('blob:');
  });
  if (!fileUrls.length) throw Error('RESOURCE_FILE_URL_MISSING');
  if (fileUrls.length !== 1) throw Error('RESOURCE_FILE_URL_AMBIGUOUS');
  if (typeof updater?.forceFetchInfo !== 'function') throw Error('RESOURCE_PROFILE_SERVICE_MISSING');

  if (AVATAR_CDN_MODULE.exec(chunkUrl)?.[1] !== 'styles') throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');
  const candidates = new Set(urls.filter(url => url !== MEDIA_VIEWER_MODULE &&
    ['src', 'db-pure'].includes(AVATAR_CDN_MODULE.exec(url)?.[1])));
  if (!candidates.size) throw Error('RESOURCE_ACCOUNT_MODULE_MISSING');
  if (candidates.size !== 1) throw Error('RESOURCE_MODULE_DECLARATIONS_INVALID');

  const sessions = new Set();
  let accountModule;
  try { accountModule = await loadModule([...candidates][0]); }
  catch (_) { throw Error('RESOURCE_ACCOUNT_MODULE_IMPORT_FAILED'); }
  for (const value of Object.values(accountModule)) {
    if (value && typeof value === 'object' && value.loggedIn === true &&
        Number.isSafeInteger(value.userId) && value.userId > 0 &&
        typeof value.fileServerToken === 'string' && value.fileServerToken.length > 0) {
      sessions.add(value);
    }
  }
  if (!sessions.size) throw Error('ACCOUNT_MISSING');
  if (sessions.size !== 1) throw Error('ACCOUNT_AMBIGUOUS');
  return { session: [...sessions][0], fileUrl: fileUrls[0] };
}

    const runtime = {
      enabled: false,
      esmUpdater: null,
      esmChunkUrl: "",
      esmDiscoveryPromise: null,
      esmDiscoveryFailedFor: "",
      esmAccountModuleUrl: "",
      esmResourceFailure: "",
      directOperation: null,
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

    async function discoverEsmUpdater({ reportFailure = true } = {}) {
      if (runtime.esmUpdater) {
        return true;
      }

      if (runtime.esmDiscoveryPromise) {
        return runtime.esmDiscoveryPromise;
      }

      runtime.esmDiscoveryPromise = (async () => {
        runtime.esmResourceFailure = "";
        let candidates;
        try { candidates = getAvatarModuleCandidates(); }
        catch (error) {
          runtime.esmResourceFailure = error?.message === "RESOURCE_ACCOUNT_MODULE_MISSING"
            ? error.message : "RESOURCE_MODULE_DECLARATIONS_INVALID";
          if (reportFailure) emit({ type: "compatibility-error", code: runtime.esmResourceFailure });
          return false;
        }
        const chunkUrls = candidates.styles;
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

          const updater = findAvatarUpdater(moduleNamespace, candidates.declaredBuild);

          if (!updater) {
            runtime.esmDiscoveryFailedFor = chunkUrl;
            continue;
          }

          try {
            await resolveAvatarResourceServices({ chunkUrl, updater, module: moduleNamespace,
              urls: candidates.accounts, loadModule: url => import(url) });
          } catch (error) {
            runtime.esmDiscoveryFailedFor = chunkUrl;
            const code = AVATAR_RESOURCE_DISCOVERY_CODES.includes(error?.message)
              ? error.message : "RESOURCE_SERVICE_MISSING";
            runtime.esmResourceFailure = code;
            // Background checks may run before the account module has loaded.
            // Leave the UI alone until discovery succeeds or a requested update times out.
            if (reportFailure) {
              emit({ type: "compatibility-error", code, chunkName: chunkUrl.split("/").pop() || "",
                message: "启动自检失败：头像资源服务未就绪（" + code + "），未提交头像更新。" });
            }
            return false;
          }
          runtime.esmAccountModuleUrl = candidates.accounts[0];
          runtime.esmUpdater = updater;
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
      if (groupOperation || runtime.directOperation || runtime.avatarCheck || !editor || editor.id !== detail.id || editor.name !== detail.name ||
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
    let groupWatchTimer = null, groupObserver = null;
    function setGroupWatch(watching) {
      if (watching === (groupWatchTimer !== null)) return;
      if (watching) {
        groupWatchTimer = window.setInterval(refreshGroupContext, 400);
        if (typeof MutationObserver !== "undefined") {
          groupObserver = new MutationObserver(refreshGroupContext);
          groupObserver.observe(document.body, { childList: true, subtree: true });
        }
        refreshGroupContext();
      } else {
        window.clearInterval(groupWatchTimer);
        groupWatchTimer = null;
        groupObserver?.disconnect();
        groupObserver = null;
        if (groupKey) {
          groupKey = ""; groupRevision++;
          emit({ type: "group-context", context: null });
        }
      }
    }

    function startDirectAvatar(detail) {
      if (groupOperation) return;
      const operation = Object.freeze({ id: detail.attemptId, gifId: detail.gifId });
      if (runtime.directOperation || runtime.avatarCheck) {
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
      const candidates = getAvatarModuleCandidates();
      if (!candidates.styles.includes(runtime.esmChunkUrl) || runtime.esmAccountModuleUrl !== candidates.accounts[0]) {
        throw Error("RESOURCE_MODULE_DECLARATIONS_INVALID");
      }
      const module = await import(runtime.esmChunkUrl);
      return resolveAvatarResourceServices({
        chunkUrl: runtime.esmChunkUrl, updater: runtime.esmUpdater, module,
        urls: candidates.accounts,
        loadModule: url => import(url),
      });
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
          const resourceFailure = runtime.esmResourceFailure;
          result = { type: "error", code: resourceFailure || "SERVICE_MISSING", fallbackAvailable: false,
            message: resourceFailure ? "头像资源准备未完成，未提交个人头像更新；请检查诊断流程码。"
              : "直接更新失败：没有找到 SeaTalk 用户资料更新服务。请刷新页面或重新检查。" };
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
        const codes = new Set([...AVATAR_RESOURCE_DISCOVERY_CODES, "RESOURCE_REGISTER_ERROR", "RESOURCE_INVALID",
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

    function mainViewVisible() {
      const view = document.querySelector("#root .home-main-window");
      const bounds = view?.getBoundingClientRect();
      return Boolean(bounds?.width > 0 && bounds.height > 0 && (typeof view.checkVisibility !== "function" ||
        view.checkVisibility({ visibilityProperty: true, opacityProperty: true })));
    }

    // Observe from immediately before the read until six seconds after it settles.
    // Two consecutive missing samples allow a brief native remount.
    function observeAvatarRead(read, phase) {
      return new Promise((resolve, reject) => {
        const started = Date.now();
        let result, closed = false, finished = false, completedAt = 0, missingSamples = 0;
        const timer = window.setInterval(() => {
          missingSamples = mainViewVisible() ? 0 : missingSamples + 1;
          if (missingSamples >= 2) end("VIEW_LOST");
          else if (!finished && Date.now() - started >= 12000) end("TIMEOUT");
          else if (finished && !missingSamples && Date.now() - completedAt >= 6000) end();
        }, 250);
        function end(failure) {
          if (closed) return;
          closed = true;
          window.clearInterval(timer);
          if (failure) reject(new Error(phase + "_" + failure));
          else resolve(result);
        }
        Promise.resolve().then(read).then(value => {
          if (closed) return;
          result = value;
          finished = true;
          completedAt = Date.now();
        }, () => end(mainViewVisible() ? "FAILED" : "VIEW_LOST"));
      });
    }

    async function checkPersonalAvatar(checkId) {
      if (!Number.isSafeInteger(checkId) || checkId <= 0) return;
      const report = code => emit({ type: "avatar-check", checkId, code });
      if (runtime.avatarCheck || runtime.directOperation || groupOperation) { report("CHECK_BUSY"); return; }
      if (!mainViewVisible()) { report("CHECK_NO_VIEW"); return; }
      const check = {};
      runtime.avatarCheck = check;
      let phase = "CHECK_MODULES", result;
      try {
        report(phase);
        const { session, userId } = await observeAvatarRead(async () => {
          if (!await waitForEsmUpdater() || runtime.avatarCheck !== check) throw new Error();
          const { session } = await discoverAvatarResourceServices();
          if (!session.loggedIn || !Number.isSafeInteger(session.userId) || session.userId <= 0) throw new Error();
          return { session, userId: session.userId };
        }, phase);
        phase = "CHECK_PROFILE";
        report(phase);
        const sameAccount = () => session.loggedIn === true && session.userId === userId;
        await observeAvatarRead(async () => {
          if (!sameAccount()) throw new Error();
          const profiles = await runtime.esmUpdater.forceFetchInfo(userId);
          const own = profiles?.find(row => row.userid === userId)?.userInfo;
          if (!sameAccount() || typeof own?.name !== "string" || typeof own.avatar !== "string") throw new Error();
        }, phase);
        result = sameAccount() ? "CHECK_OK" : "CHECK_PROFILE_FAILED";
      } catch (error) {
        const allowed = ["FAILED", "TIMEOUT", "VIEW_LOST"].map(suffix => phase + "_" + suffix);
        result = allowed.includes(error?.message) ? error.message : phase + "_FAILED";
      } finally {
        runtime.avatarCheck = null;
        report(result);
      }
    }

    window.addEventListener(events.configEvent, ({ detail }) => {
      switch (detail?.command) {
        case "check-avatar": void checkPersonalAvatar(detail.checkId); break;
        case "watch-group": setGroupWatch(true); break;
        case "unwatch-group": setGroupWatch(false); break;
        case "apply-group": applyGroupAvatar(detail); break;
        case "apply-direct": startDirectAvatar(detail); break;
      }
    });

    window.__seatalkPersonalGifAvatarHookReady = true;
    emit({ type: "hook-started" });
  }


  // Collections are run in the page realm, where SeaTalk owns its React state.
  function openCollectionsWorkspace(entry = 'manage') {
    const hint = document.getElementById('spga-collections-hint');
    try {
      if (typeof unsafeWindow === "undefined" || typeof unsafeWindow.Function !== "function") throw new Error('page-context');
      unsafeWindow.Function(`return (${launchFavoritesGallery.toString()})(${JSON.stringify(LOCAL_GIF_PRESETS.map(({ label, gifId }) => ({ label, gifId })))}, ${JSON.stringify(state.locale)}, ${JSON.stringify(entry)});`)();
      syncCollectionsNavigation();
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
function launchFavoritesGallery(presets = [], initialLocale = 'zh', entry = 'manage') {
// Only fixed artwork from this table is inserted into either panel.
const stickerIconPaths = {
  groups: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  'sort-desc': '<path d="M7 4v16m-4-4 4 4 4-4M13 6h8m-8 5h6m-6 5h4"/>',
  'sort-asc': '<path d="M7 20V4M3 8l4-4 4 4m2 10h8m-8-5h6m-6-5h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  collect: '<path d="M14 4H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2v3l4-3h5a2 2 0 0 0 2-2v-4m0-10v7m-3.5-3.5h7"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
  minimize: '<path d="M5 12h14"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.7-1.7 1.2-1.7 2.7m0 3h.01"/>',
  settings: '<path d="m9.2 4 .5-2h4.6l.5 2 1.6.9 2-.6 2.3 4-1.5 1.5v2.4l1.5 1.5-2.3 4-2-.6-1.6.9-.5 2H9.7l-.5-2-1.6-.9-2 .6-2.3-4 1.5-1.5V9.8L3.3 8.3l2.3-4 2 .6z"/><circle cx="12" cy="11" r="3"/>',
  sliders: '<path d="M3 7h4m5 0h9M3 17h10m5 0h3"/><circle cx="9.5" cy="7" r="2.5"/><circle cx="15.5" cy="17" r="2.5"/>',
  first: '<path d="M5 5v14m12-14-7 7 7 7"/>',
  prev: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  last: '<path d="M19 5v14M7 5l7 7-7 7"/>',
  enter: '<path d="M20 5v9H4m5-5-5 5 5 5"/>',
  clear: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  organize: '<path d="M3 7V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/><path d="M8 12h8m-8 4h5"/>',
  edit: '<path d="M13 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6m-1-10 3 3L11 16l-4 1 1-4z"/>',
  zoom: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6m-3-3v6"/>',
  selected: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>',
  send: '<path d="m21 3-6 18-4-8-8-4 18-6Zm0 0L11 13"/>',
  share: '<path d="M12 15V3m-4 4 4-4 4 4M6 10H4v10h16V10h-2"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
};
function stickerIcon(name) {
  return '<svg class="st-icon" aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + stickerIconPaths[name] + '</svg>';
}

/* Only authored UI copy is translated; sticker names and share-code data are never translated. */
function createFavoritesLocalizer(initialLocale = 'zh') {
  let locale = initialLocale === 'en' ? 'en' : 'zh';
  const labels = {
    "从聊天收藏": "Collect from chat",
    "打开「表情快选 → 从聊天收藏」，拖过消息选择表情。可选分组、追加搜索关键字，或直接确认收藏。按 Esc 可取消。": "Choose Quick stickers → Collect from chat and drag across messages. Pick a group or add search keywords if you like, then confirm. Press Esc to cancel.",
    "工具": "Tools",
    "生效的筛选条件": "Active filters",
    "收藏分组": "Sticker groups",
    "收藏表情": "Favorite stickers",
    "全部": "All",
    "未分组": "Ungrouped",
    "批量整理": "Organize selection",
    "整理所选表情": "Organize selected stickers",
    "关闭整理": "Close organizer",
    "移到分组": "Move to group",
    "新分组名称": "New group name",
    "统一显示名称": "Display name for selected stickers",
    "例如「奶龙」，留空保留原名称": "e.g. Laughing. Leave blank to keep existing names",
    "追加搜索关键字": "Add search keywords",
    "留空保留原备注": "Leave blank to keep existing notes",
    "保存整理": "Save changes",
    "分组与批量整理": "Groups and bulk editing",
    "管理页搜索当前分组。「全部」固定在最左侧，点击即可跨组搜索。聊天工具栏的「表情快选」会搜索全部收藏。": "Search in the manager covers the current group. All stays on the left and searches across groups. Quick stickers searches all favorites.",
    "多选后点「批量整理」，可改名、选分组或追加搜索关键字。重复的关键字会合并。留空可保留原值，覆盖已有名称前会显示数量。": "Use Organize selection to rename stickers, change their group or add search keywords. Duplicate keywords are merged. Leave fields blank to keep their values. The preview shows how many existing names will be replaced.",
    "单击选一张，Ctrl 或 ⌘ 加单击可增减选择，Shift 加单击可连续选择。从网格空白处拖动可框选，按住 Shift 拖动可追加。选中一张后可放大预览或编辑名称、搜索关键字和分组。在「工具」内可全选本页或筛选。": "Click to select one sticker. Ctrl-click or ⌘-click to add or remove one, or Shift-click for a range. Drag from a gap to select an area. Hold Shift while dragging to add to your selection. Select one sticker to preview it or edit its name, keywords and group. Open Tools to select a page or change filters.",
    "每个口令最多分享 100 张表情。勾选「附带名称和搜索关键字」即可一起分享。": "Each code can contain up to 100 stickers. Select Include names and search keywords to share those details.",
    "备份包含表情包名称、搜索关键字、分组、图片形式及复核状态。导入只更新本机设置。": "Backups include sticker names, search keywords, groups, image formats and review status. Imports update local settings only.",
    "已有备注和分组优先保留，可逐条选择使用备份内容。需复核项默认不勾选。": "Keep existing notes and groups by default, or choose the backup for individual entries. Items needing review start unchecked.",
    "确认导入所选设置": "Import selected settings",
    "Yixin.Zhong × Codex 制作": "Made by Yixin.Zhong × Codex",
    "查看 GitHub 项目": "View GitHub project",
    "窗口布局": "Window layout",
    "个人数据": "Personal data",
    "备份与恢复": "Backup and restore",
    "分栏让 SeaTalk 与助手并排显示；浮窗可自由拖动。重置布局恢复默认分栏、位置和大小，不会刷新收藏。": "Split view places SeaTalk and the helper side by side. Floating windows can be dragged freely. Reset layout restores the default split view, position and size without reloading favorites.",
    "重置布局": "Reset layout",
    "恢复默认分栏、窗口位置和大小": "Restore default split view, window position and size",
    "同步收藏": "Sync favorites",
    "收藏自动同步；无需刷新网页。": "Favorites sync automatically; no page reload needed.",
    "收藏同步": "Favorites sync",
    "助手打开时，每 1.5 秒读取 SeaTalk 当前账号的收藏状态，自动同步新增和移除；也可点击「同步收藏」。原生表情面板关闭后仍可同步。这只更新右侧列表，保留备注、筛选和仍在收藏中的勾选，不会刷新网页或重新请求服务器。发送、添加、删除、识别或弹窗打开期间暂停同步，结束后恢复。操作结果不确定时，仍需刷新网页核对服务器保存结果。": "While open, the helper reads the current account’s SeaTalk favorites state every 1.5 seconds to sync additions and removals, even if the native picker is closed. You can also choose Sync favorites. This updates the helper list without reloading or requesting server data, preserving notes, filters and selections still in favorites. Sync pauses during sending, adding, removal, inspection or an open dialog, then resumes. Uncertain operations still require a page reload to verify server persistence.",
    "整理、搜索和分享你的 SeaTalk 收藏表情。": "Organize, search and share your favorite SeaTalk stickers.",
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
    "「图片形式」按生效的动图、静态图或未知筛选；「备注状态」筛选已备注、未备注或需复核；「检测状态」单独查看未检测、已识别或识别失败。可先识别动图，也可在「编辑表情」中手动指定图片形式；手动标注优先，选择「自动识别」可恢复检测结果。未检测或识别失败不影响备注、搜索或分享。": "Image format filters the effective animated, still or unknown value. Note status filters notes or items needing review. Inspection status separately filters uninspected, inspected or failed images. Inspect animations or manually set a format in Edit sticker. Manual labels take priority; Automatic detection removes the override. Inspection is not required to edit, search or share notes.",
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
    "点击聊天输入框工具栏的「表情快选」。点击表情可直接发送，点「管理表情」可整理收藏。若收藏尚未载入，先在 SeaTalk 原生表情面板打开一次爱心收藏。": "Choose Quick stickers on the chat toolbar. Click a sticker to send it immediately, or choose Manage stickers to organize favorites. If your favorites have not loaded yet, open the Favorites heart once in the SeaTalk sticker picker.",
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
    "点击顶栏「−」保留页码、筛选和选择。下次通过「表情快选 → 管理表情」可以继续整理。宽屏时助手与聊天并排，拖动分隔线可调整宽度；在「设置 → 窗口布局」可切换为浮窗。": "Use − to keep your page, filters and selections. Return through Quick stickers → Manage stickers. On wide screens, drag the divider to adjust the workspace width. Use Settings → Window layout for a floating window.",
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
    "搜索名称或关键字": "Search names or keywords",
    "发送所选表情": "Send selected",
    "发送": "Send",
    "发送到当前会话": "Send to this conversation",
    "附带名称和搜索关键字": "Include names and search keywords",
    "同时导入名称和搜索关键字，默认保留已有名称": "Import names and search keywords. Keep existing names by default",
    "编辑表情": "Edit sticker",
    "关闭表情编辑": "Close sticker editor",
    "表情包名称": "Sticker name",
    "关键词": "Keywords",
    "搜索关键字": "Search keywords",
    "分组": "Group",
    "标记为已复核": "Mark as reviewed",
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
    "名称和搜索关键字保存在当前账号的油猴本地存储。个人备份还包含分组、图片形式和复核状态。到「设置」可以导出备份或预览导入。分享口令可按需附带名称和搜索关键字。发送前请核对目标会话。": "Names and search keywords are saved locally for this account. Personal backups also include groups, image formats and review status. Open Settings to export a backup or preview an import. Share codes can optionally include names and search keywords. Check the conversation before sending.",
    "每次最多分享 100 个。表情越多，口令越长。点击名称旁的编辑按钮可保存备注、关键词和表情文字，用于搜索，不会修改 SeaTalk 原收藏。": "Share up to 100 stickers per code. More stickers produce longer codes. Edit a sticker to save its name, keywords and visible text for searching. SeaTalk favorites are not renamed.",
    "请粘贴完整的 STGIF3 分享口令": "Paste a complete STGIF3 share code"
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
  const helperVersion = "5.3.0";
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

/* The caller binds the current account and chat to the confirmed batch or individual quick-picker click. */
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
  // Native buddyInfo stores relationship/settings; display names live in userInfo.
  const info = (session.type === 'group' ? state.contact?.groupInfo : state.contact?.userInfo)?.[session.id];
  const buddy = session.type === 'buddy' ? state.contact?.buddyInfo?.[session.id] : null;
  const name = info?.name || info?.raw?.n || info?.n || buddy?.alias || session.name;
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

/* Versioned, self-contained share codes. Only names and keywords are public metadata. */
function normalizeSharedStickers(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error('请选择 1–100 个表情');
  const metadata = Object.hasOwn(value[0] ?? {}, 'keywords');
  const fields = metadata ? ['gifId','label','keywords'] : ['gifId','label'];
  const seen = new Set(), stickers = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item) ||
        fields.some(key => !Object.hasOwn(item,key)) || Object.keys(item).length !== fields.length ||
        typeof item.gifId !== 'string' || !/^[a-zA-Z0-9]{64}$/.test(item.gifId) ||
        !['b0701','b0702','b0705'].includes(item.gifId.slice(33,38)) ||
        typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80 || /[\u0000-\u001f\u007f]/.test(item.label)) {
      throw Error('口令包含无效的表情或名称');
    }
    const row = {gifId:item.gifId, label:item.label.trim()};
    if (metadata) {
      if (!Array.isArray(item.keywords) || item.keywords.length > 30) throw Error('口令包含无效的表情或名称');
      const keywords = new Map();
      for (const word of item.keywords) {
        if (typeof word !== 'string' || !word.trim() || word.length > 60 || /[\u0000-\u001f\u007f]/.test(word)) {
          throw Error('口令包含无效的表情或名称');
        }
        const text = word.trim(), key = text.normalize('NFKC').toLocaleLowerCase();
        if (!keywords.has(key)) keywords.set(key,text);
      }
      row.keywords = [...keywords.values()];
    }
    if (!seen.has(row.gifId)) { stickers.push(row); seen.add(row.gifId); }
  }
  return stickers;
}
function encodeStickerShare(stickers) {
  const bytes = new TextEncoder().encode(JSON.stringify({v:3, stickers:normalizeSharedStickers(stickers)}));
  return 'STGIF3.' + btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function decodeStickerShare(text) {
  if (typeof text !== 'string' || text.length > 2097152) throw Error('口令过长或无效，最多支持 100 个表情');
  const code = text.trim(), match = /^STGIF3\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!match) throw Error('请粘贴完整的 STGIF3 分享口令');
  try {
    const raw = match[1].replace(/-/g,'+').replace(/_/g,'/');
    const bytes = Uint8Array.from(atob(raw),c=>c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (!data || data.v !== 3 || Object.keys(data).some(key=>!['v','stickers'].includes(key))) throw Error();
    const stickers = normalizeSharedStickers(data.stickers);
    if (!Object.hasOwn(stickers[0],'keywords') && code.length > 65536) throw Error();
    return stickers;
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

function getFavoritesAccountModuleUrl() {
  const html = document.documentElement;
  const currentBuild = html.getAttribute('data-web-semantic-version') === '3.72.0' &&
    html.getAttribute('data-release-hash') === 'cba35692d';
  const cdn = 'https://static.cdn.haiserve.com/seatalk/fe/static/js/';
  const family = currentBuild ? /^chunk-db-pure-[\w-]+\.js$/ : /^chunk-src-[\w-]+\.js$/;
  const urls = new Set();
  for (const tag of document.head.querySelectorAll('link[rel~="modulepreload"][href],script[type="module"][src]')) {
    const href = tag.href || tag.src;
    if (href.startsWith(cdn) && family.test(href.slice(cdn.length)) && href !== cdn + 'chunk-src-DcOtnrHP.js') urls.add(href);
  }
  if (urls.size !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  return [...urls][0];
}

  const existing = document.getElementById('st-favorites-curator');
  if (existing) { existing.__setLocale?.(initialLocale); if (entry === 'quick') existing.__openQuick?.(); else existing.__open?.(); return { reopened: true }; }
  const pickerSelector = '.sealabs-stickers-panel .sealabs-sticker, .sealabs-stickers-panel .sticker-wrapper';
  function readSource(element, requireActions = true) {
    let fiber = element?.[Object.keys(element).find(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'))];
    // DOM pointers can retain the previous React branch after a commit.
    const isCurrent = node => {
      let top = node;
      while (top?.return) top = top.return;
      return top?.stateNode?.current === top;
    };
    if (fiber?.alternate && !isCurrent(fiber) && isCurrent(fiber.alternate)) fiber = fiber.alternate;
    let list, actions;
    for (let count = 0; fiber && count < 24; count++, fiber = fiber.return) {
      const props = fiber.memoizedProps;
      if (props?.isCustomTab === true && Array.isArray(props.stickers)) list = props.stickers;
      if (props?.actions?.actionRemoveCustomStickers) actions = props.actions;
    }
    if (!list || requireActions && !actions) throw Error(tr('请先打开 SeaTalk 爱心收藏面板，再重新操作。'));
    return { list, actions };
  }
  const liveSource = (requireActions = true) => {
    const first = document.querySelector(pickerSelector);
    if (first) return readSource(first, requireActions);
    // An empty favorites tab has no sticker node. Look for its mounted container.
    const panel = document.querySelector('.sealabs-stickers-panel');
    for (const node of panel ? [panel, ...Array.from(panel.querySelectorAll('*')).slice(0, 80)] : []) {
      try { return readSource(node, requireActions); } catch (_) { /* Try the next mounted container. */ }
    }
    throw Error(tr('请先打开 SeaTalk 爱心收藏面板，再重新操作。'));
  };
  let mountedAtOpen = null;
  try { mountedAtOpen = liveSource(false).list; } catch (_) { /* The picker may be closed. */ }
  const source = mountedAtOpen || [];
  let favoritesRead = Boolean(mountedAtOpen);
  let captureActive = false;
  function isFavoritePreviewUrl(url, id) {
    const path = '/download/' + id;
    // Native signed URLs may use a suffix; fileUrl(id) may return the exact ID path.
    return url.protocol === 'https:' && url.hostname === 'f.haiserve.com' &&
      (url.pathname === path || url.pathname.startsWith(path + '_'));
  }
  const known = new Map(presets.map(item => [item.gifId, item.label]));
  const items = [], seen = new Set();
  for (const item of source) {
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9]{32,}$/.test(item.id) || seen.has(item.id)) continue;
    let url;
    try { url = new URL(item.url); } catch (_) { continue; }
    if (!isFavoritePreviewUrl(url, item.id)) continue;
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
  let activeGroup = '', selectionAnchor = null, rubberBand = null, organizationDraft = null;
  const size = 48, activeRequests = new Set();
  const host = document.createElement('section'); host.id = 'st-favorites-curator';
  host.dataset.open = host.dataset.managed = String(entry !== 'quick');
  if (entry === 'quick') host.style.display = 'none';
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
    body:has(#st-favorites-curator[data-managed="true"]) #seatalk-personal-gif-avatar-toggle {visibility:hidden!important}`;
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
    @container(max-width:650px){#dragHandle{padding:8px 10px;gap:6px}#dragHandle h1{font-size:14px}.grip{display:none}.window-controls{gap:3px}.window-controls button{font-size:12px;padding:5px 6px}.toolbar{flex-wrap:wrap}.toolbar input[type=search]{flex-basis:100%}.toolbar select{flex:1;max-width:none}.toolbar button{font-size:12px}.grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}.preview{height:105px}.pagination{flex-wrap:wrap;gap:4px;padding:7px}.pagination button{padding:5px 6px}.selection-bar{flex-wrap:wrap;padding:8px 10px 16px}.selection-message{min-width:100%;display:flex;align-items:center;gap:8px}.selection-bar>.spacer{display:none}}
    @media(max-width:1000px){:host{left:50%;right:auto;transform:translate(-50%,-50%)}}@media(max-width:650px){:host{width:calc(100vw - 24px);max-width:calc(100vw - 24px);height:calc(100dvh - 40px)}#dragHandle{padding:8px 10px;gap:8px}#dragHandle h1{font-size:14px}.grip{display:none}.window-controls{gap:4px}.window-controls button{font-size:12px;padding:5px 6px}.workspace-tabs{margin:8px 10px 0}header{padding:10px}.toolbar{flex-wrap:wrap}.toolbar input[type=search]{flex-basis:100%;}.toolbar select{flex:1;max-width:none}.toolbar button{font-size:12px}.grid{grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:8px}main{padding:10px}.preview{height:105px}.pagination{flex-wrap:wrap;gap:4px;padding:7px}.pagination button{padding:5px 6px}.selection-bar{flex-wrap:wrap;padding:8px 10px 16px}.selection-message{min-width:100%;display:flex;align-items:center;gap:8px}.selection-bar>.spacer{display:none}dialog .dialog-body{padding:12px}.card-title{gap:2px}}@media(max-height:560px){:host{height:calc(100dvh - 24px);max-height:calc(100dvh - 24px)}#summary{margin-bottom:6px}.workspace-tabs{margin-top:6px}.status-row{margin-top:4px}#dragHandle{min-height:44px;padding-top:6px;padding-bottom:6px}.selection-bar{padding-top:6px;padding-bottom:10px}.pagination{padding-top:5px;padding-bottom:5px}}
    .workspace-language{display:flex;gap:2px;padding:3px;border:1px solid #d0d5dd;border-radius:10px;background:#edf2f7}.workspace-language button{border:0;background:transparent;color:#59677b;font-size:12px;padding:5px 8px;min-height:28px}.workspace-language [aria-pressed=true]{background:#fff;color:#0866c6;font-weight:600;box-shadow:0 1px 4px #152b4620}@container(max-width:450px){#dragHandle{flex-wrap:wrap}#dragHandle h1{flex-basis:calc(100% - 30px)}.window-controls{width:100%;justify-content:flex-end;flex-wrap:wrap}}
    .filter-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}.filter-toolbar label{display:flex;flex:1;min-width:115px;flex-direction:column;gap:4px;font-size:12px;color:#667085}.filter-toolbar select{width:100%;min-width:0;font-size:13px}.metadata-form label{display:flex;flex-direction:column;gap:6px;margin:0 0 14px;font-size:13px}.metadata-form textarea{height:75px;font:inherit}.metadata-choice{display:flex;align-items:center;gap:8px;margin:10px 0;font-size:12px}.file-label{font-size:12px}.file-label input{display:block;max-width:100%;margin-top:6px}.metadata-import-list{max-height:38dvh;overflow:auto;margin-top:12px}.metadata-import-row{padding:10px 0;border-top:1px solid #e4e7ec}.metadata-import-row label{display:flex;align-items:center;gap:8px}.metadata-import-row p{font-size:12px;overflow-wrap:anywhere}.metadata-import-row select{max-width:100%}.import-card select{width:100%;font-size:11px;padding:5px}.selection-bar{flex-wrap:wrap}.selection-message{min-width:100%;display:flex;align-items:center;gap:10px}.selection-bar>.spacer{display:none}
    .settings-section{padding:0 0 18px;margin:0 0 18px;border-bottom:1px solid #e4e7ec}.settings-section:last-child{border-bottom:0;margin-bottom:0;padding-bottom:0}.settings-section h3{margin:0 0 10px;font-size:14px;color:#172033}.settings-section .workspace-language{width:fit-content}.settings-section .inline-actions{flex-wrap:wrap}
    .workspace-tabs[hidden]{display:none}
    .helper-credit-row{display:flex;align-items:center;gap:8px;padding:4px 16px 8px;background:#fff;border-top:1px solid #edf2f7;font-size:11px;color:#7b8ba8;flex-wrap:wrap}.helper-version{border:1px solid #dce4f0;border-radius:999px;background:#f8fafc;padding:2px 6px;font-size:10px;white-space:nowrap}.helper-github{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin-left:auto;color:#667085;border-radius:6px}.helper-github:hover,.helper-github:focus-visible{color:#0866c6;background:#edf2f7}.helper-github:focus-visible{outline:2px solid #0866c6;outline-offset:2px}
    .helper-credit{font:inherit;color:inherit;min-height:24px;padding:0;border:0;background:transparent}.helper-credit:hover{color:#0866c6;background:transparent}.helper-credit.spga-credit-celebrating{animation:helper-credit-bounce .72s ease both}@keyframes helper-credit-bounce{40%{transform:translateY(-4px)}70%{transform:translateY(1px)}}@media(prefers-reduced-motion:reduce){.helper-credit.spga-credit-celebrating{animation:none}}
    #groupTabs{display:flex;gap:5px;align-items:center;margin-top:7px}
    #groupStrip{display:flex;gap:6px;min-width:0;overflow-x:auto;padding:4px;overscroll-behavior-x:contain}
    #groupTabs button{border:1px solid #e1e7ee;border-radius:18px;background:#fff;color:#46556b;min-height:30px;padding:4px 10px;flex:none}
    #groupStrip button{max-width:100%;overflow:hidden;text-overflow:ellipsis}
    #groupTabs #allGroups{display:inline-flex;align-items:center;gap:5px;background:#edf7f5;border-color:#acd6cf;color:#176258;font-weight:600}
    #allGroups .st-icon{width:15px;height:15px}
    #groupTabs #allGroups[aria-pressed=true]{background:#14695e;border-color:#14695e;color:white}
    #groupTabs [aria-pressed=true],#toolsToggle[aria-expanded=true]{background:#eaf3ff;color:#0757a6;border-color:#a9c9ee}
    #activeFilters{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
    #activeFilters button{display:inline-flex;align-items:center;gap:5px;min-height:26px;padding:2px 7px;background:#eef5ff;border-color:#c7dcf3;color:#18558d;font-size:12px}
    #activeFilters .st-icon{width:13px;height:13px}
    #toolsToggle:has(#toolsCount:not([hidden])){width:auto;padding:0 6px;gap:4px;color:#0757a6;background:#eaf3ff;border-color:#a9c9ee}
    #toolsCount{border-radius:9px;min-width:17px;padding:1px 4px;background:#0866c6;color:#fff;font:600 11px/15px system-ui}
    #toolsPanel{margin-top:8px;max-height:28dvh;overflow:auto;padding:0 2px}
    #toolsPanel #summary{margin:4px 0 0}
    .grid{grid-template-columns:repeat(auto-fill,minmax(min(112px,100%),1fr));gap:8px}
    main{position:relative;overscroll-behavior:contain}
    .card{padding:6px;cursor:pointer;user-select:none}
    .card.chosen,.card[aria-pressed=true]{background:#ecf4ff;border-color:#0866c6}
    .card .preview{height:86px;background:#f5f7fa;border-radius:7px;pointer-events:none}
    .card .card-name{display:block;text-align:center;margin:5px 0 0;font-weight:500}
    #rubberBand{position:absolute;pointer-events:none;z-index:1;background:#4088db24;border:1px solid #4088db}
    .selection-message #clear{margin-left:auto}
    #organizeError{color:#b42318}
    #personalFormatOptions{margin-bottom:12px}#personalFormatOptions summary{cursor:pointer;min-height:32px;color:#475467}
    #personalFormatOptions select{max-width:100%}.metadata-form #personalReviewField{flex-direction:row;align-items:center}
    #organizeImpact{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px 16px;margin:8px 0;font-size:13px;line-height:1.5}
    #organizeImpact:empty{display:none}
    .impact-metric{display:inline-grid;align-items:baseline;grid-template-columns:1fr auto;gap:3px 6px;font-variant-numeric:tabular-nums}
    .impact-metric:has(.impact-track){min-width:7em}
    .impact-metric strong{color:#344054;font-weight:650}
    .impact-track{display:block;grid-column:1/-1;height:3px;border-radius:2px;overflow:hidden;background:#dce4ee}
    .impact-track>span{display:block;height:100%;background:#2872b8}
    .impact-warning{width:100%;padding:6px 10px;color:#843d0a;background:#fff5e7;border-inline-start:3px solid #c67725;border-radius:4px}

    .st-icon{display:block;flex:none;pointer-events:none}
    button[data-icon]{display:inline-flex;align-items:center;justify-content:center;gap:6px}
    button[data-icon-only]{position:relative;flex:none;width:34px;min-height:34px;padding:0}
    [data-icon-only] .control-label{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
    .search-field{display:flex;align-items:center;flex:1;min-width:0;position:relative}
    .search-field>.st-icon{position:absolute;left:11px;color:#667085}
    .toolbar .search-field input{width:100%;min-width:0;padding-left:36px}
    #dragHandle{flex-wrap:nowrap}#dragHandle h1{flex:1}.window-controls{width:auto;flex-wrap:nowrap}
    #viewSelected[aria-pressed=true]{color:#0757a6;border-color:#a9c9ee;background:#eaf3ff}
    .selection-bar{gap:6px;padding:8px 12px}.selection-message{min-width:0;flex:1 1 auto;flex-wrap:wrap;gap:6px}
    #selectionHint:empty{display:none}
    .selection-message #clear{margin-left:0}.selection-bar [data-icon]{min-height:34px}
    @container(max-width:650px){.selection-message{flex-basis:100%}.selection-message #clear{margin-left:auto}}
    @container(max-width:450px){.grid{grid-template-columns:repeat(auto-fill,minmax(min(90px,100%),1fr))}.card .preview{height:68px}}
  </style>
  <button id="dockDivider" role="separator" aria-orientation="vertical" aria-label="调整侧栏宽度" hidden></button><section class="app">
    <div id="dragHandle" title="拖动此栏移动窗口"><span class="grip" aria-hidden="true">⠿</span><h1>SeaTalk 表情助手</h1><div class="window-controls"><button id="guideOpen" data-icon="help" data-icon-only>使用指南</button><button id="settingsOpen" data-icon="settings" data-icon-only>设置</button><button id="minimize" data-icon="minimize" data-icon-only class="icon-button" aria-label="收起我的表情" title="收起，保留当前选择">−</button><button id="close" data-icon="x" data-icon-only class="danger-fill" aria-label="关闭批量管理">关闭批量管理</button></div></div>
    <nav class="workspace-tabs" hidden aria-label="助手功能" role="tablist"><button id="backAvatar" role="tab" aria-selected="false">GIF 头像</button><button role="tab" aria-selected="true" aria-current="page">我的表情</button></nav>
    <header>
      <div class="toolbar"><label class="search-field">${stickerIcon('search')}<input id="search" type="search" placeholder="搜索名称或关键字" aria-label="搜索收藏"></label><button id="toolsToggle" data-icon="sliders" data-icon-only aria-expanded="false" aria-controls="toolsPanel">工具<span id="toolsCount" aria-hidden="true" hidden></span></button></div>
      <div id="groupTabs" role="group" aria-label="收藏分组"><button id="allGroups" type="button">${stickerIcon('groups')}<span></span></button><div id="groupStrip"></div></div>
      <div id="activeFilters" role="group" aria-label="生效的筛选条件" hidden></div>
      <div id="toolsPanel" hidden>
        <div class="inline-actions"><select id="filter" aria-label="显示范围"><option value="all">全部收藏</option><option value="selected">已选择</option></select><button id="syncFavorites">同步收藏</button><button id="scan">识别动图</button><button id="importOpen">导入口令</button><button id="selectPage">全选本页</button></div>
        <div class="filter-toolbar"><label>图片形式<select id="animation" aria-label="图片形式"><option value="all">全部形式</option><option value="animated">动图</option><option value="static">静态图</option><option value="unknown">未知</option></select></label><label>备注状态<select id="metadataFilter" aria-label="备注状态"><option value="all">全部备注</option><option value="annotated">已备注</option><option value="unannotated">未备注</option><option value="review">需复核</option></select></label><label>检测状态<select id="detectionFilter" aria-label="检测状态"><option value="all">全部检测状态</option><option value="unknown">未检测</option><option value="recognized">已识别</option><option value="failed">识别失败</option></select></label></div><div class="status-row"><span id="syncStatus" role="status">收藏自动同步；无需刷新网页。</span></div><div class="status-row"><span id="scanStatus" role="status">浏览和分享无需先识别动图。</span><button id="scanStop" hidden>停止识别</button></div><p id="summary"></p><p id="selectionDetails" hidden></p>
      </div><details id="hiddenTools" hidden><summary>开发工具</summary><button id="export">导出已选 JSON</button></details>
    </header>
    <main><div class="grid" role="group" aria-label="收藏表情"></div><div id="rubberBand" hidden></div><div id="emptyState" class="empty" hidden><h2 id="emptyTitle"></h2><p id="emptyMessage"></p><button id="emptyScan" hidden>识别动图</button><button id="emptyReset">查看全部收藏</button></div></main>
    <footer><div class="pagination"><button id="first" data-icon="first" data-icon-only>首页</button><button id="prev" data-icon="prev" data-icon-only>上一页</button><span id="page"></span><button id="next" data-icon="next" data-icon-only>下一页</button><button id="last" data-icon="last" data-icon-only>末页</button><input id="jump" type="number" min="1" step="1" value="1" aria-label="跳转页码" title="跳转页码"><button id="jumpGo" data-icon="enter" data-icon-only>跳转</button></div><div class="selection-bar" hidden><div class="selection-message"><span id="count" role="status">已选择 0 个</span><span id="selectionHint"></span><button id="clear" data-icon="clear" data-icon-only>清空选择</button></div><button id="organizeSelected" data-icon="organize">批量整理</button><button id="editSelected" data-icon="edit" data-icon-only>编辑表情</button><button id="previewSelected" data-icon="zoom" data-icon-only>放大预览</button><button id="sendSelected" data-icon="send" class="primary" aria-label="发送所选表情">发送</button><button id="viewSelected" data-icon="selected" data-icon-only>查看已选</button><button id="shareOpen" data-icon="share" data-icon-only>生成分享口令</button><button id="remove" data-icon="trash" data-icon-only class="danger">删除所选表情</button></div><div class="helper-credit-row"><button id="helperCredit" class="helper-credit">Yixin.Zhong × Codex 制作</button><span class="helper-version" title="SeaTalk Sticker Helper">v${helperVersion}</span><a class="helper-github" href="https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper" target="_blank" rel="noopener noreferrer" title="查看 GitHub 项目" aria-label="查看 GitHub 项目"><svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg></a></div></footer><button id="resizeHandle" aria-label="调整窗口大小" title="拖动调整大小，也可用方向键调整"></button>
  </section>
  <dialog id="organizeDialog" aria-labelledby="organizeTitle"><div class="dialog-header"><h2 id="organizeTitle">整理所选表情</h2><button data-close="organizeDialog" aria-label="关闭整理">×</button></div><div class="dialog-body metadata-form">
    <label>统一显示名称<input id="batchName" type="text" maxlength="80" placeholder="例如「奶龙」，留空保留原名称"></label>
    <label>移到分组<select id="organizeGroup"></select></label><label id="newGroupLabel" hidden>新分组名称<input id="newGroupName" maxlength="60"></label>
    <label>追加搜索关键字<input id="batchKeywords" maxlength="2000" placeholder="用逗号分隔，例如：工作，上班，打工人"></label><p id="organizeImpact" aria-live="polite" aria-atomic="true"></p><p id="organizeError" role="alert"></p></div>
    <div class="dialog-actions"><button data-close="organizeDialog">取消</button><button id="organizeApply" class="primary" disabled>保存整理</button></div></dialog>
  <dialog id="guideDialog" aria-labelledby="guideTitle"><div class="dialog-header"><h2 id="guideTitle">我的表情使用指南</h2><button data-close="guideDialog" aria-label="关闭使用指南">×</button></div><div class="dialog-body guide"><p>整理、搜索和分享你的 SeaTalk 收藏表情。</p>
    <section><h3>开始前</h3><p>点击聊天输入框工具栏的「表情快选」。点击表情可直接发送，点「管理表情」可整理收藏。若收藏尚未载入，先在 SeaTalk 原生表情面板打开一次爱心收藏。</p></section>
    <section><h3>从聊天收藏</h3><p>打开「表情快选 → 从聊天收藏」，拖过消息选择表情。可选分组、追加搜索关键字，或直接确认收藏。按 Esc 可取消。</p></section>
    <section><h3>收藏同步</h3><p>助手打开时，每 1.5 秒读取 SeaTalk 当前账号的收藏状态，自动同步新增和移除；也可点击「同步收藏」。原生表情面板关闭后仍可同步。这只更新右侧列表，保留备注、筛选和仍在收藏中的勾选，不会刷新网页或重新请求服务器。发送、添加、删除、识别或弹窗打开期间暂停同步，结束后恢复。操作结果不确定时，仍需刷新网页核对服务器保存结果。</p></section>
    <section><h3>分组与批量整理</h3><p>管理页搜索当前分组。「全部」固定在最左侧，点击即可跨组搜索。聊天工具栏的「表情快选」会搜索全部收藏。</p><p>多选后点「批量整理」，可改名、选分组或追加搜索关键字。重复的关键字会合并。留空可保留原值，覆盖已有名称前会显示数量。</p></section>
    <section><h3>选择和查看表情</h3><p>单击选一张，Ctrl 或 ⌘ 加单击可增减选择，Shift 加单击可连续选择。从网格空白处拖动可框选，按住 Shift 拖动可追加。选中一张后可放大预览或编辑名称、搜索关键字和分组。在「工具」内可全选本页或筛选。</p><p>「图片形式」按生效的动图、静态图或未知筛选；「备注状态」筛选已备注、未备注或需复核；「检测状态」单独查看未检测、已识别或识别失败。可先识别动图，也可在「编辑表情」中手动指定图片形式；手动标注优先，选择「自动识别」可恢复检测结果。未检测或识别失败不影响备注、搜索或分享。</p></section>
    <section><h3>分享给朋友</h3><p>选择表情 → 点击「生成分享口令」→ 复制完整口令发给朋友。</p><p>每个口令最多分享 100 张表情。勾选「附带名称和搜索关键字」即可一起分享。</p></section>
    <section><h3>添加朋友分享的表情</h3><p>点击「导入口令」→ 粘贴完整口令 → 点击「解析并预览」→ 选择表情 → 确认添加。</p><p>已收藏的表情不会重复添加，但可以导入备注。已有备注默认保留，并合并去重关键词；也可逐条选择使用朋友的备注。预览失败的新表情暂时不能添加。</p></section>
    <section><h3>删除不需要的收藏</h3><p>选择表情 → 点击「删除所选表情」→ 核对图片和数量 → 确认删除。</p><p>删除只影响你的收藏，不会删除聊天消息。本助手无法撤销删除，分享口令也不保证能恢复。筛选之外的已选表情也会包括在确认清单中。</p></section>
    <section><h3>收起、关闭和结果核对</h3><p>点击顶栏「−」保留页码、筛选和选择。下次通过「表情快选 → 管理表情」可以继续整理。宽屏时助手与聊天并排，拖动分隔线可调整宽度；在「设置 → 窗口布局」可切换为浮窗。</p><p>操作结果不确定时，先刷新 SeaTalk 核对收藏，再决定是否重试。刷新会清空本次勾选。添加或删除进行中时，停止会等待当前表情的结果，再停止后续操作。</p></section>
<section><h3>备注、备份与发送</h3><p>名称和搜索关键字保存在当前账号的油猴本地存储。个人备份还包含分组、图片形式和复核状态。到「设置」可以导出备份或预览导入。分享口令可按需附带名称和搜索关键字。发送前请核对目标会话。</p></section></div><div class="dialog-actions"><span></span><button id="guideClose" class="primary">知道了，返回管理</button></div></dialog>
  <dialog id="zoom" aria-labelledby="zoomTitle"><div class="dialog-header"><h2 id="zoomTitle">表情预览</h2><button data-close="zoom" aria-label="关闭预览">×</button></div><div class="dialog-body"><img class="zoom-image" alt="放大预览"><p></p></div><div class="dialog-actions"><span></span><button id="zoomClose">返回管理</button><button id="sendZoom" class="primary">发送到当前会话</button></div></dialog>
  <dialog id="sharing" aria-labelledby="shareTitle"><div class="dialog-header"><h2 id="shareTitle">分享所选表情</h2><button data-close="sharing" aria-label="关闭分享">×</button></div><div class="dialog-body"><p>复制完整口令发给朋友，对方可在「导入口令」中预览并添加。</p><label class="metadata-choice"><input id="shareIncludeMetadata" type="checkbox" checked> 附带名称和搜索关键字</label><textarea id="shareCode" readonly aria-label="分享口令"></textarea><p id="shareStatus" role="status"></p></div><div class="dialog-actions"><button id="shareClose">返回管理</button><button id="shareCopy" class="primary">复制分享口令</button></div></dialog>
  <dialog id="importing" aria-labelledby="importTitle"><div class="dialog-header"><h2 id="importTitle">导入口令</h2><button data-close="importing" aria-label="关闭导入">×</button></div><div class="dialog-body"><p>粘贴好友的完整口令，先预览并选择，再确认添加。</p><textarea id="importCode" aria-label="粘贴分享口令" maxlength="2097152" placeholder="STGIF3.…"></textarea><div class="inline-actions"><button id="importParse">解析并预览</button><button id="importSelect">全选可添加</button></div><label class="metadata-choice"><input id="shareImportMetadata" type="checkbox" checked> 同时导入名称和搜索关键字，默认保留已有名称</label><div id="importPreview" class="import-grid"></div><p id="importStatus" role="status"></p></div><div class="dialog-actions"><button id="importCancel">取消</button><div class="right-actions"><button id="importStop" hidden>停止后续添加</button><button id="importConfirm" class="primary" disabled>确认添加所选表情</button></div></div></dialog>
  <dialog id="deletion" aria-labelledby="deleteTitle"><div class="dialog-header"><h2 id="deleteTitle">从我的表情中移除</h2><button data-close="deletion" aria-label="关闭删除确认">×</button></div><div class="dialog-body"><p id="deleteSummary"></p><p>删除后无法在本助手撤销。口令不保证能恢复，请核对以下表情。</p><div id="deletePreview" class="thumb-list"></div><p id="deleteProgress" role="status"></p></div><div class="dialog-actions"><button id="deleteCancel">取消</button><div class="right-actions"><button id="deleteStop" hidden>停止后续删除</button><button id="deleteConfirm" class="danger-fill">确认删除</button></div></div></dialog>
  <dialog id="output" aria-labelledby="exportTitle"><div class="dialog-header"><h2 id="exportTitle">开发者导出</h2><button data-close="output" aria-label="关闭导出">×</button></div><div class="dialog-body"><textarea readonly aria-label="导出 JSON"></textarea><p id="message"></p></div><div class="dialog-actions"><button id="outputClose">返回管理</button><div class="right-actions"><button id="download">下载 JSON</button><button id="copy" class="primary">复制 JSON</button></div></div></dialog>

<dialog id="personalEditor" aria-labelledby="personalEditorTitle">
  <div class="dialog-header"><h2 id="personalEditorTitle">编辑表情</h2><button data-close="personalEditor" aria-label="关闭表情编辑">×</button></div>
  <div class="dialog-body metadata-form">
    <label>表情包名称<input id="personalName" maxlength="80"></label>
    <label>搜索关键字<input id="personalKeywords" maxlength="2000" placeholder="用逗号分隔，例如：工作，上班，打工人"></label>
    <label>分组<select id="personalGroup"></select></label>
    <label id="personalNewGroupField" hidden><span id="personalNewGroupLabel">新分组名称</span><input id="personalNewGroupName" maxlength="60"></label>
    <details id="personalFormatOptions"><summary>图片形式</summary>
      <select id="personalAnimation" aria-label="图片形式"><option value="auto">自动识别</option><option value="animated">动图（手动）</option><option value="static">静态图（手动）</option><option value="unknown">未知（手动）</option></select>
      <p id="personalDetectionStatus"></p>
    </details>
    <label id="personalReviewField" class="metadata-choice" hidden><input type="checkbox" id="personalReviewAccept"><span>标记为已复核</span></label>
    <p id="personalEditorStatus" role="status"></p>
  </div>
  <div class="dialog-actions"><button data-close="personalEditor">取消</button><button id="personalSave" class="primary">保存到本机</button></div>
</dialog>
<dialog id="personalSettings" aria-labelledby="personalSettingsTitle"><div class="dialog-header"><h2 id="personalSettingsTitle">设置</h2><button data-close="personalSettings" aria-label="关闭个人设置">×</button></div><div class="dialog-body"><section class="settings-section"><h3>语言</h3><div class="workspace-language" role="group" aria-label="语言"><button data-workspace-locale="zh" aria-pressed="false">中文</button><button data-workspace-locale="en" aria-pressed="false">EN</button></div></section><section class="settings-section"><h3>窗口布局</h3><div class="inline-actions"><button id="dockToggle" aria-label="切换分栏与浮窗" disabled>分栏</button><button id="resetPosition" aria-label="重置布局" title="恢复默认分栏、窗口位置和大小">重置布局</button></div><p>分栏让 SeaTalk 与助手并排显示；浮窗可自由拖动。重置布局恢复默认分栏、位置和大小，不会刷新收藏。</p></section><section class="settings-section"><h3>个人数据</h3><p>备份与恢复</p><p>备份包含表情包名称、搜索关键字、分组、图片形式及复核状态。导入只更新本机设置。</p><div class="inline-actions"><button id="personalExport">导出个人备份</button><label class="file-label">选择备份或标签文件<input id="personalImportFile" type="file" accept=".json,application/json"></label></div><p id="personalSettingsStatus" role="status"></p><section id="personalImportPanel" hidden><p>已有备注和分组优先保留，可逐条选择使用备份内容。需复核项默认不勾选。</p><label><input id="personalMergeKeywords" type="checkbox" checked> 合并并去重关键词</label><div class="inline-actions"><button id="personalSelectAll">全选（含需复核项）</button><button id="personalSelectSafe">选择无需复核项</button><button id="personalClearImport">清空勾选</button></div><div id="personalImportRows" class="metadata-import-list"></div></section></section></div><div class="dialog-actions"><button data-close="personalSettings">返回管理</button><button id="personalImportConfirm" class="primary" disabled>确认导入所选设置</button></div></dialog>
<dialog id="sendConfirmation" aria-labelledby="sendTitle"><div class="dialog-header"><h2 id="sendTitle">确认发送表情</h2><button id="sendClose" aria-label="关闭发送确认">×</button></div><div class="dialog-body"><p id="sendTarget" class="notice"></p><p id="sendSummary"></p><div id="sendPreview" class="thumb-list"></div><p id="sendStatus" role="status"></p><p>只发送本次确认的表情；切换账号或会话后停止。结果未确认时不会自动重发。</p></div><div class="dialog-actions"><button id="sendCancel">取消</button><div class="right-actions"><button id="sendStop" hidden>停止后续发送</button><button id="sendConfirm" class="primary">确认发送</button></div></div></dialog>
`;
  for (const button of root.querySelectorAll('button[data-icon]')) {
    const label = document.createElement('span');
    label.className = 'control-label';
    label.textContent = button.textContent;
    const action = button.getAttribute('aria-label') || label.textContent;
    button.setAttribute('aria-label', action);
    if (!button.title) button.title = action;
    button.firstChild.replaceWith(label);
    button.insertAdjacentHTML('afterbegin', stickerIcon(button.dataset.icon));
  }
  const applyStaticLocale = language.bindStatic(root);
  applyStaticLocale();
  root.querySelector('.app').lang = language.locale;
  const $ = selector => root.querySelector(selector);
  let actionNotice = null, noticeTimer = null;
  function dismissActionNotice() {
    clearTimeout(noticeTimer);
    if (actionNotice?.matches(':popover-open')) actionNotice.hidePopover();
    actionNotice?.remove(); actionNotice = null;
  }
  function notifyAction(message, tone = 'success') {
    dismissActionNotice();
    const notice = document.createElement('div');
    notice.setAttribute('popover', 'manual');
    notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    notice.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
    notice.style.cssText = 'position:fixed;inset:20px 20px auto auto;margin:0;max-width:min(460px,calc(100vw - 40px));padding:14px 16px;border-radius:10px;border:1px solid;box-shadow:0 8px 30px #17203330;z-index:2147483647;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;gap:12px;align-items:flex-start;overflow-wrap:anywhere';
    const colors = tone === 'error' ? ['#fff2f0','#b42318','#f2b8b1'] : tone === 'info' ? ['#eff6ff','#175398','#b9d8f4'] : ['#edf9f1','#21633c','#b7dfc5'];
    [notice.style.background,notice.style.color,notice.style.borderColor] = colors;
    const text = document.createElement('span'); text.textContent = message;
    const close = document.createElement('button'); close.textContent = '×'; close.setAttribute('aria-label', ui('关闭提示','Dismiss notification'));
    close.style.cssText = 'min-height:24px;padding:0 5px;border:0;background:transparent;color:inherit;font-size:20px'; close.onclick = dismissActionNotice;
    notice.append(text,close);
    (host.dataset.open === 'true' ? root.querySelector('dialog[open]') || $('.app') : document.body).append(notice); actionNotice = notice;
    try { notice.showPopover(); } catch (_) { /* Keep the visible inline fallback. */ }
    noticeTimer = setTimeout(dismissActionNotice, tone === 'success' ? 5000 : 9000);
  }
  const activeItems = () => items.filter(item => !item.deleted);
  const selection = () => items.filter(item => item.selected && !item.deleted);
  const matches = item => {
    if (item.deleted || (activeGroup !== null && personalGroupFor(item.gifId) !== activeGroup)) return false;
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
  const busy = () => captureActive || deleting || importingBusy || sendingBusy || sendPreparing || metadataSaving;
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
    for (const card of root.querySelectorAll('.grid .card')) card.disabled = locked;
    $('.selection-bar').hidden = !selected.length && !selectedView;
    $('#editSelected').hidden = $('#previewSelected').hidden = selected.length !== 1;
    $('#editSelected').disabled = locked || !personalReady;
    $('#previewSelected').disabled = locked;
    $('#organizeSelected').disabled = locked || !personalReady || !selected.length;
    $('#toolsToggle').disabled = locked;
    for (const chip of $('#activeFilters').children) chip.disabled = locked;
    showSelectionDetails(selected);
    for (const tab of $('#groupTabs').querySelectorAll('button')) tab.disabled = locked;
    $('#count').textContent = ui(`已选择 ${selected.length} 个`, `${selected.length} selected`);
    $('#selectionHint').textContent = outside ? ui(`其中 ${outside} 个不在当前筛选中`, `${outside} outside the current filter`) : selected.length > 100 ? tr('每次最多分享 100 个，请分批选择。') : '';
    $('#shareOpen').disabled = locked || !selected.length || selected.length > 100 || selected.some(item => !item.label.trim());
    $('#shareOpen').title = selected.length > 100 ? tr('每次最多分享 100 个') : !selected.length ? tr('先选择表情') : tr('生成分享口令');
    let accountReady = workspaceAccountState === 'ready';
    if (accountReady) { try { assertWorkspaceAccount(); } catch (_) { accountReady = false; } }
    $('#remove').disabled = locked || scanning || deleteNeedsReview || !selected.length || !accountReady;
    $('#remove').title = deleteNeedsReview ? tr('请先刷新核对上次删除结果') : !selected.length ? tr('先选择表情') : tr('删除所有已选表情，下一步核对清单');
    $('#clear').disabled = locked || !selected.length;
    $('#viewSelected').disabled = locked || (!selected.length && !selectedView && $('#filter').value !== 'selected');
    const review = $('#viewSelected'), reviewAction = selectedView ? tr('返回筛选') : tr('查看已选');
    review.querySelector('.control-label').textContent = review.title = reviewAction;
    review.setAttribute('aria-label', reviewAction);
    review.setAttribute('aria-pressed', String(!!selectedView));
    $('#selectPage').disabled = locked || !filtered().length;
    $('#scan').disabled = locked || scanning;
    $('#syncFavorites').disabled = locked || scanning || workspaceAccountState !== 'ready';
    $('#importOpen').disabled = locked || scanning || !accountReady || !personalReady;
    for (const selector of ['#search', '#filter', '#animation', '#metadataFilter', '#detectionFilter']) $(selector).disabled = locked;
    $('#settingsOpen').disabled = locked;
    for (const el of $('#organizeDialog').querySelectorAll('button,input,select,textarea')) {
      if (el.id !== 'organizeApply') el.disabled = metadataSaving;
    }
    $('#sendSelected').disabled = locked || scanning || sendUncertain || !selected.length || selected.length > 100 || !accountReady;
    $('#sendZoom').disabled = locked || sendUncertain || !zoomItem || !accountReady;
    $('#personalImportFile').disabled = $('#personalExport').disabled = metadataSaving || !personalReady || !accountReady;
    for (const selector of ['#personalSelectAll','#personalSelectSafe','#personalClearImport','#personalMergeKeywords','#personalName','#personalKeywords','#personalGroup','#personalNewGroupName','#personalReviewAccept','#personalAnimation']) $(selector).disabled = metadataSaving;
    for (const close of $('#personalEditor').querySelectorAll('[data-close]')) close.disabled = metadataSaving;
    for (const entry of personalDraft?.rows || []) { entry.check.disabled = metadataSaving; entry.mode.disabled = metadataSaving || !entry.hasConflict; }
    const task = sendingBusy ? ui(' · 正在发送',' · Sending') : scanning ? tr(' · 正在识别') : importingBusy ? tr(' · 正在添加') : deleting ? tr(' · 正在删除') : '';
    mini.textContent = tr('SeaTalk 表情助手') + ui(` · 收藏 · 已选 ${selected.length} 个`, ` · Favorites · ${selected.length} selected`) + task;
    mini.setAttribute('aria-label', ui('恢复 SeaTalk 表情助手，已选择 ' + selected.length + ' 个', 'Restore SeaTalk Sticker Helper, ' + selected.length + ' selected') + task);
  }
  function renderEmpty() {
    const empty = !filtered().length;
    $('#emptyState').hidden = !empty;
    if (!empty) return;
    $('#emptyReset').hidden = false;
    if (!favoritesRead && !items.length) {
      const waiting = workspaceAccountState === 'pending';
      $('#emptyTitle').textContent = waiting ? ui('正在读取收藏','Loading favorites') : ui('收藏尚未载入','Favorites have not loaded yet');
      $('#emptyMessage').textContent = waiting ? '' : workspaceAccountState === 'failed'
        ? ui('请刷新 SeaTalk，再打开表情助手核对当前账号。','Reload SeaTalk and reopen the helper to check the active account.')
        : ui('打开 SeaTalk 表情面板的爱心收藏，助手会自动同步。','Open the Favorites heart in SeaTalk’s sticker picker. The helper will sync your stickers.');
      $('#emptyScan').hidden = $('#emptyReset').hidden = true;
      return;
    }
    if (activeGroup === '' && !$('#search').value.trim() && activeItems().length && activeItems().every(item=>personalGroupFor(item.gifId))) {
      $('#emptyTitle').textContent = ui('所有收藏都已分组','All your favorites are grouped');
      $('#emptyMessage').textContent = ui('选择上方分组，或查看全部收藏。','Choose a group above or view all favorites.');
      $('#emptyScan').hidden = true;
      return;
    }
    const unknown = activeItems().some(item => effectiveAnimation(item) === 'unknown' && item.animation === 'unknown');
    const typeRequiresScan = ['animated', 'static'].includes($('#animation').value) && unknown;
    $('#emptyTitle').textContent = scanning ? tr('正在识别图片类型') : typeRequiresScan ? ui('先检测或手动标注图片形式','Inspect or manually label the image format') : $('#filter').value === 'selected' ? tr('当前没有符合条件的已选表情') : tr('没有找到符合条件的表情');
    $('#emptyMessage').textContent = scanning ? tr('识别完成后，这里会显示符合筛选条件的表情。') : typeRequiresScan ? ui('可点击「识别动图」，或切换到「全部形式」，编辑备注中的图片形式。备注、搜索和分享不依赖检测。','Choose Inspect animation, or switch to All formats and set a format in Edit sticker. Notes, search and sharing do not require inspection.') : tr('可以调整搜索或筛选条件。之前在其他页选择的表情仍会保留。');
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
    if (id === 'organizeDialog' && metadataSaving) return;
    if (id === 'importing') return cancelImport();
    if (id === 'deletion' && deleting) { stop = true; $('#deleteProgress').textContent = tr('正在等待当前结果，随后停止。'); return; }
    closeDialog($('#' + id));
  });
  function render() {
    renderGroupTabs();
    renderActiveFilters();
    const list = filtered(); page = Math.max(0, Math.min(page, Math.ceil(list.length / size) - 1));
    $('.grid').replaceChildren();
    for (const item of list.slice(page * size, (page + 1) * size)) {
      const card = document.createElement('button'); card.type = 'button';
      card.className = 'card'; card.dataset.id = item.gifId;
      styleSelection(card, item.selected);
      card.setAttribute('aria-label', item.label);
      const preview = document.createElement('span'); preview.className = 'preview';
      const image = document.createElement('img'); image.src = item.url; image.alt = ''; image.draggable = false;
      image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
      image.onerror = () => { image.alt = tr('预览加载失败'); };
      const name = document.createElement('span'); name.className = 'card-name';
      name.textContent = name.title = item.label;
      card.title = item.label;
      preview.append(image); card.append(preview, name);
      card.addEventListener('click', event => chooseCard(item, event));
      $('.grid').append(card);
    }
    $('.pagination').hidden = list.length <= size;
    $('#page').textContent = ui(`${page + 1} / ${Math.max(1, Math.ceil(list.length / size))} 页 · ${list.length} 个`, `Page ${page + 1} / ${Math.max(1, Math.ceil(list.length / size))} · ${list.length} stickers`);
    $('#jump').max = Math.max(1, Math.ceil(list.length / size)); $('#jump').value = page + 1;
    $('#first').disabled = $('#prev').disabled = page === 0;
    $('#last').disabled = $('#next').disabled = (page + 1) * size >= list.length;
    $('main').scrollTop = 0; updateSummary(); count(); renderEmpty();
  }
  $('#search').oninput = $('#filter').onchange = $('#animation').onchange = $('#metadataFilter').onchange = $('#detectionFilter').onchange = () => { selectionAnchor = null; page = 0; render(); };
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
  $('#clear').onclick = () => { if (busy()) return; selectionAnchor = null; items.forEach(item => item.selected = false); render(); };
  $('#viewSelected').onclick = () => {
    if (busy()) return;
    if (selectedView) {
      $('#search').value = selectedView.search; $('#animation').value = selectedView.animation; $('#metadataFilter').value = selectedView.metadata; $('#detectionFilter').value = selectedView.detection; $('#filter').value = selectedView.filter; page = selectedView.page; activeGroup = selectedView.group; selectedView = null;
    } else {
      selectedView = { search: $('#search').value, animation: $('#animation').value, metadata: $('#metadataFilter').value, detection: $('#detectionFilter').value, filter: $('#filter').value, group: activeGroup, page };
      activeGroup = null;
      $('#search').value = ''; $('#animation').value = $('#metadataFilter').value = $('#detectionFilter').value = 'all'; $('#filter').value = 'selected'; page = 0;
    }
    render();
  };
  $('#emptyReset').onclick = () => { $('#search').value = ''; $('#animation').value = $('#metadataFilter').value = $('#detectionFilter').value = $('#filter').value = 'all'; selectedView = null; activeGroup = null; selectionAnchor = null; page = 0; render(); };
  $('#emptyScan').onclick = () => $('#scan').click();
  function revealWorkspace() {
    host.dataset.open = host.dataset.managed = 'true'; host.style.display = ''; mini.hidden = true;
    document.getElementById('seatalk-personal-gif-avatar-panel')?.classList.remove('spga-open');
    if (geometryCustom) { const rect = host.getBoundingClientRect(); clampWindow(rect.left, rect.top); }
    startFavoritesSync(); syncFavorites();
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
    for (const selector of ['#syncStatus', '#scanStatus', '#shareStatus', '#importStatus', '#deleteSummary', '#deleteProgress', '#message', '#personalEditorStatus', '#personalDetectionStatus', '#personalSettingsStatus', '#sendStatus', '#sendSummary']) {
      const node = $(selector); node.textContent = tr(node.textContent);
    }
    for (const node of root.querySelectorAll('.import-card p,.import-card select option,.metadata-import-row select option')) node.textContent = tr(node.textContent);
    personalDraft?.rows.forEach(entry=>entry.refreshCopy?.());
    if (personalDraft) updatePersonalImportCount();
    if (organizationDraft) { populateGroupChoices(true); refreshOrganizationImpact(); }
    if (editorItem && $('#personalEditor').open) {
      refreshPersonalGroupChoices();
      $('#personalDetectionStatus').textContent=ui('自动检测：','Automatic detection: ')+detectionText(editorItem);
    }
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
    dismissActionNotice(); stopFavoritesSync();
    host.dataset.open = host.dataset.managed = 'false'; host.style.display = 'none'; mini.hidden = true; count();
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    document.getElementById('spga-quick-toggle')?.focus();
  }
  mini.onclick = () => { if (!host.isConnected) { mini.remove(); return; } revealWorkspace(); $('#minimize').focus(); };
  function hideWorkspace(back = false) {
    if (busy()) {
      stop = importStopped = sendStopped = true; sendPrepareGeneration++; $('#scanStatus').textContent = tr('正在停止后续操作，请等待当前结果后关闭。'); return false;
    }
    scanCancelled = true; activeRequests.forEach(controller => controller.abort());
    for (const dialog of root.querySelectorAll('dialog[open]')) closeDialog(dialog);
    dismissActionNotice(); stopFavoritesSync();
    host.dataset.open = host.dataset.managed = 'false'; host.style.display = 'none'; mini.hidden = true;
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    if (back) window.dispatchEvent(new CustomEvent('spga:collections-back'));
    return true;
  }
  $('#minimize').onclick = minimizeWorkspace;
  $('#close').onclick = () => hideWorkspace();
  $('#backAvatar').onclick = () => { if (!$('.workspace-tabs').hidden) hideWorkspace(true); };
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
  $('#copy').onclick = async () => { try { await navigator.clipboard.writeText($('#output textarea').value); $('#message').textContent = tr('已复制'); notifyAction($('#message').textContent); } catch (_) { $('#output textarea').select(); $('#message').textContent = tr('请按 ⌘C / Ctrl+C 复制'); notifyAction($('#message').textContent, 'info'); } };
  $('#download').onclick = () => {
    try {
      const text = $('#output textarea').value, total = JSON.parse(text).length;
      downloadMetadata(text, 'seatalk-selected-stickers.json');
      $('#message').textContent = ui(`已发起导出 ${total} 个表情：seatalk-selected-stickers.json。请查看浏览器下载。`, `Download requested for ${total} stickers: seatalk-selected-stickers.json. Check browser downloads.`);
      notifyAction($('#message').textContent);
    } catch (_) { $('#message').textContent = ui('导出失败，请重试。','Export failed. Try again.'); notifyAction($('#message').textContent, 'error'); }
  };

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

  function showSelectionDetails(selected) {
    const details = $('#selectionDetails');
    details.hidden = selected.length !== 1;
    if (details.hidden) return;
    const item = selected[0];
    const form = ({animated:tr('动图'),static:tr('静态图'),unknown:tr('未知')})[effectiveAnimation(item)];
    const noteState = item.metadata?.needsReview ? tr('需复核') : item.metadata ? tr('已备注') : tr('未备注');
    details.textContent = ui('图片形式：'+form+' · 备注状态：'+noteState+' · 检测：'+detectionText(item),
      'Format: '+form+' · Notes: '+noteState+' · Inspection: '+detectionText(item));
  }
  function renderGroupTabs() {
    const counts = new Map(), active = activeItems();
    for (const item of active) {
      const group = personalGroupFor(item.gifId);
      counts.set(group, (counts.get(group) || 0) + 1);
    }
    const all = $('#allGroups'), strip = $('#groupStrip');
    const names = personalGroupNames();
    if (activeGroup && !names.includes(activeGroup)) activeGroup = '';
    const search = $('#search');
    const groupLabel = activeGroup || tr('未分组');
    let scope = activeGroup === null ? ui('搜索全部收藏','Search all favorites')
      : ui('在「' + groupLabel + '」中搜索','Search in ' + groupLabel);
    if ($('#filter').value === 'selected') {
      scope = activeGroup === null ? ui('搜索已选表情','Search selected stickers')
        : ui('搜索「' + groupLabel + '」中的已选表情','Search selected stickers in ' + groupLabel);
    }
    search.placeholder = scope;
    search.setAttribute('aria-label', scope);
    all.querySelector('span').textContent = tr('全部') + ' (' + active.length + ')';
    all.setAttribute('aria-pressed', String(activeGroup === null));
    const focused = strip.contains(root.activeElement) ? root.activeElement.value : null;
    const scrollLeft = strip.scrollLeft;
    const fragment = document.createDocumentFragment();
    for (const group of ['', ...names]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.value = group;
      const label = group || tr('未分组'), total = counts.get(group) || 0;
      button.textContent = label + ' (' + total + ')';
      button.title = button.textContent;
      button.setAttribute('aria-pressed', String(group === activeGroup));
      button.onclick = () => chooseGroup(group);
      fragment.append(button);
    }
    strip.replaceChildren(fragment);
    strip.scrollLeft = scrollLeft;
    if (focused !== null) [...strip.children].find(button=>button.value === focused)?.focus({preventScroll:true});
  }
  function chooseGroup(group) {
    if (busy()) return;
    activeGroup = group; selectionAnchor = null;
    if (selectedView) { selectedView = null; $('#filter').value = 'all'; }
    page = 0; render();
    $('#groupTabs [aria-pressed=true]')?.focus({preventScroll:true});
  }
  $('#allGroups').onclick = () => chooseGroup(null);
  $('#groupStrip').addEventListener('focusin', event => {
    const strip = event.currentTarget, button = event.target;
    if (!button.matches('button:focus-visible')) return;
    const bounds = strip.getBoundingClientRect(), tab = button.getBoundingClientRect();
    const inset = 4; // Keep the keyboard focus ring within the scrollable strip.
    if (tab.left < bounds.left + inset) strip.scrollLeft += tab.left - bounds.left - inset;
    else if (tab.right > bounds.right - inset) strip.scrollLeft += tab.right - bounds.right + inset;
  });
  const activeFilters = $('#activeFilters');
  const filterIndicators = ['animation', 'metadataFilter', 'detectionFilter', 'filter'].map(id => {
    const control = $('#' + id), chip = document.createElement('button'), label = document.createElement('span');
    chip.type = 'button';
    chip.dataset.filterId = id;
    chip.innerHTML = stickerIcon('x');
    chip.prepend(label);
    chip.onclick = () => {
      if (busy()) return;
      if (id === 'filter' && selectedView) $('#viewSelected').click();
      else {
        control.value = 'all';
        control.dispatchEvent(new Event('change'));
      }
      (activeFilters.firstElementChild || $('#toolsToggle')).focus({preventScroll:true});
    };
    return {control, chip, label};
  });
  function renderActiveFilters() {
    for (const {control, chip, label} of filterIndicators) {
      if (control.value === 'all') { chip.remove(); continue; }
      const value = control.selectedOptions[0].label;
      label.textContent = value;
      const category = control.getAttribute('aria-label');
      const action = control.id === 'filter' && selectedView ? tr('返回筛选') :
        ui('移除' + category + '筛选「' + value + '」', 'Remove filter (' + category + ' · ' + value + ')');
      chip.title = action;
      chip.setAttribute('aria-label', action);
      if (!chip.isConnected) activeFilters.append(chip);
    }
    const total = activeFilters.childElementCount, badge = $('#toolsCount'), toggle = $('#toolsToggle');
    activeFilters.hidden = badge.hidden = total === 0;
    badge.textContent = total ? String(total) : '';
    const description = total ? ui('工具，' + total + ' 项筛选生效', 'Tools · ' + total + (total === 1 ? ' active filter' : ' active filters')) : tr('工具');
    toggle.title = description;
    toggle.setAttribute('aria-label', description);
  }
  function styleSelection(card, selected) {
    card.classList.toggle('chosen', selected);
    card.setAttribute('aria-pressed', String(selected));
  }
  function commitSelection(ids) {
    for (const item of items) item.selected = !item.deleted && ids.has(item.gifId);
    if ($('#filter').value === 'selected') {
      const scroll = $('main').scrollTop; render(); $('main').scrollTop = scroll;
    } else {
      for (const card of $('.grid').children) styleSelection(card, ids.has(card.dataset.id));
      count();
    }
  }
  function chooseCard(item, event) {
    if (busy()) return;
    const toggle = event.ctrlKey || event.metaKey;
    const ids = toggle ? new Set(selection().map(sticker => sticker.gifId)) : new Set();
    if (event.shiftKey && selectionAnchor) {
      const order = filtered().map(sticker => sticker.gifId);
      const start = order.indexOf(selectionAnchor), end = order.indexOf(item.gifId);
      if (start >= 0 && end >= 0) {
        for (const id of order.slice(Math.min(start,end), Math.max(start,end) + 1)) ids.add(id);
        commitSelection(ids); return;
      }
    }
    if (toggle && ids.has(item.gifId)) ids.delete(item.gifId);
    else ids.add(item.gifId);
    selectionAnchor = item.gifId;
    commitSelection(ids);
  }
  const scroller = $('main');
  function updateBand() {
    const band = rubberBand;
    if (!band) return;
    const rect = scroller.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, band.clientX - rect.left)) + scroller.scrollLeft;
    const y = Math.min(rect.height, Math.max(0, band.clientY - rect.top)) + scroller.scrollTop;
    if (!band.started && Math.hypot(x - band.x, y - band.y) < 4) return;
    band.started = true;
    const left = Math.min(x, band.x), right = Math.max(x, band.x);
    const top = Math.min(y, band.y), bottom = Math.max(y, band.y);
    const overlay = $('#rubberBand'); overlay.hidden = false;
    Object.assign(overlay.style, {left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    const ids = new Set(band.base);
    for (const row of band.cards) {
      if (row.right > left && row.left < right && row.bottom > top && row.top < bottom) ids.add(row.card.dataset.id);
      styleSelection(row.card, ids.has(row.card.dataset.id));
    }
    band.ids = ids;
  }
  function updateEdgeScroll() {
    const band = rubberBand;
    if (!band || band.frame || !band.started) return;
    const rect = scroller.getBoundingClientRect();
    const speed = band.clientY > rect.bottom - 20 ? 12 : band.clientY < rect.top + 20 ? -12 : 0;
    if (!speed || (speed > 0 ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight : scroller.scrollTop <= 0)) return;
    band.frame = requestAnimationFrame(() => {
      band.frame = 0; scroller.scrollTop += speed; updateBand(); updateEdgeScroll();
    });
  }
  scroller.addEventListener('pointerdown', event => {
    if (busy() || rubberBand || event.button !== 0 || event.pointerType === 'touch' ||
        (event.target !== scroller && event.target !== $('.grid'))) return;
    const rect = scroller.getBoundingClientRect();
    if (event.clientX >= rect.left + scroller.clientWidth || event.clientY >= rect.top + scroller.clientHeight) return;
    const offsetX = scroller.scrollLeft - rect.left, offsetY = scroller.scrollTop - rect.top;
    const base = event.shiftKey ? new Set(selection().map(item => item.gifId)) : new Set();
    const cards = Array.from($('.grid').children, card => {
      const bounds = card.getBoundingClientRect();
      return {card,left:bounds.left+offsetX,right:bounds.right+offsetX,top:bounds.top+offsetY,bottom:bounds.bottom+offsetY};
    });
    rubberBand = {pointerId:event.pointerId,x:event.clientX+offsetX,y:event.clientY+offsetY,
      clientX:event.clientX,clientY:event.clientY,cards,base,ids:base,frame:0,started:false};
    scroller.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  scroller.addEventListener('pointermove', event => {
    if (!rubberBand || rubberBand.pointerId !== event.pointerId) return;
    rubberBand.clientX = event.clientX; rubberBand.clientY = event.clientY;
    updateBand(); updateEdgeScroll();
  });
  scroller.addEventListener('scroll', updateBand, {passive:true});
  function finishBand(commit) {
    const band = rubberBand;
    if (!band) return;
    rubberBand = null;
    cancelAnimationFrame(band.frame); $('#rubberBand').hidden = true;
    if (scroller.hasPointerCapture(band.pointerId)) scroller.releasePointerCapture(band.pointerId);
    if (commit && !busy()) {
      selectionAnchor = null; commitSelection(band.ids);
    } else {
      const ids = new Set(selection().map(item => item.gifId));
      for (const card of $('.grid').children) styleSelection(card, ids.has(card.dataset.id));
    }
  }
  scroller.addEventListener('pointerup', event => {
    if (!rubberBand || rubberBand.pointerId !== event.pointerId) return;
    rubberBand.clientX = event.clientX; rubberBand.clientY = event.clientY;
    updateBand(); finishBand(true);
  });
  for (const type of ['pointercancel','lostpointercapture']) scroller.addEventListener(type, event => {
    if (rubberBand?.pointerId === event.pointerId) finishBand(false);
  });
  host.addEventListener('keydown', event => {
    if (event.key === 'Escape' && rubberBand) { event.stopImmediatePropagation(); finishBand(false); }
  }, {capture:true});

  $('#toolsToggle').onclick = () => {
    const panel = $('#toolsPanel'); panel.hidden = !panel.hidden;
    $('#toolsToggle').setAttribute('aria-expanded', String(!panel.hidden));
  };
  $('#previewSelected').onclick = () => {
    const selected = selection();
    if (busy() || selected.length !== 1) return;
    zoomItem = selected[0]; $('#zoom img').src = zoomItem.url; $('#zoom p').textContent = zoomItem.label;
    count(); openDialog($('#zoom'));
  };
  $('#editSelected').onclick = () => {
    const selected = selection();
    if (selected.length === 1) openPersonalEditor(selected[0]);
  };
  function populateOrganizationGroups(select, groupNames, selectedValue = '', {includeKeep = true} = {}) {
    select.replaceChildren(new Option(tr('未分组'), 'ungrouped'));
    if (includeKeep) select.prepend(new Option(ui('保持当前分组','Keep current group'), ''));
    if (groupNames.length) {
      const existing = document.createElement('optgroup');
      existing.label = ui('已有分组','Existing groups');
      for (const name of groupNames) existing.append(new Option(name, 'saved:' + name));
      select.append(existing);
    }
    select.append(new Option(ui('新建分组…','Create group…'), 'new'));
    select.value = selectedValue;
    if (select.selectedIndex < 0) select.selectedIndex = 0;
  }
  function readOrganizationGroup(select, newNameInput) {
    if (select.value === 'new') return newNameInput.value.trim();
    if (select.value === 'ungrouped') return '';
    if (select.value.startsWith('saved:')) return select.value.slice(6);
    return undefined;
  }
  function populateGroupChoices(keep = false) {
    const select = $('#organizeGroup');
    populateOrganizationGroups(select, personalGroupNames(), keep ? select.value : '');
    $('#newGroupLabel').hidden = select.value !== 'new';
  }
  function organizationChanges() {
    const changes = {name:$('#batchName').value.trim(), keywords:splitPersonalKeywords($('#batchKeywords').value)};
    const group = readOrganizationGroup($('#organizeGroup'), $('#newGroupName'));
    if (group !== undefined) changes.group = group;
    return changes;
  }
  function organizationImpactMetric(label, value, total) {
    const metric = document.createElement('span'), number = document.createElement('strong');
    metric.className = 'impact-metric';
    number.textContent = String(value);
    metric.append(label + ' ', number);
    if (total) {
      const track = document.createElement('span'), fill = document.createElement('span');
      track.className = 'impact-track';
      track.setAttribute('aria-hidden', 'true');
      fill.style.width = (100 * value / total) + '%';
      track.append(fill);
      metric.append(track);
    }
    return metric;
  }
  function refreshOrganizationImpact() {
    const apply = $('#organizeApply'); apply.disabled = true;
    const impact = $('#organizeImpact');
    impact.dataset.overwrite = 'false';
    apply.textContent = tr('保存整理');
    if (!organizationDraft) return;
    $('#newGroupLabel').hidden = $('#organizeGroup').value !== 'new';
    $('#organizeError').textContent = '';
    try {
      const changes = organizationChanges();
      if ($('#organizeGroup').value === 'new' && !changes.group) {
        impact.textContent = ui('输入新分组名称。','Enter a name for the new group.');
        return;
      }
      const preview = previewPersonalOrganization(organizationDraft.ids, changes);
      if (preview.revision !== organizationDraft.revision) throw Error('METADATA_CHANGED');
      const {selectedCount,movedCount,nameChangedCount,nameOverwriteCount,keywordChangedCount} = preview;
      impact.dataset.overwrite = String(nameOverwriteCount > 0);
      const metrics = [organizationImpactMetric(ui('已选','Selected'), selectedCount)];
      if (changes.name) metrics.push(organizationImpactMetric(ui('改名','Rename'), nameChangedCount, selectedCount));
      if ('group' in changes) metrics.push(organizationImpactMetric(ui('移组','Move'), movedCount, selectedCount));
      if (changes.keywords.length) metrics.push(organizationImpactMetric(ui('加关键字','Add keywords'), keywordChangedCount, selectedCount));
      if (nameOverwriteCount) {
        const warning = document.createElement('span');
        warning.className = 'impact-warning';
        warning.textContent = ui('将覆盖 ' + nameOverwriteCount + ' 个自定义名称',
          'Will replace ' + nameOverwriteCount + (nameOverwriteCount === 1 ? ' custom name' : ' custom names'));
        metrics.push(warning);
        apply.textContent = ui('确认覆盖并保存','Confirm replacement and save');
      } else if (!(nameChangedCount || movedCount || keywordChangedCount)) {
        apply.textContent = ui('完成','Done');
      }
      impact.replaceChildren(...metrics);
      apply.disabled = busy() || !selectedCount;
    } catch (error) {
      impact.replaceChildren();
      $('#organizeError').textContent = metadataMessage(error.message);
    }
  }
  $('#organizeSelected').onclick = () => {
    if (busy() || !personalReady || !selection().length || root.querySelector('dialog[open]')) return;
    try { assertWorkspaceAccount(); } catch (error) { notifyAction(metadataMessage(error.message),'error'); return; }
    const ids = selection().map(item => item.gifId);
    organizationDraft = {ids, revision:personalSnapshot.revision};
    $('#batchName').value = $('#batchKeywords').value = $('#newGroupName').value = '';
    populateGroupChoices(); refreshOrganizationImpact();
    if (openDialog($('#organizeDialog'))) $('#batchName').focus();
  };
  $('#organizeGroup').onchange = () => {
    refreshOrganizationImpact();
    if ($('#organizeGroup').value === 'new') $('#newGroupName').focus();
  };
  $('#newGroupName').oninput = $('#batchName').oninput = $('#batchKeywords').oninput = refreshOrganizationImpact;
  $('#organizeDialog').addEventListener('cancel', event => { if (metadataSaving) event.preventDefault(); });
  $('#organizeDialog').addEventListener('close', () => { if (!$('#organizeDialog').open) organizationDraft = null; });
  $('#organizeApply').onclick = async () => {
    if (busy() || !organizationDraft || !$('#organizeDialog').open || $('#organizeApply').disabled) return;
    refreshOrganizationImpact();
    if ($('#organizeApply').disabled) return;
    $('#organizeApply').disabled = true;
    try {
      const result = await savePersonalOrganization(organizationDraft.ids,organizationChanges(),organizationDraft.revision);
      closeDialog($('#organizeDialog'));
      const summary = [];
      if (result.nameChangedCount) summary.push(ui(result.nameChangedCount + ' 张已改名', result.nameChangedCount + ' renamed'));
      if (result.movedCount) summary.push(ui(result.movedCount + ' 张已移动', result.movedCount + ' moved'));
      if (result.keywordChangedCount) summary.push(ui(result.keywordChangedCount + ' 张已添加关键字', 'Keywords added to ' + result.keywordChangedCount));
      if (summary.length) notifyAction(summary.join(ui('，', ', ')) + ui('。', '.'));
      else notifyAction(ui('已保留所选表情的原设置。','Kept settings for the selected stickers.'));
    } catch (error) {
      $('#organizeError').textContent = metadataMessage(error.message);
      $('#organizeApply').disabled = error.message === 'METADATA_CHANGED';
    }
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
      const stored=draft.services.store.getState()?.messages?.customStickers;
      const list=Array.isArray(stored)?stored:liveSource(false).list;
      if(!draft.items.every(item=>list.some(row=>row.id===item.gifId || row.url===item.gifId)))throw Error();
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
  async function transmitStickerDraft(draft, {stopped, beforeIssue = () => {}, progress}) {
    let issued = 0, completed = 0;
    try {
      return await sendSelectedStickers(draft.items,{
        guard:()=>guardSend(draft),stopped,pause:ms=>new Promise(resolve=>setTimeout(resolve,ms)),
        preview:async item=>{
          if(globalThis.__SPGA_TEST_MODE__===true && draft.services.previewDimensions)return draft.services.previewDimensions(item);
          const img=new Image();img.referrerPolicy='no-referrer';img.src=validPreviewUrl(draft.services.fileUrl,item.gifId);
          let timer;try{await Promise.race([img.decode(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SEND_PREVIEW_FAILED')),10000);})]);return {width:img.naturalWidth,height:img.naturalHeight};}
          catch(_){throw Error('SEND_PREVIEW_FAILED');}finally{clearTimeout(timer);}
        },
        send:(item,dimensions)=>{
          guardSend(draft);beforeIssue();const ticket={before:new Set(Object.values(draft.services.store.getState().messages.messages||{}).map(message=>String(message.cid))),cid:null,rejected:false};
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
        report:(done,total)=>{ completed=done; progress(done,total); },
      });
    } catch(error) {
      if (issued > completed && error.message !== 'SEND_FAILED') sendUncertain = true;
      throw error;
    }
  }
  $('#sendConfirm').onclick=async()=>{
    const dialog = $('#sendConfirmation');
    if(!dialog.open || $('#sendConfirm').disabled || busy() || sendUncertain || !sendDraft || sendDraft.invalid)return;
    const draft=sendDraft;try{guardSend(draft);}catch(error){$('#sendStatus').textContent=sendMessage(error.message);return;}
    sendingBusy=true;sendStopped=false;$('#sendConfirm').disabled=true;$('#sendStop').hidden=false;render();
    let confirmed = 0, allConfirmed = false, tone = 'info', message;
    try{
      const result=await transmitStickerDraft(draft,{stopped:()=>sendStopped,progress:(done,total)=>{
        confirmed = done;
        const item=items.find(item=>item.gifId===draft.items[done-1].gifId);if(item)item.selected=false;
        $('#sendStatus').textContent=ui(`已观察到 SeaTalk 确认 ${done} / ${total} 张表情。`,`SeaTalk confirmation observed for ${done} / ${total} stickers.`);render();
      }});
      allConfirmed = result.sent === draft.items.length && !result.stopped && !sendStopped;
      if (allConfirmed) {
        message = ui('已发送 ' + result.sent + ' 张表情。', 'Sent ' + result.sent + (result.sent === 1 ? ' sticker.' : ' stickers.'));
        tone = 'success';
      } else {
        message = ui(`已停止，已确认 ${result.sent} / ${draft.items.length} 张。`, `Stopped. Confirmed ${result.sent} of ${draft.items.length}.`);
      }
    } catch (error) {
      tone = 'error';
      message = ui(`已确认 ${confirmed} / ${draft.items.length} 张。`, `Confirmed ${confirmed} of ${draft.items.length}. `) +
        sendMessage(error.message) + (sendUncertain && error.message !== 'SEND_UNCONFIRMED' ? ' ' + sendMessage('SEND_UNCONFIRMED') : '');
    } finally {
      sendingBusy = false;
      if (sendDraft === draft) {
        stopSendMonitor();
        $('#sendStop').hidden = true;
        $('#sendConfirm').disabled = true;
        $('#sendStatus').textContent = message;
        render();
        if (dialog.open) {
          if (allConfirmed) {
            // The send action may disappear with the cleared selection. Return to its sticker or the search field.
            const nextFocus = root.querySelector('.grid [data-id="' + draft.items[0].gifId + '"]') || $('#search');
            focusReturn.set(dialog, nextFocus);
            closeDialog(dialog);
            nextFocus.focus({preventScroll:true});
            sendDraft = null;
          }
          notifyAction(message, tone);
        }
      }
    }
  };

  function quickFavoriteRows(source, records, presetNames, fallbackName) {
    const seenIds = new Set(), rows = [];
    for (const entry of source) {
      const gifId = [entry?.id, entry?.url].find(validMetadataId);
      if (!gifId || seenIds.has(gifId)) continue;
      seenIds.add(gifId);
      const record = records.get(gifId);
      const label = record?.name || presetNames.get(gifId) || entry.name || fallbackName(rows.length + 1);
      rows.push({gifId, label, metadata:record ? {...record,name:label} : {name:label}});
    }
    return rows;
  }
  function filterQuickFavorites(rows, query, newestFirst) {
    const matches = rows.filter(row => !query || personalMetadataMatches(row.metadata,query));
    return newestFirst ? matches : matches.reverse();
  }

  let quickView = null, quickOldestFirst = false;
  function closeQuickPicker(returnFocus = false) {
    if (!quickView) return;
    const view = quickView;
    quickView = null;
    view.unsubscribe?.();
    view.cleanup();
    view.panel.remove();
    view.anchor.setAttribute('aria-expanded','false');
    if (returnFocus && view.anchor.isConnected) view.anchor.focus();
  }
  function currentQuickList(services) {
    const stored = services.store.getState()?.messages?.customStickers;
    if (Array.isArray(stored) && stored.length) return {rows:stored, verified:true};
    try { return {rows:liveSource(false).list, verified:true}; }
    catch (_) { return {rows:[], verified:false}; }
  }
  function acceptQuickStickerClick(event, button, previous) {
    if (!event.isTrusted || event.detail > 1 || !button || button.disabled) return false;
    // A native list refresh can replace the clicked cell between two mouse clicks.
    // Chrome may start a new click count for the replacement under the pointer.
    if (event.detail === 1 && previous && !previous.button.isConnected &&
        event.timeStamp - previous.time < 700 &&
        Math.abs(event.clientX - previous.x) <= 4 && Math.abs(event.clientY - previous.y) <= 4) return false;
    return true;
  }
  function quickTargetMatches(view) {
    try {
      return !!view.services && nativeWorkspaceAccountId(view.services) === view.account &&
        sameStickerSendTarget(view.target,currentStickerSendTarget(view.services,visibleSendEditor()));
    } catch (_) { return false; }
  }
  async function sendQuickSticker(view, item) {
    if (view !== quickView || busy() || sendUncertain || !view.target) return;
    if (!quickTargetMatches(view)) { closeQuickPicker(); return; }
    const draft = {services:view.services, target:view.target, account:view.account, items:[item], invalid:false};
    // Latch even a transient switch away and back, including after the popup closes.
    const watch = () => { if (!quickTargetMatches(view)) draft.invalid = true; };
    const unsubscribe = draft.services.store.subscribe(watch);
    sendingBusy = true;
    count();
    view.status.textContent = ui('正在发送…','Sending…');
    view.grid.setAttribute('aria-busy','true');
    try {
      const result = await transmitStickerDraft(draft, {
        stopped:() => quickView !== view,
        beforeIssue:() => { if (quickView !== view || !quickTargetMatches(view)) throw Error('SEND_TARGET_CHANGED'); },
        progress:() => {},
      });
      if (result.sent && quickView === view) view.status.textContent = ui('已发送','Sent');
    } catch (error) {
      const message = sendMessage(sendUncertain ? 'SEND_UNCONFIRMED' : error.message);
      if (quickView === view) view.status.textContent = message;
      else if (sendUncertain || error.message === 'SEND_FAILED') notifyAction(message,'error');
    } finally {
      unsubscribe();
      sendingBusy = false;
      view.grid.removeAttribute('aria-busy');
      count();
    }
  }
  function openQuickPicker() {
    if (quickView) { closeQuickPicker(true); return; }
    if (busy() || root.querySelector('dialog[open]')) return;
    const anchor = document.getElementById('spga-quick-toggle');
    if (!anchor?.isConnected || !anchor.getClientRects().length) return;
    if (host.dataset.open === 'true' && !hideWorkspace()) return;
    if (!mini.hidden) mini.hidden = true;
    const panel = document.createElement('section');
    panel.id = 'st-quick-stickers';
    panel.lang = language.locale;
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label', ui('表情快选','Quick stickers'));
    const quickRoot = panel.attachShadow({mode:'open'});
    quickRoot.innerHTML = `<style>
      :host{display:block;position:fixed;z-index:2147483646;width:min(378px,calc(100vw - 16px));font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#263447}
      *{box-sizing:border-box}.picker{display:flex;flex-direction:column;max-height:inherit;border:1px solid #d7e0ea;border-radius:12px;background:#fff;box-shadow:0 9px 32px #24364d2e;overflow:hidden}
      header,.searchbar,footer{display:flex;align-items:center;gap:8px;padding:8px 12px}header{background:#f3f6fa}header strong{font-size:15px}#target{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#667085;font-size:12px}
      button,input{font:inherit;color:inherit}button{background:transparent;border:0;border-radius:6px;padding:5px;cursor:pointer}button:hover,button:focus-visible{background:#edf4fd;color:#0866c6}button:focus-visible,input:focus-visible{outline:2px solid #3783cc;outline-offset:1px}
      .icon-action,#collect{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;min-width:34px;min-height:34px}.st-icon{flex:none;pointer-events:none}
      .search-field{position:relative;flex:1;min-width:0}.search-field>.st-icon{position:absolute;inset-inline-start:9px;top:50%;transform:translateY(-50%);color:#667085}
      .search-field input{width:100%;height:34px;border:1px solid #ccd6e2;border-radius:7px;padding:6px 8px;padding-inline-start:35px;background:#fff}#sort{border:1px solid #ccd6e2}
      main{min-height:0;overflow:auto;overscroll-behavior:contain;padding:3px 10px;scrollbar-gutter:stable}#stickers{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}.sticker{min-width:0;aspect-ratio:1;display:grid;place-items:center;touch-action:manipulation}.sticker img{width:100%;height:100%;object-fit:contain;pointer-events:none}
      #status{flex:1;min-width:0;margin:0;color:#53657a;font-size:12px;overflow-wrap:anywhere}footer{flex-wrap:wrap;border-top:1px solid #e8edf2}footer button{color:#0866c6;font-weight:550}#collect{gap:5px}#collect:disabled{opacity:.5;cursor:default}
    </style><div class="picker"><header><strong></strong><span id="target"></span><button id="manage" class="icon-action" type="button">${stickerIcon('grid')}</button><button id="close" class="icon-action" type="button">${stickerIcon('x')}</button></header>
    <div class="searchbar"><label class="search-field">${stickerIcon('search')}<input type="search"></label><button id="sort" class="icon-action" type="button"></button></div><main><div id="stickers"></div></main><footer><p id="status" role="status" aria-live="polite"></p><button id="collect" type="button">${stickerIcon('collect')}<span></span></button></footer></div>`;
    const el = selector => quickRoot.querySelector(selector);
    const search = el('input'), sort = el('#sort'), grid = el('#stickers'), scroller = el('main'), status = el('#status');
    function labelAction(button, label) {
      button.title = label;
      button.setAttribute('aria-label', label);
    }
    function renderSort() {
      const label = quickOldestFirst
        ? ui('最早在前，点击切换为最新在前','Oldest first. Switch to newest first')
        : ui('最新在前，点击切换为最早在前','Newest first. Switch to oldest first');
      sort.innerHTML = stickerIcon(quickOldestFirst ? 'sort-asc' : 'sort-desc');
      labelAction(sort, label);
    }
    el('strong').textContent = ui('表情快选','Quick stickers');
    search.placeholder = ui('搜索全部收藏','Search all favorites');
    search.setAttribute('aria-label',search.placeholder);
    renderSort();
    labelAction(el('#close'),ui('关闭','Close'));
    labelAction(el('#manage'),ui('管理表情','Manage stickers'));
    el('#collect span').textContent = ui('从聊天收藏','Collect from chat');
    status.textContent = ui('正在读取收藏…','Loading favorites…');
    const titles = [...document.querySelectorAll('.messages-message-detail-view-header .title-wrap > .title')].filter(node=>node.getClientRects().length);
    const openingTitle = titles.length === 1 ? titles[0] : null;
    const openingText = openingTitle?.textContent.trim() || '';
    const openingServices = favoritesSyncServices;
    let openingTarget = null, openingAccount = 0;
    if (openingServices) {
      try {
        openingTarget = currentStickerSendTarget(openingServices,visibleSendEditor());
        openingAccount = nativeWorkspaceAccountId(openingServices);
      } catch (_) { /* Management remains available without a sendable chat. */ }
    }
    const view = {panel,anchor,toolbar:anchor.parentElement,grid,status,services:null,account:0,target:null,unsubscribe:null,cleanup:()=>{}};
    quickView = view;
    anchor.setAttribute('aria-expanded','true');
    document.body.append(panel);

    function position() {
      if (!anchor.isConnected || !anchor.getClientRects().length) { closeQuickPicker(); return; }
      const rect = anchor.getBoundingClientRect();
      const below = innerHeight - rect.bottom, above = rect.top;
      const placeAbove = above >= below;
      panel.style.maxHeight = Math.max(100, Math.min(440, (placeAbove ? above : below) - 12)) + 'px';
      panel.style.left = Math.max(8,Math.min(innerWidth - panel.offsetWidth - 8,rect.left)) + 'px';
      if (placeAbove) { panel.style.bottom = (innerHeight - rect.top + 5) + 'px'; panel.style.top = 'auto'; }
      else { panel.style.top = (rect.bottom + 5) + 'px'; panel.style.bottom = 'auto'; }
    }
    function outside(event) {
      const path = event.composedPath();
      if (!path.includes(panel) && !path.includes(anchor)) closeQuickPicker();
    }
    function escape(event) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeQuickPicker(true); }
    }
    document.addEventListener('pointerdown',outside,true);
    document.addEventListener('keydown',escape,true);
    window.addEventListener('resize',position);
    window.addEventListener('scroll',position,true);
    function openingChatChanged() {
      return !anchor.isConnected || anchor.parentElement !== view.toolbar ||
        (openingTitle && (!openingTitle.isConnected || openingTitle.textContent.trim() !== openingText));
    }
    const titleWatch = new MutationObserver(() => { if (!view.target && quickView === view) closeQuickPicker(); });
    if (openingTitle) titleWatch.observe(openingTitle,{characterData:true,childList:true,subtree:true});
    const remount = new MutationObserver(() => { if (!host.isConnected || openingChatChanged()) closeQuickPicker(); });
    remount.observe(document.body,{childList:true,subtree:true});
    view.cleanup = () => {
      document.removeEventListener('pointerdown',outside,true); document.removeEventListener('keydown',escape,true);
      window.removeEventListener('resize',position); window.removeEventListener('scroll',position,true); remount.disconnect(); titleWatch.disconnect();
    };
    el('#close').onclick = () => closeQuickPicker(true);
    el('#manage').onclick = () => { if (!busy()) { closeQuickPicker(); revealWorkspace(); } };
    el('#collect').onclick = () => {
      if (busy() || !quickTargetMatches(view)) return;
      closeQuickPicker(); startChatStickerCapture();
    };
    el('#collect').disabled = true;
    position(); search.focus({preventScroll:true});

    let all = [], matches = [], loaded = 0, verified = false, lastSource = null;
    const byId = new Map();
    function appendPage() {
      const end = Math.min(matches.length, loaded + 50);
      const fragment = document.createDocumentFragment();
      for (; loaded < end; loaded++) {
        const item = matches[loaded], button = document.createElement('button'), image = document.createElement('img');
        button.type = 'button'; button.className = 'sticker'; button.dataset.id = item.gifId;
        button.title = item.label; button.setAttribute('aria-label',item.label);
        image.alt = ''; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer'; image.draggable = false;
        try { image.src = validPreviewUrl(view.services.fileUrl,item.gifId); }
        catch (_) { button.disabled = true; }
        button.append(image); fragment.append(button);
      }
      grid.append(fragment);
    }
    function showMatches() {
      matches = filterQuickFavorites(all,search.value,!quickOldestFirst);
      loaded = 0; scroller.scrollTop = 0; grid.replaceChildren(); appendPage();
      if (sendUncertain) status.textContent = sendMessage('SEND_UNCONFIRMED');
      else if (!verified) status.textContent = ui('请在原生表情面板打开一次爱心「收藏」，然后重新打开快选。','Open the Favorites heart in SeaTalk’s sticker picker once, then reopen Quick stickers.');
      else if (!matches.length) status.textContent = search.value ? ui('没有匹配的表情','No matching stickers') : ui('还没有收藏的表情','No favorites yet');
      else status.textContent = ui('点表情即可发送','Click a sticker to send');
    }
    function refresh(list) {
      const next = quickFavoriteRows(list.rows,personalRecords(),known,n => ui('收藏 ' + n,'Favorite ' + n));
      const unchanged = lastSource && verified === list.verified && next.length === all.length &&
        next.every((row,index) => row.gifId === all[index].gifId && row.label === all[index].label);
      lastSource = list.rows;
      if (unchanged) return;
      verified = list.verified; all = next;
      byId.clear(); for (const row of all) byId.set(row.gifId,row);
      showMatches();
    }
    search.oninput = showMatches;
    sort.onclick = () => { quickOldestFirst = !quickOldestFirst; renderSort(); showMatches(); };
    scroller.onscroll = () => { if (loaded < matches.length && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 90) appendPage(); };
    grid.addEventListener('keydown', event => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    });
    let previousClick = null;
    grid.addEventListener('click', event => {
      const button = event.target.closest('button[data-id]');
      if (!acceptQuickStickerClick(event,button,previousClick)) return;
      previousClick = {button,time:event.timeStamp,x:event.clientX,y:event.clientY};
      event.stopPropagation();
      const item = byId.get(button.dataset.id);
      if (item) void sendQuickSticker(view,item);
    });
    Promise.resolve(workspaceReady).then(() => {
      if (view !== quickView) return;
      if (openingChatChanged()) { closeQuickPicker(); return; }
      assertWorkspaceAccount();
      const services = favoritesSyncServices;
      if (!services || typeof services.sendSticker !== 'function' || typeof services.store.subscribe !== 'function') throw Error('SEND_SERVICE_UNAVAILABLE');
      view.services = services; view.account = nativeWorkspaceAccountId(services);
      view.target = currentStickerSendTarget(services,visibleSendEditor());
      if (openingServices && (!sameStickerSendTarget(openingTarget,view.target) || openingAccount !== view.account)) { closeQuickPicker(); return; }
      if (!openingServices && !openingText) {
        view.target = null;
        status.textContent = ui('请重新打开快选，核对当前会话。','Reopen Quick stickers to verify the current chat.');
        return;
      }
      titleWatch.disconnect();
      el('#target').textContent = ui('发给 ','To ') + view.target.name;
      el('#target').title = view.target.name; el('#collect').disabled = false;
      refresh(currentQuickList(services));
      view.unsubscribe = services.store.subscribe(() => {
        if (!quickTargetMatches(view)) { closeQuickPicker(); return; }
        const stored = services.store.getState()?.messages?.customStickers;
        if (Array.isArray(stored) && stored !== lastSource && (stored.length || verified)) refresh(currentQuickList(services));
      });
    }).catch(error => {
      if (view === quickView) status.textContent = sendMessage(error.message);
    });
  }
  host.__openQuick = openQuickPicker;

  function stickerFromChatRow(row) {
    // An ordinary image, emoji reaction or quoted message is never a sticker selection.
    const selector = row.matches('.messages-message-list-item.sticker_c') ? '.messages-message-list-item-sticker-content img'
      : row.matches('.messages-message-list-item.image_c') ? '.messages-message-list-item-image-content img' : null;
    if (!selector) return null;
    const image = row.querySelector(selector);
    if (!image) return null;
    let url;
    try { url = new URL(image.currentSrc || image.src); } catch (_) { return null; }
    const id = url.pathname.match(/^\/download\/([a-zA-Z0-9]{64})(?:_|$)/)?.[1];
    if (!validMetadataId(id) || !isFavoritePreviewUrl(url,id)) return null;
    const width = image.naturalWidth, height = image.naturalHeight;
    if (!width || !height || width > 20000 || height > 20000) return null;
    return {gifId:id, width, height, url:url.href};
  }

  function captureRowsBetween(rows, first, last, bounds) {
    const top = Math.max(bounds.top, Math.min(first, last));
    const bottom = Math.min(bounds.bottom, Math.max(first, last));
    return rows.filter(row => {
      const rect = row.getBoundingClientRect();
      return rect.width && rect.height && rect.bottom >= top && rect.top <= bottom;
    });
  }

  async function startChatStickerCapture() {
    if (busy() || scanning || root.querySelector('dialog[open]')) return;
    await workspaceReady;
    if (busy() || !favoritesSyncServices || !personalReady || importNeedsReview) {
      notifyAction(ui('请先载入收藏和个人设置。若上一次添加未确认，请刷新后核对。','Load favorites and personal settings first. After an unconfirmed addition, refresh and check favorites.'),'info');
      return;
    }
    const services = favoritesSyncServices;
    const lists = [...document.querySelectorAll('.messages-message-detail-view .messages-message-list')].filter(list=>list.getClientRects().length);
    const list = lists.length === 1 && lists[0];
    let account, target;
    try {
      account = assertWorkspaceAccount();
      target = currentStickerSendTarget(services, visibleSendEditor());
      if (!list || !Array.isArray(services.store.getState()?.messages?.customStickers)) throw Error();
      if (!services.store.getState().messages.customStickers.length) liveSource(false);
    } catch (_) {
      notifyAction(ui('请打开普通聊天及原生爱心收藏页，再试一次。','Open a direct or group chat and its Favorites tab, then try again.'),'info');
      return;
    }

    captureActive = true;
    host.dataset.open = host.dataset.managed = 'false';
    host.style.display = 'none'; mini.hidden = true;
    window.dispatchEvent(new CustomEvent('spga:layout-change'));
    const panel = document.createElement('aside');
    panel.id = 'spga-chat-capture';
    panel.style.cssText = 'position:fixed;z-index:2147483646;max-width:calc(100vw - 24px);';
    const box = panel.attachShadow({mode:'open'});
    box.innerHTML = `<style>
      :host{font:14px/1.45 system-ui;color:#17243b}*{box-sizing:border-box}
      section{padding:12px;background:white;border:1px solid #bdd3ec;border-radius:12px;box-shadow:0 5px 26px #19315030;min-width:min(330px,90vw);max-width:min(430px,90vw)}
      section{overflow-y:auto;overscroll-behavior:contain}
      .bar,.buttons{display:flex;gap:8px;align-items:center}.bar strong{flex:1}
      button,input,textarea,select{font:inherit}button{border:1px solid #cbd5e1;background:white;border-radius:6px;padding:5px 10px;cursor:pointer}
      button.primary{background:#1263b1;color:white;border-color:#1263b1}button:disabled{opacity:.5;cursor:default}
      p{margin:7px 0;color:#45566a}label,input,textarea,select{display:block;width:100%}label{margin:8px 0}
      input,textarea,select{border:1px solid #cbd5e1;border-radius:5px;padding:5px;background:white;color:inherit}textarea{resize:vertical}
      .images{display:flex;gap:4px;overflow:auto;max-height:58px}.images img{width:44px;height:44px;object-fit:contain}
      [hidden]{display:none!important}.buttons{justify-content:flex-end;margin-top:8px}
    </style><section role="region"><div class="bar"><strong></strong><button id="cancel" type="button"></button></div>
    <p id="help"></p><p id="stats" role="status"></p><div id="review" hidden><div class="images"></div>
    <label><span id="groupLabel"></span><select id="group"></select></label>
    <label id="newGroupField" hidden><span id="newGroupLabel"></span><input id="newGroupName" maxlength="60"></label>
    <label><span id="keywordsLabel"></span><input id="keywords" maxlength="2000"></label><p id="impact"></p></div>
    <div class="buttons"><button id="back" type="button" hidden></button><button class="primary" type="button" id="primary"></button></div></section>`;
    document.body.append(panel);
    const el = selector => box.querySelector(selector);
    el('strong').textContent = ui('从聊天收藏','Collect from chat');
    el('#cancel').textContent = ui('退出','Close');
    el('#help').textContent = ui('拖过消息选取表情（最多 100 张），单击已选表情可取消。','Drag across messages to select up to 100 stickers. Click a selected sticker to deselect it.');
    el('#groupLabel').textContent = tr('移到分组');
    el('#newGroupLabel').textContent = tr('新分组名称');
    el('#keywordsLabel').textContent = tr('追加搜索关键字');
    el('#keywords').placeholder = tr('用逗号分隔，例如：工作，上班，打工人');
    el('#back').textContent = ui('继续选择','Keep selecting');
    const chosen = new Map(), marks = new Map(), listeners = new AbortController();
    const signal = listeners.signal;
    let drag = null, mode = 'select', revision = null, reviewedFresh = new Set();
    let saving = false, stopRequested = false, issued = false, ended = false, unsubscribe;
    function validContext() {
      try { return !ended && list.isConnected && assertWorkspaceAccount() === account &&
        sameStickerSendTarget(target,currentStickerSendTarget(services,visibleSendEditor())); } catch (_) { return false; }
    }
    function position() {
      const rect = list.getBoundingClientRect();
      const form = el('section'), edge = 8;
      const top = Math.max(edge, Math.min(rect.top + edge, innerHeight - edge - form.offsetHeight));
      panel.style.top = top + 'px';
      form.style.maxHeight = Math.max(0, innerHeight - top - edge) + 'px';
      panel.style.right = Math.max(8,window.innerWidth-rect.right+8)+'px';
    }
    function finish() {
      if (ended) return;
      ended = true;
      listeners.abort(); unsubscribe?.(); observer.disconnect();
      if (drag && list.hasPointerCapture?.(drag.id)) list.releasePointerCapture(drag.id);
      selectionStyle.remove(); list.classList.remove('spga-capturing');
      for (const row of marks.keys()) row.classList.remove('spga-capture-picked');
      captureActive = false; panel.remove(); count();
      if (validReturnFocus()) document.getElementById('spga-quick-toggle')?.focus();
    }
    function validReturnFocus() { return host.isConnected && list.isConnected; }
    function changed() {
      if (!validContext()) {
        if (issued) importNeedsReview=true;
        finish();
        notifyAction(issued ? ui('聊天或账号已切换。已提交的表情可能已收藏，请刷新核对。','The chat or account changed. Submitted stickers may already be saved. Reload and check favorites.')
          : ui('聊天或账号已切换，已退出拖选。','The chat or account changed. Selection closed.'),'info');
      } else if (mode === 'select') paint();
    }
    const selectionStyle = document.createElement('style');
    selectionStyle.textContent = '.spga-capturing{cursor:crosshair!important;user-select:none!important}.spga-capturing .spga-capture-picked :is(.messages-message-list-item-sticker-content,.messages-message-list-item-image-content){outline:3px solid #1675c9;outline-offset:1px;border-radius:6px}';
    document.head.append(selectionStyle); list.classList.add('spga-capturing');
    const rows = () => [...list.querySelectorAll('.messages-message-list-item')];
    function paint() {
      for (const row of rows()) {
        const record = stickerFromChatRow(row), picked = !!record && chosen.has(record.gifId);
        row.classList.toggle('spga-capture-picked',picked);
        if (picked) marks.set(row,true); else marks.delete(row);
      }
      for (const row of marks.keys()) if (!list.contains(row)) { row.classList.remove('spga-capture-picked'); marks.delete(row); }
    }
    function saved(id) {
      const stored = services.store.getState().messages.customStickers;
      if (!Array.isArray(stored)) throw Error('CAPTURE_NO_FAVORITES');
      const alias = importedResourceIds.get(id);
      const match = stored.find(row=>row.id===id || row.url===id || (alias && (row.id===alias || row.url===alias)));
      return match && [match.id,match.url].find(validMetadataId) || null;
    }
    function idsForPlan() { return [...new Set([...chosen.keys()].map(id=>saved(id)||id))]; }
    function changes() {
      const group = readOrganizationGroup(el('#group'), el('#newGroupName')), keywords = splitPersonalKeywords(el('#keywords').value);
      if (el('#group').value === 'new' && !group) throw Error('GROUP_NAME_REQUIRED');
      return group === undefined ? {keywords} : {group,keywords};
    }
    function update() {
      const total = chosen.size, freshIds = [...chosen.keys()].filter(id=>!saved(id)), fresh = freshIds.length;
      el('#stats').textContent = ui(`已选 ${total} 张 · 待新增 ${fresh} 张 · 已收藏 ${total-fresh} 张`,`${total} selected · ${fresh} new · ${total-fresh} already saved`);
      if (mode === 'select') {
        el('#primary').textContent = ui('预览所选','Review selection'); el('#primary').disabled = !total;
        return;
      }
      reviewedFresh = new Set(freshIds);
      el('#newGroupField').hidden = el('#group').value !== 'new';
      try {
        const options = changes(), ids = idsForPlan(), plan = planPersonalOrganization(personalSnapshot,ids,options);
        el('#impact').textContent = options.keywords.length ? ui('将为 ' + plan.keywordChangedCount + ' 张添加关键字。', 'Add keywords to ' + plan.keywordChangedCount + ' stickers.') : '';
        let action = ui('完成','Done');
        if (plan.movedCount || plan.keywordChangedCount) action = fresh ? ui('确认收藏与整理','Add and organize') : tr('保存整理');
        else if (fresh) action = ui('确认收藏','Add to favorites');
        el('#primary').textContent = action;
        el('#primary').disabled = saving || !total;
      } catch (error) {
        el('#impact').textContent = error.message === 'GROUP_NAME_REQUIRED' ? ui('输入新分组名称。','Enter a name for the new group.') : metadataMessage(error.message);
        el('#primary').disabled = true;
      }
    }
    function selectRow(row, removing) {
      const item = stickerFromChatRow(row);
      if (!item) return;
      if (removing) chosen.delete(item.gifId);
      else if (chosen.size < 100) chosen.set(item.gifId,item);
    }
    list.addEventListener('pointerdown',event=>{
      if (mode !== 'select' || event.button !== 0 || !event.isPrimary || !validContext()) return;
      const row = event.target.closest('.messages-message-list-item');
      if (!row || !list.contains(row)) return;
      const item = stickerFromChatRow(row);
      drag = {id:event.pointerId, originY:event.clientY, lastY:event.clientY, moved:false, removing:!!item && chosen.has(item.gifId)};
      list.setPointerCapture(event.pointerId);
      event.preventDefault(); event.stopPropagation();
      // Use the actual event target for a click. Virtualized chat rows can overlap while scrolling.
      selectRow(row,drag.removing);
      paint(); update();
    },{capture:true,signal});
    list.addEventListener('pointermove',event=>{
      if (!drag || drag.id!==event.pointerId || !validContext()) return;
      if (!(event.buttons & 1)) { drag=null; return; }
      if (!drag.moved && Math.abs(event.clientY-drag.originY)<5) return;
      if (drag.lastY===event.clientY) return;
      drag.moved=true;
      for (const row of captureRowsBetween(rows(),drag.lastY,event.clientY,list.getBoundingClientRect())) selectRow(row,drag.removing);
      drag.lastY=event.clientY;
      paint(); update();
    },{capture:true,signal});
    function lift(e) { if(drag?.id===e.pointerId) drag=null; }
    for (const event of ['pointerup','pointercancel','lostpointercapture']) list.addEventListener(event,lift,{signal});
    list.addEventListener('click',e=>{if(mode==='select'){e.preventDefault();e.stopImmediatePropagation();}},{capture:true,signal});
    function review(on) {
      if (!validContext()) { changed(); return; }
      mode = on?'review':'select'; revision = on?personalSnapshot.revision:null;
      el('#review').hidden = el('#back').hidden = on===false;
      el('#help').hidden = on;
      el('.images').replaceChildren();
      if (on) {
        const select = el('#group');
        populateOrganizationGroups(select, personalGroupNames(), select.value);
        for (const item of chosen.values()) { const img=document.createElement('img');img.alt='';img.referrerPolicy='no-referrer';img.src=item.url;el('.images').append(img); }
      }
      update(); if (on) el('#group').focus();
    }
    async function confirm() {
      if (saving || !validContext() || !chosen.size || mode!=='review' || el('#primary').disabled) return;
      let stopObserving=()=>{};
      try {
        const options=changes(), before=personalSnapshot;
        if (before.revision!==revision) throw Error('METADATA_CHANGED');
        const pending=[...chosen.values()].filter(item=>!saved(item.gifId)).map((item,i)=>({...item,label:'Sticker '+(i+1)}));
        if (pending.some(item=>!reviewedFresh.has(item.gifId))) { update(); return; }
        saving=true; el('#primary').disabled=true;el('#back').disabled=true;
        el('#cancel').textContent=ui('停止后续收藏','Stop remaining');
        el('#group').disabled=el('#newGroupName').disabled=el('#keywords').disabled=true;
        const requireContext = () => { if (!validContext()) throw Error('CAPTURE_CHANGED'); };
        requireContext();
        const result=pending.length ? await addSharedStickers(pending,{
          accountId:()=>nativeWorkspaceAccountId(services), active:validContext,
          stopped:()=>stopRequested, has:id=>!!saved(id), pause:pauseImport,
          report:text=>{el('#stats').textContent=language.locale==='zh'?text:ui('', 'Adding selected stickers…');},
          add:item=>{
            requireContext(); stopObserving();
            stopObserving=observeImportRefresh(item,{services,active:validContext});
            issued=true;
            return services.actions.actionAddCustomStickerFromMessage({tag:services.tag,content:{fileId:item.gifId,width:item.width,height:item.height}});
          }
        }):{added:0};
        requireContext();
        const exact=[...chosen.keys()].map(saved);
        const canonical=[...new Set(result.stopped ? exact.filter(Boolean) : exact)];
        if (canonical.some(id=>!id)) throw Error('CAPTURE_UNCONFIRMED');
        let metadataUpdated = false;
        if (canonical.length && ('group' in options || options.keywords.length)) {
          const mapped=planPersonalOrganization(before,canonical,options);
          if (mapped.movedCount || mapped.keywordChangedCount) {
            requireContext();
            await savePersonalOrganization(canonical,options,revision);
            requireContext();
            metadataUpdated = true;
          }
        }
        finish();
        if (result.stopped) {
          notifyAction(ui(`已停止后续收藏。已新增 ${result.added} 张，已核对 ${canonical.length} 张。`,`Stopped. Added ${result.added} and verified ${canonical.length} favorites.`),'info');
          return;
        }
        const summary = [];
        if (result.added) summary.push(ui(`已新增 ${result.added} 张`,`Added ${result.added}`));
        if (metadataUpdated) summary.push(ui('已保存整理','Changes saved'));
        if (!summary.length) summary.push(ui('所选表情均已收藏','All selected stickers are already saved'));
        notifyAction(summary.join(ui('，',', ')) + ui('。','.'),'success');
      } catch(error) {
        if (issued) importNeedsReview=true;
        if (ended) return;
        const message=error.message.startsWith('METADATA_')?metadataMessage(error.message):
          ui('结果未确认，请刷新并核对收藏。','Result unconfirmed. Reload and check favorites.');
        finish(); notifyAction(message,'error');
      } finally { stopObserving(); }
    }
    el('#primary').onclick=()=>{if(mode==='select')review(true);else void confirm();};
    el('#back').onclick=()=>review(false);
    const cancel=()=>{
      if (!saving) {finish();return;}
      stopRequested=true; el('#cancel').disabled=true;
      el('#stats').textContent=ui('正在等待当前收藏结果…','Waiting for the current sticker…');
    };
    el('#cancel').onclick=cancel;
    el('#group').onchange = () => {
      update();
      if (el('#group').value === 'new') el('#newGroupName').focus();
    };
    el('#keywords').oninput=el('#newGroupName').oninput=update;
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();cancel();}},{capture:true,signal});
    window.addEventListener('resize',position,{signal});
    const observer=new MutationObserver(changed);
    observer.observe(list,{childList:true,subtree:true});
    const detail=list.closest('.messages-message-detail-view'); if(detail?.parentElement) observer.observe(detail.parentElement,{childList:true,subtree:false});
    if(typeof services.store.subscribe==='function') unsubscribe=services.store.subscribe(changed);
    position(); update(); el('#cancel').focus();
  }

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
        if (item.selected) showSelectionDetails(selection());
      }
    };
    try { await Promise.all([worker(), worker(), worker()]); }
    finally {
      scanning = false; $('#scanStop').hidden = true;
      const failures = activeItems().filter(item => item.animation === 'failed').length;
      $('#scanStatus').textContent = scanCancelled ? tr('已停止识别，已完成的分类仍然保留。') : queue.length
        ? ui(`识别完成${failures ? `，${failures} 个未能识别，可再次点击重试` : ''}。`, `Inspection complete.${failures ? ` ${failures} could not be identified. Inspect again to retry.` : ''}`) : tr('已经完成分类，无需重复检测。');
      notifyAction($('#scanStatus').textContent, scanCancelled || failures ? 'info' : 'success');
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
      notifyAction($('#deleteProgress').textContent, error ? 'error' : stop ? 'info' : 'success');
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
    notifyAction(ui('已恢复默认布局、窗口位置和大小。收藏列表未重新加载。','Default layout, window position and size restored. Favorites were not reloaded.'), 'info');
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
  function observeImportRefresh(item, capture = null) {
    if (globalThis.__SPGA_TEST_MODE__ === true) return () => {};
    const services=capture?.services || importServices;
    const account=nativeWorkspaceAccountId(services), generation=importGeneration;
    const contextActive=capture?.active || (()=>generation===importGeneration && account===importAccountId);
    const originalFetch=window.fetch;
    const allowedHost=new URL(validPreviewUrl(services.fileUrl,item.gifId)).hostname;
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
              if(active && contextActive() &&
                nativeWorkspaceAccountId(services)===account && host.isConnected &&
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
    const links = [...new Set(Array.from(document.head.querySelectorAll('link[rel~="modulepreload"][href],script[type="module"][src]'), e => e.href || e.src || ''))];
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
    const accountUrl = getFavoritesAccountModuleUrl();
    const [module, constants, accountModule] = await Promise.all([
      import(locate('styles')), import(locate('db-pure')), import(accountUrl),
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
        {gifId:item.gifId,label:item.label,keywords:item.metadata?.keywords || []} : {gifId:item.gifId,label:'Sticker '+(index+1)}));
      $('#shareStatus').textContent = ui(`共 ${selected.length} 个表情${selectionOutside() ? `，其中 ${selectionOutside()} 个不在当前筛选中` : ''}。请复制完整口令；表情越多，口令越长。`, `${selected.length} stickers${selectionOutside() ? `, including ${selectionOutside()} outside the current filter` : ''}. Copy the complete code; more stickers make it longer.`);
      if (openDialog($('#sharing'))) $('#shareCopy').focus();
    } catch (error) { $('#scanStatus').textContent = tr(error.message); }
  };
  $('#shareIncludeMetadata').onchange = () => $('#shareOpen').onclick();
  $('#shareCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#shareCode').value); $('#shareStatus').textContent = tr('分享口令已复制，发给朋友即可。'); notifyAction($('#shareStatus').textContent); }
    catch (_) { $('#shareCode').focus(); $('#shareCode').select(); $('#shareStatus').textContent = tr('请按 ⌘C / Ctrl+C 复制完整口令。'); notifyAction($('#shareStatus').textContent, 'info'); }
  };
  $('#shareClose').onclick = () => closeDialog($('#sharing'));
  const hasSharedDetails = item => Array.isArray(item.keywords);
  const importDetails = item => hasSharedDetails(item) && $('#shareImportMetadata').checked;
  const canSelectImport = item => item.saved ? importDetails(item) : item.ready;
  const updateImportButton = () => {
    $('#shareImportMetadata').closest('label').hidden = !imported.some(hasSharedDetails);
    $('#shareImportMetadata').disabled = importingBusy;
    $('#importConfirm').disabled = importingBusy || importNeedsReview || !imported.some(item => item.selected && canSelectImport(item));
  };
  $('#importOpen').onclick = () => {
    if (deleting || importingBusy || scanning) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#scanStatus').textContent = tr(error.message); count(); return; }
    updateImportButton();
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
      updateImportButton();
      for (const item of imported) {
        const card = document.createElement('div'); card.className = 'import-card';
        const image = document.createElement('img'); image.alt = item.label; image.referrerPolicy = 'no-referrer';
        const label = document.createElement('label');
        const check = document.createElement('input'); check.type = 'checkbox'; check.disabled = !canSelectImport(item);
        check.setAttribute('aria-label', tr('添加 ') + item.label); item.check = check;
        const status = document.createElement('p'); status.style.fontSize = '12px';
        const savedStatus = hasSharedDetails(item) ? ui('已收藏 · 可导入名称和关键字','Already saved · Can import name and keywords') : tr('已收藏');
        status.textContent = item.saved ? savedStatus : tr('等待预览'); item.status = status;
        check.onchange = () => { item.selected = check.checked; updateImportButton(); };
        image.onload = () => {
          if (generation !== importGeneration) return;
          item.width = image.naturalWidth; item.height = image.naturalHeight;
          item.ready = item.width > 0 && item.height > 0 && item.width <= 20000 && item.height <= 20000;
          check.disabled = importingBusy || !canSelectImport(item);
          status.textContent = item.saved ? savedStatus : item.ready ? tr('预览就绪 · 可添加') : tr('图片尺寸无效');
          updateImportButton();
        };
        image.onerror = () => {
          if (generation !== importGeneration) return;
          item.ready = false; if (!item.saved) { item.selected = false; check.checked = false; } check.disabled = importingBusy || !canSelectImport(item);
          status.textContent = item.saved ? savedStatus : tr('预览不可用 · 不可添加'); updateImportButton();
        };
        label.append(check, item.label); card.append(image, label, status);
        if (hasSharedDetails(item) && personalRecords().has(savedStickerId(item.gifId) || item.gifId)) {
          const policy = document.createElement('select'); policy.setAttribute('aria-label',ui('重名处理 ','Name conflict for ')+item.label);
          policy.append(new Option(ui('保留我的名称，合并关键字','Keep my name and merge keywords'),'keep'),
            new Option(ui('使用分享名称，合并关键字','Use shared name and merge keywords'),'replace'));
          policy.disabled = !importDetails(item);
          policy.onchange = () => item.metadataPolicy = policy.value;
          item.policy = policy; card.append(policy);
        }
        $('#importPreview').append(card);
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
    for(const item of imported){
      item.check.disabled=importingBusy || !canSelectImport(item);
      if(item.check.disabled){item.selected=false;item.check.checked=false;}
      if(item.policy)item.policy.disabled=importingBusy || !importDetails(item);
    }
    updateImportButton();
  };
  $('#importConfirm').onclick = async () => {
    if (importingBusy || deleting || sendingBusy || metadataSaving || scanning || importNeedsReview) return;
    try { assertWorkspaceAccount(); } catch (error) { $('#importStatus').textContent = tr(error.message); return; }
    const selected = imported.filter(item => item.selected && canSelectImport(item));
    if (!selected.length) return;
    const generation = importGeneration;
    const metadataRevision=personalSnapshot.revision,metadataPlan=new Map();
    try{
      if(selected.some(importDetails)){
        const current=personalRecords();
        for(const item of selected.filter(importDetails)){
          const savedId=savedStickerId(item.gifId) || item.gifId;
          const shared={label:item.label,keywords:[...item.keywords]};
          const replace=item.metadataPolicy==='replace', now=new Date().toISOString();
          mergeSharedPersonalRecord(current.get(savedId),shared,savedId,replace,now);
          metadataPlan.set(item.gifId,{shared,replace,now});
        }
      }
    }catch(error){$('#importStatus').textContent=metadataMessage(error.message);return;}
    importingBusy = true; importStopped = false;
    let stopObservingRefresh=()=>{};
    for (const id of ['importCode', 'importParse', 'importSelect', 'importConfirm', 'remove', 'scan']) $('#' + id).disabled = true;
    imported.forEach(item => { item.check.disabled = true; if(item.policy)item.policy.disabled=true; });
    $('#shareImportMetadata').disabled = true;
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
        for(const [id,plan] of metadataPlan){
          const savedId=savedStickerId(id);
          if(!savedId)continue;
          records.set(savedId,mergeSharedPersonalRecord(records.get(savedId),plan.shared,savedId,plan.replace,plan.now));
          notes++;
        }
        if(notes)await savePersonalRows([...records.values()]);
      }
      const details = notes ? ui('已导入 ' + notes + ' 张表情的名称和关键字。', 'Imported names and keywords for ' + notes + (notes === 1 ? ' sticker. ' : ' stickers. ')) : '';
      $('#importStatus').textContent = details + ui(`页面收藏已观察到添加 ${result.added} 个，跳过 ${result.skipped} 个${result.stopped ? '，已停止后续添加' : ''}。请刷新 SeaTalk 核对保存结果。`, `Addition observed for ${result.added} stickers; ${result.skipped} skipped.${result.stopped ? ' Later additions stopped.' : ''} Reload SeaTalk to check saved results.`); notifyAction($('#importStatus').textContent, result.stopped ? 'info' : 'success');
    } catch (error) { importNeedsReview = true; $('#importStatus').textContent = error.message.startsWith('METADATA_') ? metadataMessage(error.message) : tr(error.message); notifyAction($('#importStatus').textContent, 'error'); }
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
          else {
            const native = ownList().find(entry => entry.id === canonicalId || entry.url === canonicalId);
            const number = items.length+1, providedName = known.get(canonicalId) || native?.name;
            const generatedName = providedName ? null : ui('收藏 '+number,'Favorite '+number);
            const originalLabel = String(providedName || generatedName).slice(0,80);
            items.push({gifId:canonicalId,label:originalLabel,originalLabel,generatedName,number,url:validPreviewUrl(importServices.fileUrl,canonicalId),existing:known.has(canonicalId),selected:false,animation:'unknown'});
          }
        }
        item.check.disabled = !canSelectImport(item);
        if(item.policy)item.policy.disabled=!importDetails(item);
      }
      refreshPersonalLabels(); updateImportButton(); render();
    }
  };
  host.addEventListener('keydown', event => {
    if (event.altKey && event.shiftKey && event.code === 'KeyJ') {
      event.preventDefault(); $('#hiddenTools').hidden = !$('#hiddenTools').hidden;
    }
  });

  let favoritesSyncTimer = null, favoritesSyncServices = null;
  function stopFavoritesSync() {
    if (favoritesSyncTimer !== null) clearInterval(favoritesSyncTimer);
    favoritesSyncTimer = null;
  }
  function startFavoritesSync() {
    if (favoritesSyncTimer !== null) return;
    favoritesSyncTimer = setInterval(() => {
      if (!host.isConnected) { dismissActionNotice(); stopFavoritesSync(); return; }
      syncFavorites();
    }, 1500);
  }
  function syncFavorites(manual = false) {
    if (!host.isConnected || host.dataset.open !== 'true' || document.hidden) return;
    if (busy() || scanning || rubberBand || root.querySelector('dialog[open]') || workspaceAccountState !== 'ready') {
      if (manual) notifyAction(ui('暂不能同步：请等待当前操作完成、关闭弹窗，并确认账号已就绪。','Sync unavailable. Wait for the current operation, close dialogs and check account readiness.'), 'info');
      return;
    }
    try { assertWorkspaceAccount(); }
    catch (_) {
      workspaceAccountState = 'failed'; stopFavoritesSync(); count();
      $('#syncStatus').textContent = ui('账号已变化，自动同步已停止。请刷新网页后重新打开。', 'Account changed. Sync stopped. Reload the page and reopen the helper.');
      if (!favoritesRead) renderEmpty();
      if (manual) notifyAction($('#syncStatus').textContent, 'error');
      return;
    }
    let latest;
    try {
      const stored = favoritesSyncServices?.store.getState()?.messages?.customStickers;
      if (Array.isArray(stored) && (stored.length || favoritesRead)) {
        latest = stored.map(entry => {
          const id = [entry.id, entry.url].find(value => validMetadataId(value));
          if (!id) throw Error('UNREADABLE_FAVORITE');
          return { id, name: entry.name, url: validPreviewUrl(favoritesSyncServices.fileUrl, id) };
        });
      } else latest = liveSource(false).list;
    }
    catch (_) {
      $('#syncStatus').textContent = ui('暂时无法读取收藏，已保留当前列表。可打开爱心收藏面板后点击同步收藏。', 'Favorites are temporarily unavailable. List kept; open SeaTalk’s Favorites tab and choose Sync favorites.');
      if (!favoritesRead) renderEmpty();
      if (manual) notifyAction($('#syncStatus').textContent, 'error');
      return;
    }
    const current = new Map(items.filter(item => !item.deleted).map(item => [item.gifId, item]));
    const next = [], ids = new Set();
    for (const entry of latest) {
      if (typeof entry.id !== 'string' || !/^[a-zA-Z0-9]{32,}$/.test(entry.id) || ids.has(entry.id)) continue;
      let url;
      try { url = new URL(entry.url); } catch (_) { continue; }
      if (!isFavoritePreviewUrl(url, entry.id)) continue;
      ids.add(entry.id);
      const number = next.length + 1, providedName = known.get(entry.id) || entry.name;
      let item = current.get(entry.id);
      if (!item) {
        const generatedName = providedName ? null : ui(`收藏 ${number}`, `Favorite ${number}`);
        item = { gifId: entry.id, url: url.href, label: String(providedName || generatedName).slice(0,80), originalLabel: String(providedName || generatedName).slice(0,80), number, generatedName, existing: known.has(entry.id), selected: false, animation: 'unknown' };
      }
      next.push({ item, url: url.href, number });
    }
    // Never replace the workspace with a partially validated native collection.
    if (ids.size !== new Set(latest.map(entry => entry.id)).size) {
      $('#syncStatus').textContent = ui('部分收藏数据暂不可读，已保留当前列表。稍后重试同步。', 'Some favorites are unreadable. Current list kept; sync will retry.');
      if (!favoritesRead) renderEmpty();
      if (manual) notifyAction($('#syncStatus').textContent, 'error');
      return;
    }
    const firstRead = !favoritesRead; favoritesRead = true;
    const active = activeItems();
    const changed = active.length !== next.length || next.some((row,index) => active[index] !== row.item || row.item.url !== row.url);
    if (changed) {
      const added = next.filter(row => !current.has(row.item.gifId)).length;
      const removed = active.filter(item => !ids.has(item.gifId)).length;
      for (const old of items) if (!ids.has(old.gifId)) { old.deleted = true; old.selected = false; }
      items.splice(0, items.length, ...next.map(({item,url,number}) => { item.url = url; item.number = number; return item; }));
      refreshPersonalLabels();
      $('#syncStatus').textContent = ui(`收藏已同步：新增 ${added} 个，移除 ${removed} 个。`, `Favorites synced: ${added} added, ${removed} removed.`);
    } else if (manual || !$('#syncStatus').textContent.includes(ui('收藏已同步', 'Favorites synced'))) {
      $('#syncStatus').textContent = ui('收藏已同步，无新增或移除。', 'Favorites synced. No additions or removals.');
    }
    if (firstRead && !changed) renderEmpty();
    if (manual) notifyAction($('#syncStatus').textContent);
  }
  $('#syncFavorites').onclick = () => syncFavorites(true);
  const workspaceReady = discoverShareServices().then(async services => {
    if (mountedAtOpen) {
      workspaceAccountCheck = createWorkspaceAccountGuard(services, source, () => liveSource(false).list);
    } else {
      // No collection was read yet. Bind to the account before reading its native store.
      const account = nativeWorkspaceAccountId(services);
      if (!account) throw Error('METADATA_ACCOUNT_CHANGED');
      workspaceAccountCheck = () => {
        if (nativeWorkspaceAccountId(services) !== account) throw Error('METADATA_ACCOUNT_CHANGED');
        return account;
      };
    }
    favoritesSyncServices = services; workspaceAccountState = 'ready'; await loadPersonalSettings(services); count(); startFavoritesSync(); syncFavorites();
  }).catch(() => {
    workspaceAccountState = 'failed';
    $('#scanStatus').textContent = tr('无法核对当前账号，添加和删除已停用。请刷新 SeaTalk 后重新打开。'); count(); renderEmpty();
  });
  render();
  if (entry === 'quick') void openQuickPicker();
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

/* Mount beside the native sticker control only while a conversation has a composer. */
function installQuickPickerToolbar(onOpen, getLocale) {
  const toolbarSelector = ':scope > .toolbar > .toolbar-left';
  const buttonId = 'spga-quick-toggle';
  const button = document.createElement('button');
  button.type = 'button';
  button.id = buttonId;
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-expanded', 'false');
  button.style.cssText = 'display:inline-grid;place-items:center;flex:none;width:32px;height:32px;padding:0;margin:0 2px;border:0;border-radius:6px;color:#426182;background:transparent;cursor:pointer;vertical-align:middle';
  button.innerHTML = '<svg aria-hidden="true" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="M13.8 21H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v6.8L13.8 21Z"/><path d="M14 21v-4a3 3 0 0 1 3-3h4M7.8 12.2a4.4 4.4 0 0 0 6.9.5"/><circle cx="8.5" cy="8.2" r=".7"/><circle cx="14" cy="8.2" r=".7"/></svg>';
  const title = () => getLocale() === 'en' ? 'Quick stickers' : '表情快选';
  const homeCopy = () => getLocale() === 'en'
    ? 'Sticker Helper loaded · Find this icon beside the chat input'
    : '表情助手已加载 · 入口在聊天输入框旁';
  const homeSelector = '#root .home-main-window';
  const chatTitleSelector = '.messages-message-detail-view-header .title-wrap > .title';
  const homeHintKey = 'spga:quick-picker:home-hint-seen';
  function readHomeHintSeen() {
    try { return GM_getValue(homeHintKey, false) === true; } catch (_) { return false; }
  }
  function updateLocale() {
    button.title = title();
    button.setAttribute('aria-label', title());
    if (tip?.isConnected) tip.lastChild.textContent = tip.dataset.hint === 'home' ? homeCopy() : title();
  }
  let tip = null, tipTimer = 0, tipShown = false, pending = false;
  let homeTimer = 0, homeHintSeen = readHomeHintSeen();
  function removeTip() {
    clearTimeout(tipTimer);
    tip?.remove();
    tip = null;
  }
  function showTip(kind, position, duration) {
    removeTip();
    tip = document.createElement('span');
    tip.dataset.hint = kind;
    tip.setAttribute('role', 'status');
    if (kind === 'home') {
      const icon = button.firstElementChild.cloneNode(true);
      icon.style.flex = 'none';
      tip.append(icon);
    }
    tip.append(document.createTextNode(kind === 'home' ? homeCopy() : title()));
    tip.style.cssText = 'position:fixed;z-index:2147483645;pointer-events:none;padding:6px 10px;border-radius:7px;background:#24364d;color:white;font:13px/1.4 system-ui,sans-serif;box-shadow:0 3px 12px #17203322;' + position;
    document.body.append(tip);
    tipTimer = setTimeout(removeTip, duration);
  }
  function onScreen(node) {
    if (!node || (node.checkVisibility && !node.checkVisibility({opacityProperty:true,visibilityProperty:true}))) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth;
  }
  function clearHomeTimer() { clearTimeout(homeTimer); homeTimer = 0; }
  function isIdleHome(home) {
    return !document.hidden && !tipShown && onScreen(home) &&
      ![...home.querySelectorAll('.messages-message-editor,' + chatTitleSelector)].some(onScreen);
  }
  function updateHomeTip(home) {
    if (!isIdleHome(home)) {
      clearHomeTimer();
      if (tip?.dataset.hint === 'home') removeTip();
    } else if (!homeHintSeen && !homeTimer) {
      // Give a conversation restored on startup time to mount before offering a home hint.
      homeTimer = setTimeout(() => {
        homeTimer = 0;
        if (!isIdleHome(document.querySelector(homeSelector))) return;
        homeHintSeen = true;
        if (readHomeHintSeen()) return;
        showTip('home','display:flex;align-items:center;gap:8px;left:50%;bottom:max(18px,env(safe-area-inset-bottom));transform:translateX(-50%);width:max-content;max-width:calc(100vw - 28px);box-sizing:border-box;',4000);
        try { GM_setValue(homeHintKey, true); } catch (_) { /* This document still shows the hint only once. */ }
      }, 550);
    }
  }
  const sizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const observed = new Set();
  function mount() {
    pending = false;
    const composers = [...document.querySelectorAll('.messages-message-editor')];
    const toolbars = composers.map(editor => editor.querySelector(toolbarSelector)).filter(Boolean);
    const home = !homeHintSeen || tip?.dataset.hint === 'home' ? document.querySelector(homeSelector) : null;
    const sizeTargets = home ? [...toolbars, home] : toolbars;
    for (const item of observed) if (!sizeTargets.includes(item)) { sizeObserver?.unobserve(item); observed.delete(item); }
    for (const item of sizeTargets) if (!observed.has(item)) { sizeObserver?.observe(item); observed.add(item); }
    const visible = toolbars.filter(item => item.getClientRects().length);
    const toolbar = visible.length === 1 ? visible[0] : null;
    if (!toolbar || !toolbar.getClientRects().length) {
      if (button.isConnected) button.remove();
      if (tip?.dataset.hint === 'toolbar') removeTip();
      updateHomeTip(home);
      return;
    }
    clearHomeTimer();
    if (tip?.dataset.hint === 'home' || document.hidden) removeTip();
    if (button.parentElement !== toolbar) {
      const native = toolbar.querySelector(':scope > .icon-container');
      if (native) native.after(button);
      else toolbar.prepend(button);
    }
    if (tipShown || document.hidden || !onScreen(button)) return;
    const rect = button.getBoundingClientRect();
    tipShown = true;
    const left = Math.max(4, Math.min(innerWidth - 108, rect.left)), top = Math.max(4, rect.top - 35);
    showTip('toolbar','white-space:nowrap;left:' + left + 'px;top:' + top + 'px;',3000);
  }
  function schedule() { if (!pending) { pending = true; queueMicrotask(mount); } }
  button.addEventListener('click', event => {
    event.stopPropagation();
    tipShown = true;
    removeTip();
    onOpen();
  });
  updateLocale();
  window.addEventListener('spga:locale-change', updateLocale);
  window.addEventListener('resize', schedule);
  document.addEventListener('visibilitychange', schedule);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && tip) removeTip(); });
  // Reconcile native view mounts without polling or inspecting messages.
  const editorParts = '.home-main-window,.messages-message-editor,.messages-message-detail-view-header,.toolbar,.toolbar-left';
  const hasEditorPart = node => node === button || node.nodeType === 1 && (node.matches(editorParts) || !!node.querySelector(editorParts));
  new MutationObserver(records => {
    if (records.some(record => record.target === button.parentNode || [...record.addedNodes, ...record.removedNodes].some(hasEditorPart))) schedule();
  }).observe(document.body, {childList:true, subtree:true});
  // Also covers a mounted toolbar becoming visible without a child-list mutation.
  if (typeof IntersectionObserver === 'function') {
    const canTrackVisibility = typeof IntersectionObserverEntry !== 'undefined' && 'isVisible' in IntersectionObserverEntry.prototype;
    const visibility = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) schedule();
    }, canTrackVisibility ? {trackVisibility:true, delay:100} : {});
    visibility.observe(button);
  }
  mount();
}

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

async function discoverPersonalSettingsAccount() {
function getFavoritesAccountModuleUrl() {
  const html = document.documentElement;
  const currentBuild = html.getAttribute('data-web-semantic-version') === '3.72.0' &&
    html.getAttribute('data-release-hash') === 'cba35692d';
  const cdn = 'https://static.cdn.haiserve.com/seatalk/fe/static/js/';
  const family = currentBuild ? /^chunk-db-pure-[\w-]+\.js$/ : /^chunk-src-[\w-]+\.js$/;
  const urls = new Set();
  for (const tag of document.head.querySelectorAll('link[rel~="modulepreload"][href],script[type="module"][src]')) {
    const href = tag.href || tag.src;
    if (href.startsWith(cdn) && family.test(href.slice(cdn.length)) && href !== cdn + 'chunk-src-DcOtnrHP.js') urls.add(href);
  }
  if (urls.size !== 1) throw Error('METADATA_ACCOUNT_CHANGED');
  return [...urls][0];
}

  const module = await import(getFavoritesAccountModuleUrl());
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
      const key = 'seatalk-personal-sticker-settings-v1:' + request.account;
      const deadline = Date.now() + 5000;
      const transact = async () => {
        // Verify the live account inside the lock, immediately before reading the account's storage.
        const currentAccount = await unsafeWindow.Function(`return (${discoverPersonalSettingsAccount.toString()})();`)();
        if (currentAccount !== request.account) throw Error('METADATA_ACCOUNT_CHANGED');
        if (Date.now() >= deadline) throw Error('METADATA_SAVE_FAILED');
        const current = validateSettingsSnapshot(GM_getValue(key,{schema:1,revision:0,items:[]}));
        if (request.kind === 'load') return current;
        if (current.revision !== request.revision) throw Error('METADATA_CHANGED');
        const updated = validateSettingsSnapshot({schema:2,revision:current.revision+1,items:request.items,
          groups:request.groups === undefined ? current.groups : request.groups});
        GM_setValue(key,updated);
        return updated;
      };
      const locks = globalThis.navigator?.locks;
      const result = request.kind === 'save' && locks ? await locks.request(key,{ifAvailable:true},lock=>{
        if (!lock) throw Error('METADATA_CHANGED');
        return transact();
      }) : await transact();
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
    if (document.getElementById(PANEL_ID)?.classList.contains("spga-open") || !state.avatarUnlocked) renderPanel();
    window.dispatchEvent(new CustomEvent("spga:locale-change", {detail:locale}));
  }
  if (typeof window !== "undefined") window.addEventListener("spga:locale-request", event => setHelperLocale(event.detail));
  function startHelperLayout() {
    try {
      if (typeof unsafeWindow !== "undefined" && typeof unsafeWindow.Function === "function") {
        unsafeWindow.Function(`return (${installHelperLayout.toString()})();`)();
      }
    } catch (_) { /* Keep the ordinary floating helper if layout setup is unavailable. */ }
  }
  function init() {
    window.visualViewport?.addEventListener("resize", positionPanelNearToggle);
    window.visualViewport?.addEventListener("scroll", positionPanelNearToggle);
    window.addEventListener('spga:collections-back', () => {
      if (!state.avatarUnlocked) return;
      document.getElementById(PANEL_ID)?.classList.add('spga-open');
      renderPanel();
      positionPanelNearToggle();
    });
    readSavedState();
    injectStyles();
    createPanel({ renderContents: false });
    let activated = false;
    installQuickPickerToolbar(() => {
      if (!activated) {
        installPersonalSettingsBridge();
        startHelperLayout();
        bindPanelEvents();
        activated = true;
      }
      openCollectionsWorkspace('quick');
    }, () => state.locale);
  }

  // 仅供本地自动测试读取纯解析函数。正常安装时没有这个标记，不会暴露任何接口。
  if (globalThis.__SPGA_TEST_MODE__ === true) {
    globalThis.__SPGA_TEST_API__ = {
      installHelperLayout, launchFavoritesGallery, openCollectionsWorkspace, init, groupUI, bindGroupStatus, confirmGroupAvatar, bindPanelEvents, injectStyles,
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
      startAvatarCheck,
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
