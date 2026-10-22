![SeaTalk GIF 头像助手](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/seatalk-gif-avatar-helper-banner.dark.png)

# SeaTalk GIF 头像助手 · 5.0.0

把聊天里的 GIF 设为个人或群动态头像，也能批量整理、分享你的收藏表情。

**[完整图文教程与常见问题](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper)**

## 5.0 新功能

- **个人头像适配**：先登记为头像资源并确认文件内容一致，再提交，保留动画与昵称。
- **我的收藏**：搜索、放大预览、识别动图、分页选择、查看已选及确认后批量删除。
- **分享口令**：选择 1–100 个表情生成口令；朋友粘贴后预览、选择并确认添加，已有收藏自动跳过。
- **自动分栏**：宽屏打开时 SeaTalk 在左、助手在右；关闭或收起恢复原布局，窄屏使用浮窗。
- **统一界面**：清晰顶栏、红色关闭、收起恢复、浮窗拖动与缩放、常驻「使用指南」。

本版不包含表情包市场。头像助手支持中英文，收藏管理界面目前为中文。

## 安装与升级

![首次安装三步图](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/install-in-3-steps.dark.png)

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/) 安装并启用扩展。
2. **右键**点击 Tampermonkey 图标，进入 **管理扩展程序**，开启 **允许运行用户脚本**。如没有该选项，在浏览器扩展页开启 **开发者模式**。
3. 点击本页 **安装此脚本**，刷新 [SeaTalk Web](https://seatalkweb.com/)。出现 **GIF头像助手** 即可打开。

升级沿用原脚本身份；先停用其他 beta／preview 版本，确保只启用一份助手，再更新并刷新。如有权限提示，请查看后确认。

![首次授权操作图](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/allow-user-scripts.dark.png)

## 使用方法

**头像：** 随机预览后点击主按钮；或通过 SeaTalk 的「表情」发送 GIF，再从聊天获取。群头像需要保持可编辑群设置打开，核对群名和图片后确认。

**收藏：** 先打开 SeaTalk 表情面板的爱心「收藏」页签，再打开助手「我的收藏」。操作期间保持原生收藏面板挂载，勿切换聊天；助手展开时会暂时隐藏它，收起或关闭后恢复显示。

- 浏览和分享无需先识别；只看动图时，先点「识别动图」再筛选。
- 翻页、筛选保留选择；「全选本页」仅选当前页，「查看已选」核对全部选择。
- 分享：选择 →「生成分享口令」→ 复制完整口令自行发送，每次最多 100 个。
- 添加：「导入口令」→ 粘贴完整口令 →「解析并预览」→ 选择 → 确认添加。已有收藏会跳过，失败预览不可添加。
- 删除：选择 →「删除所选表情」→ 核对图片及数量 → 确认。删除只影响自己的收藏，不删聊天消息；助手无法撤销，口令不保证恢复。

添加或删除结果未确认时，请先刷新 SeaTalk 核对，勿立即重复操作。停止会等待当前项目的结果；刷新会清空本次选择。

## 隐私与兼容性

界面只在 SeaTalk Web 运行。抓取、识别、预览、头像登记和收藏添加使用 SeaTalk 自身的图片／业务服务；没有独立统计或追踪服务，不向其他服务上传聊天、密码或 Cookie。会话凭据留在页面内。分享口令含表情资源标识与分享名称，不含账号、会话凭据或签名图片地址；口令不是加密内容，也不保证资源永久可用，助手不会自动发消息。

个人头像底层流程已在真实 SeaTalk 3.71.1 浏览器中成功并经刷新核对；自动化、模拟界面和正式安装包账号验收范围分别见 [5.0.0 验证记录](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/blob/main/docs/RELEASE_5.0.0.md)。跨账号导入仍需继续验证。

遇到问题可复制「运行状态与调试信息」中的脱敏诊断，通过 [GitHub Issues](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper/issues) 反馈；请遮挡姓名、聊天及图片地址参数。

本脚本为非官方工具，与 SeaTalk 官方无隶属、合作或认可关系。
