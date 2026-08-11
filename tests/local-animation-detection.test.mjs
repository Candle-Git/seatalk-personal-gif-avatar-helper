import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

// 本测试只使用人工构造的极小图片结构，不连接 SeaTalk，也不包含任何真实聊天地址、账号或签名参数。
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const scriptPath = path.join(projectDirectory, "SeaTalk-Personal-GIF-Avatar-Helper.user.js");
const source = fs.readFileSync(scriptPath, "utf8");

// 用测试标记执行脚本时，脚本只公开纯图片解析函数，然后立即停止初始化界面和网络功能。
const context = {
  __SPGA_TEST_MODE__: true,
  navigator: { language: "zh-CN" },
  location: { href: "https://seatalkweb.com/" },
  URL,
  Uint8Array,
  ArrayBuffer,
  DataView,
  Map,
};
context.globalThis = context;
vm.runInNewContext(source, context, { filename: scriptPath });

const {
  detectAnimationFromBytes,
  sortRecentCandidates,
  isStickerPickerContextText,
  shouldShowUpdateNotice,
} = context.__SPGA_TEST_API__;
assert.equal(typeof detectAnimationFromBytes, "function", "正式版应公开动图解析函数给本地测试");
assert.equal(typeof sortRecentCandidates, "function", "正式版应公开候选排序函数给本地测试");
assert.equal(typeof isStickerPickerContextText, "function", "正式版应公开表态区域判断函数给本地测试");
assert.equal(typeof shouldShowUpdateNotice, "function", "正式版应公开更新提示判断函数给本地测试");

function ascii(text) {
  return Array.from(text, (character) => character.charCodeAt(0));
}

