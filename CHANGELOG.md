# 更新日志 / Changelog

## 5.2.2 - 2026-11-23

- 打开助手直接进入「我的表情」。首次使用时，界面提示如何打开 SeaTalk 的爱心收藏页。
- 修复 SeaTalk Web 3.72 中打开助手或页面静置后偶发的空白，统一中英文安装名称。
- The helper opens directly to My stickers and shows how to find Favorites in SeaTalk's sticker picker.
- Fixed an intermittent blank page in SeaTalk Web 3.72. The installation name now matches the helper in both languages.

## 5.2.1 - 2026-10-23

- 修复打开助手后原生表情面板被隐藏形成黑色空白的问题。
- 我的表情每 1.5 秒同步当前账号的 SeaTalk 收藏状态；支持主动同步，保留备注、筛选和仍在收藏中的勾选。同步只读取页面状态，不主动请求服务器，操作或弹窗期间暂停。
- 导出、复制、同步、识别、添加、删除、发送及备注导入增加结果提示；导出提示包含条数和文件名，无变化的主动同步也有反馈。
- 我的表情顶栏精简为使用指南、设置、收起与关闭；设置按语言、窗口布局、个人数据分组。
- 布局恢复入口明确命名为重置布局；两模块底栏统一作者、构建版本和 GitHub 入口。
- Fixed the hidden native sticker panel, added local favorites synchronization and explicit action feedback, grouped settings, and aligned footer details across modules.

## 5.2.0 - 2026-10-23

助手更名为 SeaTalk 表情助手，新增收藏表情的整理、搜索、分享和发送。

## 革新功能 / What’s new

- **备注与关键词搜索 / Searchable notes**：名称、关键词、表情文字、私人说明本地保存；搜索快速定位。
- **确认后发送 / Confirmed sending**：单张预览或多选，先核对目标会话与图片，再逐条发送；切换会话停止，结果不确定不自动重发。
- **带备注分享 / Sharing with metadata**：STGIF2 携带名称、关键词与文字；保留自己的备注并合并关键词，不分享私人说明。
- **备份与恢复 / Personal backups**：个人备注及手动图片形式可导出恢复，导入先预览、选择和处理冲突。
- **独立筛选 / Clear filters**：图片形式、备注状态、检测状态分开；未识别也能备注，支持动图／静态图手动标注。
- **统一中英文界面 / Shared language settings**：收藏窗口和最小化入口使用相同的名称与语言。
- 修复首次预览发送入口置灰、备注导入后无法单选，以及原生资源 ID 刷新导致添加结果误判的问题。


## 5.0.0 - 2026-10-22

### 中文

- 正式加入「我的收藏」批量管理：搜索、放大预览、识别动图、跨页选择、查看已选、首页／末页和跳页。
- 用分享口令分享 1–100 个表情；导入先预览和选择，再确认添加，重新检查并跳过已有收藏。JSON 导出不作为用户操作入口。
- 批量删除展示所有已选图片和数量，包括当前筛选之外的选择；结果不确定时停止后续操作，提示刷新核对。删除无法在助手撤销。
- 统一窗口配色和顶栏，加入红色关闭、收起恢复、浮窗拖动／缩放和分段使用指南。无选择时禁用分享和删除，重复识别不再累计状态文案。
- 宽屏打开时自动将 SeaTalk 与助手左右分栏，分隔线可调宽；收起／关闭恢复原布局，空间不足使用浮窗。
- 5.0.0 的收藏管理界面提供中文标签。
- 预览验收含 76 项自动化检查、99 项模拟浏览器断言及响应式操作检查。完整正式安装包账号流程与跨账号导入仍需验证，详见 [发布验证记录](docs/RELEASE_5.0.0.md)。

### English

- Add **My favorites** batch management: search, enlarged previews, animation inspection, selections across pages, selected-item review, first/last page and page jumps.
- Share 1–100 stickers per code. Import previews and selects before confirmation, rechecks favorites and skips existing entries. JSON export is hidden from normal use.
- Removal confirms all selected images and count, including items outside the current filter. Uncertain results stop later operations and request a reload to verify. Removal cannot be undone in the helper.
- Unify colors and title bars with red close buttons, minimize/restore, floating-window dragging/resizing and a structured guide. Disable share/removal when empty and prevent repeated scan messages from accumulating.
- Automatically place SeaTalk and the helper side by side on wide screens, with a resizable divider. Minimize/close restores the original layout; smaller screens use a floating window.
- The favorites workspace in 5.0.0 uses Chinese labels.
- Preview acceptance included 76 automated checks, 99 simulated browser assertions and responsive interaction checks. Full packaged account workflows and cross-account imports still need validation; see the [release validation record](docs/RELEASE_5.0.0.md).

