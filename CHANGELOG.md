# 更新日志 / Changelog

本文件记录 SeaTalk 个人 GIF 头像助手的公开版本变化。

This file records public releases of SeaTalk Personal GIF Avatar Helper.

## 4.0.1 - 2026-09-30

- 修复英文自检日志混入中文，保留启动模块信息。
- 支持拖动标题栏；小窗口与缩放时内容可滚动，底部按钮保持可见。
- 新增右下角 GitHub 图标，中英文提示，新标签页打开项目主页。
- 日常控件使用蓝色，更新和成功弹窗用少量渐变点缀；成功保留绿色对勾。
- 展示名称统一为 **SeaTalk GIF 头像助手**，支持个人与群头像。仓库地址、脚本安装名称和更新身份保持兼容。

- Fix mixed-language English startup diagnostics while retaining module information.
- Drag the header; scroll content in small or zoomed windows while keeping primary actions visible.
- Open the GitHub project in a new tab from the footer icon, with bilingual labels.
- Blue everyday controls, subtle gradient accents in update/success dialogs, and a green success check.
- Display branding is **SeaTalk GIF Avatar Helper**, for personal and group avatars. Repository URL and userscript installation identity remain compatible.

## 4.0.0 - 2026-09-29

- **个人头像 / 当前群头像** 双页签，GIF 也能作为群头像。
- 打开目标群设置，确认助手显示的群名，选择 GIF 后点击更换；每次都有群名和 GIF 二次确认。
- 自动观察目标群头像，确认后弹出成功提示并恢复操作，无需刷新即可继续更换。
- 新版紧凑界面：素材入口合并、目标群提示更清楚，展开时隐藏悬浮按钮。
- 两个模式的随机挑选均为**先预览，再点击更换**。

群设置须保持打开且存在头像编辑入口；未确认结果时继续检查并阻止重复提交。群成功表示页面已观察到目标资源，不代表独立 API 回执。使用过测试版的用户请先停用 beta 脚本，再启用正式版并刷新 SeaTalk。

- Switch between **My avatar / Group avatar** to use GIFs for yourself or a group.
- Open the target group's settings, check its name, select a GIF, and confirm the group and preview before each update.
- The helper checks the target avatar, shows a success popup and unlocks the next update without a refresh.
- Compact UI with shared GIF selection, a styled target label and no floating button covering the open panel.
- Random selection now **previews first** in both modes; apply with the main button.

Keep editable group settings open. Unconfirmed updates remain protected against duplicate submissions while checking continues. Group success means the target resource was observed on the page, not an independent API receipt. Disable beta scripts before enabling the stable release and refresh SeaTalk.

## 3.0.5 - 2026-09-28

- 新增环境信息：助手版本、SeaTalk 页面版本/构建号、浏览器和脚本管理器版本；未知值明确显示 unknown。
- 记录页面连接、模块发现、头像提交和显示验证阶段，附操作编号和相对耗时，最多保留当前页面会话的 60 条记录。
- 新增一键复制脱敏 JSON 报告；剪贴板不可用时显示只读文本供手动复制。导出仅包含允许的环境字段和固定流程码，不导出原始异常、账号、聊天内容、GIF ID 或图片地址。
- 合入已验证的 CSP 兼容修复，使用页面上下文启动 Hook；升级后请确认新增权限并刷新 SeaTalk。
- 固定每次提交的头像 ID 和操作编号；慢请求尚未返回时阻止重复提交，隔离迟到回报。
- 手动复制报告使用独立对话框，后台刷新不打断内容、焦点和选区。
- 已在 SeaTalk 3.70.1、Chrome 153、Tampermonkey 5.5.0 验证头像更新和诊断复制；异常分支由本地自动化测试覆盖，详见验收记录。

- Add environment versions, per-attempt stage codes and timings, and a 60-event in-memory limit.
- Copy an allowlisted diagnostic JSON report, with a manual-copy fallback. Raw errors, accounts, chats and image URLs are excluded.
- Include the verified CSP-compatible page hook startup. Accept the updated userscript permissions and reload SeaTalk.
- Capture avatar IDs and attempt numbers per request; block concurrent retries and isolate late results.
- Keep manual reports in an independent dialog so background updates preserve focus and selection.
- Avatar updates and diagnostic copying verified on SeaTalk 3.70.1, Chrome 153 and Tampermonkey 5.5.0; failure branches covered by local automated tests. See the acceptance record.

