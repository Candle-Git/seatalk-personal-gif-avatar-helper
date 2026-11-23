"""Build the personal-avatar resource-registration fix from beta.2."""
from pathlib import Path
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--source', default='beta/SeaTalk-GIF-Helper-4.1.0-beta.2.user.js')
parser.add_argument('--version', default='4.1.0-beta.5')
parser.add_argument('--output', default='beta/SeaTalk-GIF-Helper-4.1.0-beta.5.user.js')
args = parser.parse_args()

root = Path(__file__).resolve().parent.parent
source = (root / args.source).read_text()

def replace(old, new):
    global source
    assert source.count(old) == 1, f'Expected one anchor: {old[:80]}'
    source = source.replace(old, new, 1)

import re
source = re.sub(r'4\.1\.0-beta\.[12]', args.version, source)
replace('    API_PENDING: [', '''    RESOURCE_REGISTER_START: ["submit", "正在将所选 GIF 登记为头像用途", "Registering the selected GIF for avatar use"],
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
    API_PENDING: [''')
replace('  function buildStatusText() {', '''  function buildStatusText() {
    if (!state.requestPending && state.diagnosticEvents[0]?.level === "error") return state.hookStatus || t("statusError");''')
replace('  function startAvatarVerification(operation) {',
        '  function startAvatarVerification(operation, targetGifId = operation.gifId) {')
replace('      const containsGifId = currentUrls.some((url) => url.includes(operation.gifId));',
        '      const containsGifId = currentUrls.some((url) => url.includes(targetGifId));')
replace('        startAvatarVerification(state.activeOperation);',
        '        startAvatarVerification(state.activeOperation, detail.avatarResourceId || detail.gifId);')
replace('    const runtime = {', (root / 'tools/avatar-resource-updater.js').read_text() + '\n    const runtime = {')
replace('    const runtime = {', (root / 'tools/avatar-resource-discovery.js').read_text() + '\n    const runtime = {')

# Account discovery uses the session exported by the account module. Reading
# arbitrary style-module exports to guess a user ID can invoke unrelated getters.
start = source.index('    function getMainChunkStylesUrls() {')
end = source.index('    async function discoverEsmUpdater(', start)
source = source[:start] + source[end:]
replace('      esmSessionInfo: null,\n', '')
start = source.index('          let updater = null;', source.index('    async function discoverEsmUpdater('))
end = source.index('          if (!updater) {', start)
source = source[:start] + '''          const updater = findAvatarUpdater(moduleNamespace, candidates.declaredBuild);

''' + source[end:]
replace('          runtime.esmSessionInfo = sessionInfo;\n', '')

# Ready means both the updater and the resource/account services were checked.
# Discovery performs no registration or profile update during startup.
replace('      esmDiscoveryFailedFor: "",', '''      esmDiscoveryFailedFor: "",
      esmAccountModuleUrl: "",
      esmResourceFailure: "",''')
replace('        const chunkUrls = getMainChunkStylesUrls();', '''        runtime.esmResourceFailure = "";
        let candidates;
        try { candidates = getAvatarModuleCandidates(); }
        catch (error) {
          runtime.esmResourceFailure = error?.message === "RESOURCE_ACCOUNT_MODULE_MISSING"
            ? error.message : "RESOURCE_MODULE_DECLARATIONS_INVALID";
          if (reportFailure) emit({ type: "compatibility-error", code: runtime.esmResourceFailure });
          return false;
        }
        const chunkUrls = candidates.styles;''')
replace('          runtime.esmUpdater = updater;', '''          try {
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
          runtime.esmUpdater = updater;''')

replace('''          result = { type: "error", code: "SERVICE_MISSING", fallbackAvailable: false,
            message: "直接更新失败：没有找到 SeaTalk 用户资料更新服务。请刷新页面或重新检查。" };''',
        '''          const resourceFailure = runtime.esmResourceFailure;
          result = { type: "error", code: resourceFailure || "SERVICE_MISSING", fallbackAvailable: false,
            message: resourceFailure ? "头像资源准备未完成，未提交个人头像更新；请检查诊断流程码。"
              : "直接更新失败：没有找到 SeaTalk 用户资料更新服务。请刷新页面或重新检查。" };''')

start = source.index('        const userId = findCurrentUserId();', source.index('    async function applyDirectAvatar(operation)'))
end = source.index('      } finally {', start)
source = source[:start] + r'''        const services = await discoverAvatarResourceServices();
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
''' + source[end:]

adapter = r'''
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

'''
replace('    async function applyDirectAvatar(operation) {', adapter + '    async function applyDirectAvatar(operation) {')
output = root / args.output
output.write_text(source)
print(output)