## 4.0.1 - 2026-09-30

- 修复英文自检日志混入中文，保留启动模块信息。
- 支持拖动标题栏；小窗口与缩放时内容可滚动，底部按钮保持可见。
- 新增右下角 GitHub 图标，中英文提示，新标签页打开项目主页。
- 日常控件使用蓝色，更新和成功弹窗用少量渐变点缀；成功保留绿色对勾。

- Fix mixed-language English startup diagnostics while retaining module information.
- Drag the header; scroll content in small or zoomed windows while keeping primary actions visible.
- Open the GitHub project in a new tab from the footer icon, with bilingual labels.
- Blue everyday controls, subtle gradient accents in update/success dialogs, and a green success check.

## 4.0.0 - 2026-09-29

- 缩小了助手窗口，合并素材选择入口，展开时隐藏悬浮按钮。
- The compact panel combines the selection controls and hides the floating button while open.

## 3.0.5 - 2026-09-28

- 新增环境信息：助手版本、SeaTalk 页面版本/构建号、浏览器和脚本管理器版本；未知值明确显示 unknown。
- 记录各阶段的状态，附操作编号和相对耗时，最多保留当前页面会话的 60 条记录。
- 新增一键复制脱敏 JSON 报告；剪贴板不可用时显示只读文本供手动复制。导出仅包含允许的环境字段和固定流程码，不导出原始异常、账号、聊天内容、GIF ID 或图片地址。
- 合入已验证的 CSP 兼容修复，使用页面上下文启动 Hook；升级后请确认新增权限并刷新 SeaTalk。
- 固定每次提交的操作编号；慢请求尚未返回时阻止重复提交，隔离迟到回报。
- 手动复制报告使用独立对话框，后台刷新不打断内容、焦点和选区。
- 已在 SeaTalk 3.70.1、Chrome 153、Tampermonkey 5.5.0 验证诊断复制；异常分支由本地自动化测试覆盖，详见验收记录。

- Add environment versions, per-attempt stage codes and timings, and a 60-event in-memory limit.
- Copy an allowlisted diagnostic JSON report, with a manual-copy fallback. Raw errors, accounts, chats and image URLs are excluded.
- Include the verified CSP-compatible page hook startup. Accept the updated userscript permissions and reload SeaTalk.
- Capture the attempt number per request; block concurrent retries and isolate late results.
- Keep manual reports in an independent dialog so background updates preserve focus and selection.
- Diagnostic copying verified on SeaTalk 3.70.1, Chrome 153 and Tampermonkey 5.5.0; failure branches covered by local automated tests. See the acceptance record.

## 3.0.4 - 2026-09-28（本地验证版本 / Local validation build）

- 修复 SeaTalk Web 3.70.1 的 CSP 阻止内联页面 Hook 的兼容性问题：使用 Tampermonkey 的 `unsafeWindow` 页面上下文，仍遵守页面的脚本求值策略。
- 增加 Hook 启动确认；失败时立即显示错误码，缩短错误反馈时间。
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
- 只抓取聊天消息中的 SeaTalk 自定义 GIF 表情，自动忽略普通 GIF 图片文件。
- 页面更新模块尚未加载时自动等待最多 5 秒，不再因为首次点击过早而反复打开个人资料卡。
- 加载失败时提供醒目提示和一键重新检查，不再要求用户手动上传普通 PNG/JPG 图片。
- 更新中英文提示、使用说明和调试信息。

### English

- Moved the floating button upward by default so it does not cover SeaTalk's send area in full-screen or zoomed layouts.
- Added mouse and touch dragging with saved position restoration after refresh.
- Limited chat capture to SeaTalk custom GIF stickers and ignored regular GIF image files.
- Added an automatic wait of up to 5 seconds when SeaTalk's update module is still loading, preventing premature profile-card actions on the first click.
- Added a prominent retry message when loading fails, with no manual PNG/JPG upload step required.
- Updated Chinese and English guidance and diagnostics.

## 3.0.1 - 2026-07-30

- 修复失效的聊天资源链接在面板中显示破图的问题。
- Prevented expired chat resource URLs from showing broken preview images in the panel.

## 3.0.0 - 2026-07-30

- 新增中英文界面、随机示例、运行诊断和成功提醒。
- Added bilingual controls, sample images, diagnostics and success notifications.
