# 3.0.5 验收记录 / Acceptance record

验证日期：2026-09-28。发布范围：CSP 兼容修复、分阶段脱敏诊断、慢请求隔离及手动复制稳定性。

## 真实环境

用户在最终修复后确认头像替换成功、诊断复制成功。回传报告的环境为：

- SeaTalk Web 3.70.1，构建 cf31f10f2
- Chrome 153.0.0.0
- Tampermonkey 5.5.0
- 助手 3.0.5

报告显示 HOOK_READY（启动后 5 ms）、SERVICE_READY（136 ms）。两次操作分别在开始后 144 ms、139 ms 收到 API_SUCCESS。报告未包含视觉验证事件；实际头像变化由用户确认。此结果不代表所有浏览器或 SeaTalk 版本均兼容。

## 自动化验证

- `node --check SeaTalk-Personal-GIF-Avatar-Helper.user.js`
- `node --test tests/*.test.mjs`：23 项通过
- `node tests/run-browser-fixture.mjs`：隔离 Chrome 配置、本地合成数据，12 项 DOM 断言通过
- `git diff --check`

慢响应、重试、迟到成功/失败和操作隔离通过可控 Promise 与虚拟时钟测试。剪贴板拒绝、后台更新期间的内容/节点/焦点/选区/滚动保持使用真实 Chrome DOM 和模拟状态事件测试。以上异常分支未在登录的 SeaTalk 中人为复现，不等同于真实服务异常验收。

## 已知边界

- SeaTalk 内部服务没有可用的请求取消接口；请求一直不返回时保持等待并阻止重复提交，不声称已取消。
- CSP 或内部模块后续变化仍可能影响兼容性。当前复现不能确定限制具体从哪次 SeaTalk 发布开始。
- 从 3.0.3 更新需接受新增的 unsafeWindow 权限（若管理器提示）并刷新页面。

## English summary

The user verified actual avatar changes and diagnostic copying on the environment above after the final fixes. Two attempts received API success at 144 ms and 139 ms from their respective starts. Visual success was confirmed by the user, not by a visual event in the copied report.

All 23 local tests and 12 isolated Chrome DOM assertions passed. Slow-request/failure cases use controlled promises and clocks; clipboard-denial/background-render cases use a local browser fixture with synthetic events. These are not live SeaTalk failure tests. Unresolved API calls remain locked against duplicate submissions because the internal service exposes no cancellation mechanism. Compatibility is limited to the tested environment.
