# SeaTalk GIF 头像助手 5.0.0

个人 GIF 头像适配，加上正式开放的收藏表情批量管理。

- **个人头像修复**：先将表情登记为头像资源，验证内容一致后提交，保留原昵称与动画。群头像保留原有核对与确认流程。
- **我的收藏**：搜索、放大预览、识别动图、跨页选择、查看已选、首页／末页和跳页。
- **分享口令**：一次分享 1–100 个表情；导入先预览、选择并确认，已有收藏自动跳过。
- **确认后批量删除**：展示完整选择，含当前筛选之外的项目；绑定当前账号并逐项核对，账号变化或结果未确认时停止后续操作。
- **自动左右分栏**：宽屏打开助手时并排显示 SeaTalk，收起或关闭恢复原布局；窄屏自动使用浮窗。
- **统一操作**：顶栏、红色关闭、收起恢复、拖动缩放、固定操作区与清晰的使用指南。

表情包市场不在本版范围。头像助手支持中英文，收藏管理界面目前为中文。

**安装／升级 5.0.0：** [下载正式版脚本](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/releases/download/v5.0.0/SeaTalk-Personal-GIF-Avatar-Helper.user.js)。[原 Greasy Fork 脚本页](https://greasyfork.org/zh-CN/scripts/588931) 继续保留，版本以该页面显示为准。先停用其他 beta／preview 版本，只启用一份助手，再刷新 SeaTalk。收藏管理需先打开 SeaTalk 爱心「收藏」页签，并保持其挂载。

**使用提醒：** 浏览／分享无需先识别动图。分享和删除均包含跨页、跨筛选的全部已选；删除无法在助手撤销，口令不保证恢复。添加／删除结果不确定时先刷新核对。口令由用户自行发送，不自动发消息。

**验证范围：** 个人头像底层流程已在真实 SeaTalk 3.71.1 会话中成功，昵称不变、刷新后保留。正式构建通过 84 项 Node 检查与 99 项模拟浏览器断言；响应式操作检查沿用已批准预览的记录。完整正式安装包账号流程及跨账号导入仍需继续验证。详见 [验证记录](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/docs/RELEASE_5.0.0.md)。

[中文使用说明](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/README.md) · [问题反馈](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/issues)

---

# SeaTalk GIF Avatar Helper 5.0.0

Personal GIF avatar compatibility, plus batch management for favorite stickers.

- **Personal-avatar fix:** Register stickers for avatar use, verify identical content and apply while preserving name and animation. Group avatars retain existing checks and confirmation.
- **My favorites:** Search, enlarged previews, animation inspection, selections across pages, selected-item review, first/last page and page jumps.
- **Share codes:** Share 1–100 stickers at a time. Imports preview, select and confirm; existing favorites are skipped.
- **Confirmed batch removal:** Review the complete selection, including items outside the current filter. Operations bind to the current account and recheck each item; account changes or unconfirmed results stop later operations.
- **Automatic split view:** On wide screens, SeaTalk and the helper appear side by side; minimize/close restores the original layout. Smaller screens use a floating window.
- **Consistent interaction:** Title bars, red close buttons, minimize/restore, dragging/resizing, fixed action areas and a clear guide.

The sticker market is excluded. The avatar helper is bilingual; the favorites workspace currently uses Chinese labels.

**Install/upgrade to 5.0.0:** [Download the stable userscript](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/releases/download/v5.0.0/SeaTalk-Personal-GIF-Avatar-Helper.user.js). The [original Greasy Fork page](https://greasyfork.org/en/scripts/588931) remains available; check its displayed version. Disable other beta/preview copies, enable one helper and reload SeaTalk. Favorites management requires the native heart Favorites tab to be open and mounted.

**Before use:** Browsing/sharing needs no animation scan. Sharing/removal includes selections across pages and filters. The helper cannot undo removal and codes do not guarantee recovery. Reload to verify uncertain add/removal results. Users send codes themselves; no messages are sent automatically.

**Validation:** The underlying personal-avatar flow succeeded in a real SeaTalk 3.71.1 session, preserving the name and surviving reload. The release build passed 84 Node checks and 99 simulated browser assertions; responsive interaction checks are recorded from the preview. Full packaged account acceptance and cross-account imports still need further validation. See the [validation record](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/docs/RELEASE_5.0.0.md).

[English instructions](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/README.en.md) · [Report an issue](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/issues)
