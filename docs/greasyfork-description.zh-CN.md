![SeaTalk GIF 头像助手](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/seatalk-gif-avatar-helper-banner.dark.png)

# SeaTalk GIF 头像助手

把聊天里的 GIF 表情设为 SeaTalk 动态头像。无需搜索前端文件，也无需设置断点。

当前版本：`4.0.1`

**[查看完整图文教程与常见问题](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper)**

## 4.0.1：操作与界面优化

- 修复英文自检日志混入中文，保留启动模块信息。
- 支持拖动标题栏；小窗口与缩放时内容可滚动，底部按钮保持可见。
- 新增右下角 GitHub 图标，中英文提示，新标签页打开项目主页。
- 日常控件使用蓝色，更新和成功弹窗用少量渐变点缀；成功保留绿色对勾。
- 展示名称统一为 **SeaTalk GIF 头像助手**，支持个人与群头像。仓库地址、脚本安装名称和更新身份保持兼容。

## 4.0.0：支持更新群头像了！

- **个人头像 / 当前群头像** 双页签，GIF 也能作为群头像。
- 打开目标群设置，确认助手显示的群名，选择 GIF 后点击更换；每次都有群名和 GIF 二次确认。
- 自动观察目标群头像，确认后弹出成功提示并恢复操作，无需刷新即可继续更换。
- 新版紧凑界面：素材入口合并、目标群提示更清楚，展开时隐藏悬浮按钮。
- 两个模式的随机挑选均为**先预览，再点击更换**。

群设置须保持打开且存在头像编辑入口；未确认结果时继续检查并阻止重复提交。群成功表示页面已观察到目标资源，不代表独立 API 回执。使用过测试版的用户请先停用 beta 脚本，再启用正式版并刷新 SeaTalk。

## 3.0.5 更新

- 修复当前 SeaTalk CSP 阻止头像更新入口启动的问题。
- 升级后如提示权限变更，请确认 `unsafeWindow` 权限并刷新 SeaTalk。
- 显示环境版本、流程错误码和耗时，支持复制脱敏诊断报告。
- 慢请求期间阻止重复提交，后台状态更新不会打断手动报告复制。
- 已在 SeaTalk 3.70.1、Chrome 153、Tampermonkey 5.5.0 验证正常头像更新和报告复制。

## 首次安装：只需 3 步

![首次安装三步图](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/install-in-3-steps.dark.png)

1. 从 [Tampermonkey 官网](https://www.tampermonkey.net/) 安装并启用浏览器插件。
2. 用鼠标右键点击 Tampermonkey（油猴）图标，点击 **管理扩展程序**，再开启 **允许运行用户脚本**。
3. 点击本页面上方的 **安装此脚本**，然后刷新 [SeaTalk Web](https://seatalkweb.com/)。

SeaTalk 页面右侧出现“GIF头像助手”，就表示全部安装成功。

### 首次授权详图（只需一次）

请使用 **鼠标右键** 点击浏览器右上角的 Tampermonkey（油猴）图标。没有完成授权时，脚本即使显示已安装，也不会在 SeaTalk 页面运行。

![首次授权操作图](https://raw.githubusercontent.com/Candle-Git/seatalk-personal-gif-avatar-helper/main/docs/images/allow-user-scripts.dark.png)

## 最简单的使用方法

### 没有自己的 GIF

1. 登录 SeaTalk Web。
2. 打开“GIF头像助手”。
3. 点击“随机挑一个”预览，再点击主按钮更换。

### 使用自己的 GIF

1. 在当前聊天中通过“表情”按钮发送 GIF 表情，不要作为普通图片文件发送。
2. 打开助手并抓取当前聊天最近的 GIF。
3. 选中喜欢的表情，点击“换成这个 GIF 头像”。

## 主要功能

- 自动发现当前 SeaTalk 头像更新入口。
- 随机预览内置 GIF，安装后可以立即体验。
- 抓取个人私聊、群聊和聊天分支中最近的 3 个 GIF 表情。
- 读取真实动图帧数，支持双帧 GIF，并自动过滤静态图片。
- 按聊天先后展示结果，不会让尺寸较大的旧图片挤掉新图片。
- SeaTalk 加载较慢时自动等待，无需连续点击。
- 浮动按钮支持拖动并记住位置。
- 支持中文和英文界面。
- 提供运行诊断和接口成功确认。
- 助手底部显示版本号，新版本首次运行时会显示一次更新提示。

## 隐私与安全

- 界面只在 `seatalkweb.com` 页面运行。
- 仅在主动抓取时读取 `f.haiserve.com` 的候选图片数据，用于确认真实动图帧数。
- 不收集账号、聊天内容、密码或 Cookie。
- 不包含独立统计或追踪服务。
- 仅修改所选个人头像，或经二次确认且当前可编辑的目标群头像。
- 不保存或记录带签名参数的候选图片地址。

本脚本为非官方工具，与 SeaTalk 官方无隶属或合作关系。

项目主页与问题反馈：
[https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper](https://github.com/Candle-Git/seatalk-personal-gif-avatar-helper)
