# 5.0.0 发布验证记录 / Release validation record

日期 / Date：2026-10-22（Asia/Shanghai）

## 发布范围 / Scope

- 个人 GIF 头像先登记为头像用途，验证文件字节一致，再调用当前账号的原生更新服务；保留昵称，不通过改写资源 ID 或伪装文件类型更新。
- 保留现有群头像流程、目标群核对与二次确认。
- 收藏工作区绑定打开时的账号与原生收藏来源；无法核对账号时禁用添加和删除，确认前及逐项操作前后再次检查，账号或来源变化时停止后续操作。
- 正式加入收藏搜索、动图识别、分页选择、分享口令、确认后批量添加与删除。口令最多 100 个表情，JSON 导出隐藏，表情包市场不包含在本版。
- 合入统一窗口、分段指南、收起恢复、浮窗拖动／缩放和打开时自动分栏；收起或关闭后恢复原页面布局。
- 保留原有脚本名称／命名空间、存储键和 [Greasy Fork 588931](https://greasyfork.org/zh-CN/scripts/588931) 更新身份。

- Register personal GIF resources for avatar use, compare the file bytes, then call the current account's native updater while preserving the name. Resource IDs and file types are not fabricated.
- Retain the existing group-avatar flow, target checks and confirmation.
- Bind favorites operations to the account and native favorites source captured when opening. Disable add/removal if identity cannot be checked; recheck before confirmation and around each operation, stopping later items if the account or source changes.
- Add favorites search, animation inspection, paged selection, share codes and confirmed batch add/removal. Codes allow up to 100 stickers. JSON export is hidden and the sticker market is excluded.
- Include consistent windows, a structured guide, minimize/restore, floating dragging/resizing and automatic split view that restores the original layout on close/minimize.
- Preserve the original script name/namespace, storage key and [Greasy Fork 588931](https://greasyfork.org/en/scripts/588931) update identity.

## 已取得的证据 / Evidence obtained

| 层次 / Layer | 结果 / Result | 范围 / Scope |
| --- | --- | --- |
| 正式构建 Node 检查 / Release-build Node checks | 84 项通过 / 84 checks passed | 头像、操作隔离、群头像、诊断、分享口令、分栏边界及收藏账号绑定保护。 / Avatars, operation isolation, group flow, diagnostics, share codes, split-layout boundaries and account-bound favorites guards. |
| 正式构建模拟浏览器 / Release-build simulated browser | 99 项通过 / 99 assertions passed | 收藏页面 79 项、分栏 20 项；使用正式构建与模拟账号／收藏服务。 / 79 favorites assertions and 20 layout assertions, using the release build with simulated account/favorites services. |
| 响应式交互 / Responsive interaction | 通过已记录的操作 / Recorded interactions passed | 1440px 分栏保留聊天 900px，侧栏缩至 460px；1280px 回退浮窗；浮窗缩至 360px，收起恢复与选择保留。 / At 1440px, chat retained 900px and the sidebar resized to 460px. At 1280px, floating fallback worked; a 360px floating window, minimize/restore and retained selections were checked. |
| 公开原生 CSS / Public native CSS | 已检查 / Inspected | SeaTalk 3.71.1 的主窗口容器与尺寸规则；未在登录页执行账号数据操作。 / SeaTalk 3.71.1 main-window selectors and sizing rules; no account mutation from the login page. |

正式构建的 84 项 Node 检查与 99 项模拟浏览器断言已通过；响应式检查基于 `5.0.0-preview.4`。自动化检查不保证所有账号及 SeaTalk 版本均兼容。

The release build passed 84 Node checks and 99 simulated browser assertions. Responsive checks used `5.0.0-preview.4`. Automated checks do not guarantee compatibility with every account or SeaTalk version.

可重复构建核对通过：重新构建正式脚本后 SHA-256 保持一致；`git diff --check` 通过。独立复核确认收藏账号绑定问题已修复。

Deterministic build comparison passed: rebuilding the release script preserved its SHA-256, and `git diff --check` passed. Independent follow-up review confirmed the favorites account-binding issue was fixed.

正式脚本 / Release script：`SeaTalk-Personal-GIF-Avatar-Helper.user.js`

SHA-256：`20641d4e47d3a59ecb8194c2fb58818239ef3c23e926e1bac9f7c88502e8c15f`

## 验证边界 / Validation limits

正式安装包的真实账号完整头像流程、真实登录态下的分栏聊天输入／虚拟列表／原生弹层，以及跨账号分享口令导入，尚未取得完整验收证据。真实收藏批量添加／删除也不能用模拟断言替代。其他 GIF、账号与 SeaTalk 版本不在已验证范围内。

Full account acceptance of the packaged avatar flow, split-view chat input/virtual lists/native popups in a signed-in page, and cross-account code imports remains incomplete. Simulated assertions do not establish real favorites add/removal acceptance. Other GIFs, accounts and SeaTalk versions remain outside the verified scope.

## 安装与使用前提 / Prerequisites

1. 停用所有旧 beta／preview，只启用一份正式脚本，更新后刷新 SeaTalk；查看并确认 Tampermonkey 权限提示。
2. 收藏操作前打开原生表情面板的爱心「收藏」页签，操作期间保持挂载，不切换聊天；助手仅临时隐藏其显示。
3. 分享／删除前通过「查看已选」核对全部选择；筛选之外的选择也包含在操作中。分享口令上限为 100 个。
4. 导入先预览、再选择并确认；已收藏的重新检查后跳过，失败预览禁止添加。
5. 删除无法在助手撤销，口令不保证恢复；不确定结果先刷新核对，不立即重试。停止只阻止后续项目，会等待当前项目。
6. 口令由用户自行复制发送，不自动发送消息。口令不是加密内容，包含分享名称和表情资源标识，不保证长期／跨账号访问。

1. Disable older beta/preview copies, enable one stable script, reload after updating and review Tampermonkey permission prompts.
2. Open the native heart Favorites tab and keep it mounted without switching chats during favorites operations. The helper only temporarily hides it.
3. Review all selected items before sharing/removal, including selections outside filters. Share-code limit: 100.
4. Preview imports, select and confirm. Recheck and skip existing favorites; failed previews cannot be added.
5. Removal cannot be undone in the helper and codes do not guarantee recovery. Reload to verify uncertain results before retrying. Stop prevents later items after waiting for the current item.
6. Users copy/send codes themselves. No messages are sent automatically. Codes are not encrypted and include share names and resource identifiers; lasting/cross-account access is not guaranteed.

完整操作说明 / Full instructions：[中文](../README.md) · [English](../README.en.md)。
