# 更新日志 / Changelog

本文件记录 SeaTalk 个人 GIF 头像助手的公开版本变化。

This file records public releases of SeaTalk Personal GIF Avatar Helper.

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
