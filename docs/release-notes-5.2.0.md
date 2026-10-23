# 5.2.0 · 升级为 SeaTalk 表情助手 / Meet SeaTalk Sticker Helper

从 GIF 头像工具，升级为整理、搜索、分享和使用收藏表情的助手。个人及群 GIF 头像继续保留。

## 革新功能 / What’s new

- **备注与关键词搜索 / Searchable notes**：名称、关键词、表情文字、私人说明本地保存；搜索快速定位。
- **确认后发送 / Confirmed sending**：单张预览或多选，先核对目标会话与图片，再逐条发送；切换会话停止，结果不确定不自动重发。
- **带备注分享 / Sharing with metadata**：STGIF2 携带名称、关键词与文字；保留自己的备注并合并关键词，不分享私人说明。
- **备份与恢复 / Personal backups**：个人备注及手动图片形式可导出恢复，导入先预览、选择和处理冲突。
- **独立筛选 / Clear filters**：图片形式、备注状态、检测状态分开；未识别也能备注，支持动图／静态图手动标注。
- **统一中英文界面 / Shared language settings**：我的表情 / My stickers 与 GIF 头像 / GIF avatars，统一语言、名称和最小化入口。
- 修复首次预览发送入口置灰、备注导入后无法单选，以及原生资源 ID 刷新导致添加结果误判的问题。

## 升级 / Upgrade

更新原 Greasy Fork 脚本 **588931**，或安装本 Release 附件。停用其他预览版后刷新 SeaTalk。保留原安装更新身份和已有备注；管理器内可能仍显示旧安装名称。

Update the existing Greasy Fork script **588931** or use the attached userscript. Disable other previews and reload SeaTalk. Installation identity and local notes are preserved; the manager may retain the legacy installation name.

本次发布仅包含功能，不包含私人候选标签或表情包市场。分享口令不含私人说明；个人备份含私人说明，请自行保管。

Features only: no private candidate labels or sticker market. Sharing excludes private notes; backups include them and should be kept safe.

普通单聊／群聊发送，不支持话题窗口。跨账号资源可用性取决于 SeaTalk；不承诺所有资源永久可导入。验证范围见仓库 docs/RELEASE_5.2.0.md。