function uint32BigEndian(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function uint32LittleEndian(value) {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

// 构造结构完整的 1×1 GIF。解析器只关心规范中的块边界与图像描述符数量。
function makeGif(frameCount) {
  const headerAndScreen = [
    ...ascii("GIF89a"),
    0x01, 0x00, 0x01, 0x00, // 画布宽高均为 1
    0x80, 0x00, 0x00, // 使用含 2 种颜色的全局颜色表
    0x00, 0x00, 0x00,
    0xff, 0xff, 0xff,
  ];
  const frame = [
    0x21, 0xf9, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, // 图形控制扩展
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // 图像描述符
    0x02, 0x02, 0x44, 0x01, 0x00, // 最小 LZW 数据块
  ];

  return new Uint8Array([
    ...headerAndScreen,
    ...Array.from({ length: frameCount }, () => frame).flat(),
    0x3b,
  ]);
}

function makePng(animationFrameCount = 0) {
  const signature = [0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a];
  const chunks = [];
  if (animationFrameCount > 0) {
    chunks.push(
      ...uint32BigEndian(8),
      ...ascii("acTL"),
      ...uint32BigEndian(animationFrameCount),
      ...uint32BigEndian(0),
      0x00, 0x00, 0x00, 0x00 // 测试中不校验 CRC
    );
  }
  chunks.push(...uint32BigEndian(0), ...ascii("IEND"), 0x00, 0x00, 0x00, 0x00);
  return new Uint8Array([...signature, ...chunks]);
}

function makeWebp(animationFrameCount) {
  const chunks = [];
  if (animationFrameCount > 0) {
    const animationData = new Array(6).fill(0);
    chunks.push(...ascii("ANIM"), ...uint32LittleEndian(animationData.length), ...animationData);
    for (let index = 0; index < animationFrameCount; index += 1) {
      const frameData = new Array(16).fill(0);
      chunks.push(...ascii("ANMF"), ...uint32LittleEndian(frameData.length), ...frameData);
    }
  }
  return new Uint8Array([
    ...ascii("RIFF"),
    ...uint32LittleEndian(4 + chunks.length),
    ...ascii("WEBP"),
    ...chunks,
  ]);
}

const oneFrameGif = detectAnimationFromBytes(makeGif(1));
assert.deepEqual(
  { verified: oneFrameGif.verified, animated: oneFrameGif.animated, format: oneFrameGif.format, frameCount: oneFrameGif.frameCount },
  { verified: true, animated: false, format: "gif", frameCount: 1 },
  "单帧 GIF 必须被识别为静态图片"
);

const twoFrameGif = detectAnimationFromBytes(makeGif(2));
assert.equal(twoFrameGif.verified, true, "双帧 GIF 应能完成验证");
assert.equal(twoFrameGif.animated, true, "双帧 GIF 必须被识别为动图");
assert.equal(twoFrameGif.frameCount, 2, "双帧 GIF 应检测到至少 2 帧");

assert.equal(detectAnimationFromBytes(makePng(0)).animated, false, "普通 PNG 不能被当成动图");
assert.equal(detectAnimationFromBytes(makePng(2)).animated, true, "双帧 APNG 应被识别为动图");
assert.equal(detectAnimationFromBytes(makeWebp(1)).animated, false, "单帧 WebP 不能被当成动图");
assert.equal(detectAnimationFromBytes(makeWebp(2)).animated, true, "双帧 WebP 应被识别为动图");

const invalidFile = detectAnimationFromBytes(new Uint8Array([0x01, 0x02, 0x03]));
assert.equal(invalidFile.verified, false, "无法识别的文件必须保守地标记为未验证");
assert.equal(invalidFile.animated, false, "无法识别的文件不能进入动图候选列表");

// 回归截图中暴露的问题：旧逻辑会让尺寸更大的旧图挤掉位置更靠下的新图。
const sortedCandidates = sortRecentCandidates([
  { key: "older-large", bottom: 300, index: 10, score: 999999 },
  { key: "newer-small", bottom: 500, index: 20, score: 1 },
  { key: "same-row-later", bottom: 500, index: 21, score: 0 },
]);
assert.deepEqual(
  Array.from(sortedCandidates, (candidate) => candidate.key),
  ["same-row-later", "newer-small", "older-large"],
  "候选必须按聊天位置和 DOM 先后排序，不能按图片大小分数排序"
);

// 正常 GIF 消息可以带已有表态统计；只有真正的选择弹窗才应排除。
assert.equal(
  isStickerPickerContextText("message-list-item image-content has-reaction reaction-summary"),
  false,
  "带已有 Reaction 统计的正常消息不能被误判为表态选择弹窗"
);
assert.equal(
  isStickerPickerContextText("message-list-item emoji-content"),
  false,
  "正常聊天中的 emoji-content 不能被误判为表情选择面板"
);
assert.equal(
  isStickerPickerContextText("message-list-item emoticon-content"),
  false,
  "正常聊天中的 emoticon-content 不能被误判为表情选择面板"
);
assert.equal(
  isStickerPickerContextText("reaction-picker popover"),
  true,
  "真正的 Reaction 选择弹窗仍必须排除"
);
assert.equal(isStickerPickerContextText("emoji-picker"), true, "表情选择器仍必须排除");
assert.equal(isStickerPickerContextText("emoticon-panel"), true, "表情面板仍必须排除");

assert.equal(shouldShowUpdateNotice(""), true, "首次安装时应显示更新提示");
assert.equal(shouldShowUpdateNotice("3.0.3-beta.9"), true, "从旧测试版升级后应显示正式版更新提示");
assert.equal(shouldShowUpdateNotice("3.0.3"), false, "当前正式版本已读后不应重复显示更新提示");

assert.match(source, /@grant\s+GM_xmlhttpRequest/, "正式版应声明跨域读取权限");
assert.match(source, /@connect\s+f\.haiserve\.com/, "跨域权限必须只连接 SeaTalk 图片域名");
assert.match(source, /Accept:\s*"image\/gif,image\/webp,image\/apng,image\/\*,\*\/\*;q=0\.8"/, "读取候选时应明确请求完整动图格式");
assert.doesNotMatch(source, /anonymous:\s*true/, "读取 SeaTalk 图片时不能丢失浏览器现有会话");
assert.match(source, /checkedCandidateCount/, "面板应单独显示进入动图验证的候选数量");
assert.match(source, /animatedCandidateCount/, "面板应区分动图总数与最多 3 个展示结果");
assert.match(source, /@version\s+3\.0\.3/, "正式版版本号应为 3.0.3");
assert.match(source, /SCRIPT_VERSION\s*=\s*"3\.0\.3"/, "界面版本常量必须与脚本版本一致");
assert.match(source, /UPDATE_NOTICE_VERSION\s*=\s*SCRIPT_VERSION/, "弹窗记录版本必须复用界面版本常量");
assert.match(source, /className:\s*"spga-version-badge"/, "助手底部应显示可识别的版本号标签");
assert.match(source, /textContent:\s*`v\$\{SCRIPT_VERSION\}`/, "版本号标签必须读取统一版本常量");
assert.match(source, /lastSeenUpdateNoticeVersion/, "脚本应保存用户已经看过的更新提示版本");
assert.match(source, /createPanel\(\);\s*showUpdateNoticeIfNeeded\(\);/, "脚本启动时应在创建面板后检查更新提示");
assert.doesNotMatch(
  source,
  /https:\/\/f\.haiserve\.com\/download\/[a-zA-Z0-9_/-]+\?(?:userid|token)=/i,
  "代码和测试中不能写入带真实签名参数的完整图片地址"
);

console.log("本地动图检测检查通过：单帧被过滤，多帧 GIF/WebP/APNG 被接受，未知文件安全拒绝。");
