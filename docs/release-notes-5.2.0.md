# 5.2.0 · 升级为 SeaTalk 表情助手 / Meet SeaTalk Sticker Helper

> 历史版本，仅供查阅。安装或更新请使用[最新正式版](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/releases/latest)。
> Archived release. To install or update, use the [latest release](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/releases/latest).

助手更名为 SeaTalk 表情助手，新增收藏表情的整理、搜索、分享和发送。

## 革新功能 / What’s new

- **备注与关键词搜索 / Searchable notes**：名称、关键词、表情文字、私人说明本地保存；搜索快速定位。
- **确认后发送 / Confirmed sending**：单张预览或多选，先核对目标会话与图片，再逐条发送；切换会话停止，结果不确定不自动重发。
- **带备注分享 / Sharing with metadata**：STGIF2 携带名称、关键词与文字；保留自己的备注并合并关键词，不分享私人说明。
- **备份与恢复 / Personal backups**：个人备注及手动图片形式可导出恢复，导入先预览、选择和处理冲突。
- **独立筛选 / Clear filters**：图片形式、备注状态、检测状态分开；未识别也能备注，支持动图／静态图手动标注。
- **统一中英文界面 / Shared language settings**：收藏窗口与最小化入口使用相同的语言和名称。
- 修复首次预览发送入口置灰、备注导入后无法单选、单聊联系人名称读取，以及原生资源 ID 刷新导致添加结果误判的问题。

## 升级 / Upgrade

此版本沿用了原脚本的更新渠道和已保存的备注。

This version retained the existing update channel and saved notes.

分享口令不含私人说明；个人备份含私人说明，请自行保管。

Sharing excludes private notes; backups include them and should be kept safe.

普通单聊／群聊发送，不支持话题窗口。跨账号资源可用性取决于 SeaTalk；不承诺所有资源永久可导入。验证范围见仓库 docs/RELEASE_5.2.0.md。
