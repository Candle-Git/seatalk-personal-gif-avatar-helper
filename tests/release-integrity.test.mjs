import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 这项发布检查只读取仓库里的公开文件，不连接 SeaTalk、GitHub 或 Greasy Fork。
// 它用于防止版本号、横幅链接、中英文说明和隐私边界在发布时漏改。
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const releaseVersion = "3.0.3";

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(projectDirectory, relativePath), "utf8");
}

const script = readProjectFile("SeaTalk-Personal-GIF-Avatar-Helper.user.js");
const readmeZh = readProjectFile("README.md");
const readmeEn = readProjectFile("README.en.md");
const changelog = readProjectFile("CHANGELOG.md");
const greasyForkZh = readProjectFile("docs/greasyfork-description.zh-CN.md");
const greasyForkEn = readProjectFile("docs/greasyfork-description.en.md");

assert.match(script, new RegExp(`@version\\s+${releaseVersion.replaceAll(".", "\\.")}`), "脚本头部版本号未同步");
assert.match(script, new RegExp(`SCRIPT_VERSION\\s*=\\s*"${releaseVersion.replaceAll(".", "\\.")}"`), "界面版本号未同步");
assert.match(script, /@author\s+Yixin\.Zhong × Codex/, "正式版制作署名不正确");
assert.match(script, /textContent:\s*`v\$\{SCRIPT_VERSION\}`/, "助手底部没有读取统一版本号");
assert.match(script, /credit:\s*"Yixin\.Zhong × Codex 制作"/, "中文版制作署名不正确");
assert.match(script, /credit:\s*"Made by Yixin\.Zhong × Codex"/, "英文版制作署名没有完成本地化");

for (const [name, content] of [
  ["中文 README", readmeZh],
  ["英文 README", readmeEn],
  ["中文 Greasy Fork 说明", greasyForkZh],
  ["英文 Greasy Fork 说明", greasyForkEn],
]) {
  assert.match(content, new RegExp(releaseVersion.replaceAll(".", "\\.")), `${name} 没有写入当前版本`);
}

assert.match(changelog, /## 3\.0\.3 - 2026-08-12/, "更新日志缺少 3.0.3 正式发布日期");

const bannerZh = "docs/images/seatalk-gif-avatar-helper-banner.dark.png";
const bannerEn = "docs/images/seatalk-gif-avatar-helper-banner.dark.en.png";
assert.match(readmeZh, new RegExp(bannerZh.replaceAll(".", "\\.")), "中文 README 没有引用无版本横幅");
assert.match(readmeEn, new RegExp(bannerEn.replaceAll(".", "\\.")), "英文 README 没有引用无版本横幅");
assert.ok(fs.statSync(path.join(projectDirectory, bannerZh)).size > 100_000, "中文无版本横幅不存在或文件异常");
assert.ok(fs.statSync(path.join(projectDirectory, bannerEn)).size > 100_000, "英文无版本横幅不存在或文件异常");

// 公开横幅不能夹带本机路径、邮箱、带签名图片参数或聊天图片域名。
for (const bannerPath of [bannerZh, bannerEn]) {
  const bannerBytes = fs.readFileSync(path.join(projectDirectory, bannerPath));
  const searchableBannerText = bannerBytes.toString("utf8");
  assert.doesNotMatch(searchableBannerText, /C:\\Users\\|candl/i, `${bannerPath} 包含本机路径信息`);
  assert.doesNotMatch(searchableBannerText, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, `${bannerPath} 包含邮箱格式信息`);
  assert.doesNotMatch(searchableBannerText, /userid=[0-9]+|token=[a-f0-9]{16,}/i, `${bannerPath} 包含带签名图片参数`);
  assert.doesNotMatch(searchableBannerText, /f\.haiserve\.com\/download\//i, `${bannerPath} 包含聊天图片地址`);
}

for (const [name, content] of [
  ["中文 README", readmeZh],
  ["英文 README", readmeEn],
  ["中文 Greasy Fork 说明", greasyForkZh],
  ["英文 Greasy Fork 说明", greasyForkEn],
]) {
  assert.doesNotMatch(content, /banner-v\d/i, `${name} 仍引用带版本号的横幅`);
}

// 正式公开材料不能包含带账号编号或临时签名参数的真实图片地址。
const signedImagePattern = /https:\/\/f\.haiserve\.com\/download\/[^\s)"']+\?(?:[^\s)"']*&)?(?:userid|token)=/i;
for (const [name, content] of [
  ["正式脚本", script],
  ["中文 README", readmeZh],
  ["英文 README", readmeEn],
  ["更新日志", changelog],
  ["中文 Greasy Fork 说明", greasyForkZh],
  ["英文 Greasy Fork 说明", greasyForkEn],
]) {
  assert.doesNotMatch(content, signedImagePattern, `${name} 包含不应公开的带签名图片地址`);
}

const connectHosts = Array.from(script.matchAll(/^\/\/ @connect\s+([^\s]+)$/gm), (match) => match[1]);
assert.deepEqual(connectHosts, ["f.haiserve.com"], "跨域读取权限必须只允许 SeaTalk 图片域名");

console.log("3.0.3 发布完整性检查通过：版本、双语文档、无版本横幅和隐私边界均已同步。");
