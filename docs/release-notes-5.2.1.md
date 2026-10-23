# 5.2.1 · 收藏同步与交互优化 / Favorites sync and UI improvements

- 修复打开助手后原生表情面板变成黑色空白；原生面板继续显示。
- 自动每 1.5 秒读取当前账号的 SeaTalk 收藏状态，也可点击「同步收藏」。保留备注、筛选及仍在收藏中的选择；操作或弹窗期间暂停，结束后恢复。
- 主动同步、备份导出、复制及批量操作增加完成、停止或失败反馈。导出显示条数和文件名，并提示查看浏览器下载。
- 我的表情顶栏只保留使用指南、设置、收起、关闭；语言、窗口布局和个人数据集中到设置。
- 重置布局恢复窗口位置、大小和默认分栏，不刷新收藏。两模块统一作者、实际构建版本和 GitHub 入口。

## English

- Keep the native sticker picker visible when opening the helper.
- Read the current account's local SeaTalk favorites state every 1.5 seconds, with a manual Sync favorites action. Preserve notes, filters and selections still in favorites; pause during operations and dialogs.
- Show explicit feedback for manual sync, backup downloads, copying and batch operations, including counts and filenames for exports.
- Group language, window layout and personal data under Settings in My stickers. Keep Guide, Settings, Minimize and Close in the title bar.
- Clarify Reset layout and align author credits, the build version and GitHub links across modules.

## 升级 / Upgrade

更新原 Greasy Fork 脚本 588931，或安装本 Release 附件；停用其他预览脚本后刷新 SeaTalk。保留原安装身份与已有备注。

Update the existing Greasy Fork script 588931 or install the attached userscript. Disable other previews and reload SeaTalk. Existing installation identity and saved notes are preserved.

同步收藏只更新助手中的列表，不会重新请求服务器。结果不确定的添加或删除仍需刷新 SeaTalk 核对保存结果。

Sync favorites updates the helper from local page state without fetching from the server. Uncertain additions or removals still require a SeaTalk reload to verify saved results.
