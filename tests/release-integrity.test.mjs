import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

// 这项发布检查只读取仓库里的公开文件，不连接 SeaTalk、GitHub 或 Greasy Fork。
// 它用于防止版本号、横幅链接、中英文说明和隐私边界在发布时漏改。
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(testDirectory, "..");
const releaseVersion = "5.3.1";

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
assert.match(script, /^\/\/ @name\s+SeaTalk 表情助手$/m);
const metadata = new Map([...script.matchAll(/^\/\/ @([\w:-]+)\s+(.+)$/gm)].map(([, key, value]) => [key, value.trim()]));
assert.equal(metadata.get("version"), releaseVersion);
assert.equal(metadata.get("namespace"), "https://seatalkweb.com/");
assert.equal(metadata.get("name:zh-CN"), "SeaTalk 表情助手 · v" + releaseVersion);
assert.equal(metadata.get("name:en"), "SeaTalk Sticker Helper · v" + releaseVersion);
assert.match(script, /^\/\/ @updateURL\s+https:\/\/update\.greasyfork\.org\/scripts\/588931\/.+\.meta\.js$/m);
assert.match(script, /^\/\/ @downloadURL\s+https:\/\/update\.greasyfork\.org\/scripts\/588931\/.+\.user\.js$/m);
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

assert.match(changelog, /^## 5\.3\.1(?: |$)/m, "更新日志缺少 5.3.1 变更");

const bannerZh = "docs/images/seatalk-sticker-helper-banner.zh.svg";
const bannerEn = "docs/images/seatalk-sticker-helper-banner.en.svg";
function visibleCopy(text) {
  return text.replace(/\]\([^)]*\)/g, "]").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}
const docs = fs.readdirSync(path.join(projectDirectory, "docs")).filter(name => /\.(md|html)$/.test(name));
for (const file of ["CHANGELOG.md", ...docs.map(name => "docs/" + name)]) {
  assert.doesNotMatch(visibleCopy(readProjectFile(file)), /头像|avatars?\b|profile (?:picture|photo)|彩蛋|easter[ -]eggs?/i, file);
}
assert.match(readmeZh, new RegExp(bannerZh.replaceAll(".", "\\.")), "中文 README 没有引用无版本横幅");
assert.match(readmeEn, new RegExp(bannerEn.replaceAll(".", "\\.")), "英文 README 没有引用无版本横幅");
assert.ok(fs.statSync(path.join(projectDirectory, bannerZh)).size > 500, "中文无版本横幅不存在或文件异常");
assert.ok(fs.statSync(path.join(projectDirectory, bannerEn)).size > 500, "英文无版本横幅不存在或文件异常");

// Inspect authored PNG metadata, not compressed image bytes or C2PA certificates.
// Arbitrary binary pixel data can coincidentally resemble an email address.
function bannerMetadataText(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    const values = [];
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
      assert.ok(end <= bytes.length, "PNG chunk is truncated");
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      const data = bytes.subarray(offset + 8, end - 4);
      if (type === "tEXt" || type === "eXIf") values.push(data.toString("utf8"));
      if (type === "zTXt") {
        const split = data.indexOf(0);
        assert.ok(split >= 0 && data[split + 1] === 0, "Invalid zTXt");
        values.push(inflateSync(data.subarray(split + 2), {maxOutputLength: 1024 * 1024}).toString("utf8"));
      }
      if (type === "iTXt") {
        const split = data.indexOf(0), compressed = data[split + 1];
        assert.ok(split >= 0 && [0,1].includes(compressed) && data[split + 2] === 0, "Invalid iTXt");
        const languageEnd = data.indexOf(0, split + 3), translatedEnd = data.indexOf(0, languageEnd + 1);
        assert.ok(languageEnd >= 0 && translatedEnd >= 0, "Invalid iTXt fields");
        const text = data.subarray(translatedEnd + 1);
        values.push((compressed ? inflateSync(text, {maxOutputLength: 1024 * 1024}) : text).toString("utf8"));
      }
      offset = end;
      if (type === "IEND") break;
    }
    return values.join("\n");
  }
  return bytes.toString("utf8");
}

// 公开横幅不能夹带本机路径、邮箱、带签名图片参数或聊天图片域名。
// README 使用 SVG，脚本商店使用 PNG。两边的教程、双语封面都按同一隐私标准检查。
const publishedPngs = new Map([["docs/images/seatalk-sticker-helper-social.png", [1280, 640]]]);
for (const [lang, readme, listing] of [["zh", readmeZh, greasyForkZh], ["en", readmeEn, greasyForkEn]]) {
  for (const [name, dimensions] of [
    [`seatalk-sticker-helper-banner.${lang}.png`, [1200, 360]],
    [`install-sticker-helper.${lang}.png`, [1672, 941]],
    [`allow-user-scripts.dark.${lang}.png`, [1600, 900]],
  ]) {
    const assetPath = "docs/images/" + name;
    publishedPngs.set(assetPath, dimensions);
    assert.ok(listing.includes(assetPath), "脚本商店说明缺少图片：" + name);
    if (!name.includes("banner")) assert.ok(readme.includes(assetPath), "README 缺少教程：" + name);
  }
}
for (const [name, dimensions] of publishedPngs) {
  const bytes = fs.readFileSync(path.join(projectDirectory, name));
  assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", name + " 不是 PNG");
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], dimensions, name + " 尺寸不正确");
  if (name.endsWith("-social.png")) assert.ok(bytes.length < 1000000, "GitHub 分享封面太大");
}
for (const bannerPath of [bannerZh, bannerEn, ...publishedPngs.keys()]) {
  const bannerBytes = fs.readFileSync(path.join(projectDirectory, bannerPath));
  const searchableBannerText = bannerMetadataText(bannerBytes);
  assert.doesNotMatch(searchableBannerText, /头像|avatar/i);
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
  assert.doesNotMatch(visibleCopy(content), /头像|avatars?|彩蛋|easter[ -]eggs?/i, `${name} 仍展示已下架的功能`);
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

console.log("5.3.1 发布完整性检查通过：版本、双语文档、无版本横幅和隐私边界均已同步。");