## 3.0.4 - 2026-09-28（本地验证版本 / Local validation build）

- 修复 SeaTalk Web 3.70.1 的 CSP 阻止内联页面 Hook 的兼容性问题：使用 Tampermonkey 的 `unsafeWindow` 页面上下文，仍遵守页面的脚本求值策略。
- 增加 Hook 启动确认；失败时立即显示错误码，不再等待头像验证超时。
- 英文诊断保留原始技术详情，避免所有故障都显示为同一句泛化提示。
- 升级需授权新增的 `unsafeWindow` 权限并刷新 SeaTalk。该版本已在用户浏览器验证，修复随 3.0.5 对外发布。

- Replace inline hook injection with Tampermonkey's `unsafeWindow` page context, subject to the page's script evaluation policy.
- Detect missing hook startup immediately and show a diagnostic code.
- Preserve original technical details in English diagnostics.
- Approve the new `unsafeWindow` grant and reload SeaTalk after updating. This local build was verified in the user’s browser; its fix is included in the public 3.0.5 release.

## 3.0.3 - 2026-08-12

### 中文

- 修复部分 GIF 表情在个人私聊中无法抓取的问题，并统一个人私聊、群聊和聊天分支的抓取逻辑。
- 读取候选图片的真实文件内容与帧数：双帧 GIF 可以正常识别，单帧 GIF、普通 PNG/JPG 和其他静态图片会被过滤。
- 修复带有 Reaction、emoji 或 emoticon 结构的正常聊天消息被误判为表情选择面板的问题。
- 按聊天位置和消息先后展示最近 3 个 GIF，不再让尺寸较大的旧图片挤掉新图片。
- 增加一次性新版更新提示，并在助手底部显示 `v3.0.3`，方便用户区分版本和反馈故障。

### English

- Fixed GIF stickers that could not be captured in some private chats, with one capture flow shared by private chats, groups, and chat branches.
- Added real file and frame-count verification: two-frame GIFs are accepted while one-frame GIFs, regular PNG/JPG files, and other still images are rejected.
- Fixed normal chat messages with Reaction, emoji, or emoticon structures being mistaken for picker panels.
- Kept the latest 3 GIFs in chat and message order so older large images cannot displace newer results.
- Added a one-time update notice and a visible `v3.0.3` label at the bottom of the helper for easier troubleshooting.

## 3.0.2 - 2026-07-30

### 中文

- 将浮动按钮默认上移，避免在全屏或缩放页面中遮挡 SeaTalk 发送区域。
- 支持鼠标和触控拖动浮动按钮，并在刷新后恢复用户保存的位置。
- 只抓取聊天消息中的 SeaTalk 自定义 GIF 表情，自动忽略普通 GIF 图片文件，避免头像接口返回 `SERVER_ERROR`。
- 页面更新模块尚未加载时自动等待最多 5 秒，不再因为首次点击过早而反复打开个人资料卡。
- 加载失败时提供醒目提示和一键重新检查，不再要求用户手动上传普通 PNG/JPG 图片。
- 更新中英文提示、使用说明和调试信息。

### English

- Moved the floating button upward by default so it does not cover SeaTalk's send area in full-screen or zoomed layouts.
- Added mouse and touch dragging with saved position restoration after refresh.
- Limited chat capture to SeaTalk custom GIF stickers and ignored regular GIF image files that would cause an avatar API `SERVER_ERROR`.
- Added an automatic wait of up to 5 seconds when SeaTalk's update module is still loading, preventing premature profile-card actions on the first click.
- Added a prominent retry message when loading fails, with no manual PNG/JPG upload step required.
- Updated Chinese and English guidance and diagnostics.

## 3.0.1 - 2026-07-30

- 修复失效的聊天资源链接在面板中显示破图的问题。
- Prevented expired chat resource URLs from showing broken preview images in the panel.

## 3.0.0 - 2026-07-30

- 新增自动发现 SeaTalk 头像更新入口、中英文界面、随机示例、运行诊断和成功提醒。
- Added automatic SeaTalk updater discovery, bilingual UI, random samples, runtime diagnostics, and a success confirmation.
