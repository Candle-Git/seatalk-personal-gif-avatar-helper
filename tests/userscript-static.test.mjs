import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 这个轻量测试不连接 SeaTalk，也不会读取任何聊天内容。
// 它只检查最容易在维护时写错的资源类型位置、版本号和等待时间。
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const scriptPath = path.join(projectDirectory, "SeaTalk-Personal-GIF-Avatar-Helper.user.js");
const source = fs.readFileSync(scriptPath, "utf8");

const legacyStickerId = "77db1154ce5639bf4ef946b0296c75da0b070100000f995617737056080110e5";
const customStickerId = "77db1154ce5639bf4ef946b0296c75da0b070500000f995617737056080110e5";
const regularImageId = "a36624616c215a324f50ebb94502c0f20b0101000002f66b4ca85c1208011178542276942458";

assert.equal(legacyStickerId.slice(33, 38), "b0701", "兼容 GIF 表情的类型码位置发生变化");
assert.equal(customStickerId.slice(33, 38), "b0705", "自定义 GIF 表情的类型码位置发生变化");
assert.equal(regularImageId.slice(33, 38), "b0101", "普通图片的测试资源类型不正确");
assert.match(source, /@version\s+3\.0\.3/, "脚本版本应为 3.0.3");
assert.match(source, /resourceType === "b0701" \|\| resourceType === "b0705"/, "脚本必须兼容两类 GIF 表情资源");
assert.match(source, /detectAnimationFromBytes/, "候选资源必须继续执行真实动图帧数检测");
assert.match(source, /waitForEsmUpdater\(timeoutMs = 5000\)/, "首次加载等待时间应为 5 秒");
assert.doesNotMatch(source, /waitForEsmUpdater\(timeoutMs = 12000\)/, "不应恢复为 12 秒等待");

console.log("3.0.3 静态检查通过：GIF 类型、真实动图验证、版本号和 5 秒等待均正确。");
