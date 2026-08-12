# p148 OpenCode Go 网页登录捕获无效 cookie → 采集失败

- 现象：新增 OpenCode Go 账号走「网页登录」自动捕获，登录窗口关闭后 SESSION_COOKIE 已保存，但采集立即失败（attempt 1/3-3/3 全败），面板显示采集失败/凭证失效；重新登录（t172 门控）后仍复现。实例 bc6b0161（2026-08-12T18:24:01 保存）日志持续报「Cookie 可能已失效，未跳转到 workspace」；同环境旧实例 c6056f73（cookie 有效）同期采集成功。
- 影响：opencode_go（唯一 web_login provider）新增账号与重登全流程；旧账号不受影响（cookie 仍有效）。t172 重新登录门控对 opencode 无效——重登走同一缺陷路径。
- 根因：产品缺陷。session-manager（`src/main/core/session/session-manager.ts`）wildcard cookie 捕获门控只保证「离开 login_origin 又回到」的跨域跳转发生，不保证回跳时认证 cookie 已就绪；捕获点在 `on_before_send_headers`（请求头发送前），认证 cookie 若由回跳响应 Set-Cookie 设置，捕获到的必是登录前匿名/旧 cookie。捕获后**无有效性验证**直接 `saved:true` 回传 → 前端保存 → opencode_go connector（`connectors/opencode_go/connector.ts` `/auth` 判定：要求 3xx + Location workspace）判定失效。`.scratch/repro-cookie-timing.ts` 复现：回跳 `/auth/callback?code=xxx` 带匿名 cookie 时 `{"saved":true,"cookie":"anon=1"}`。已扫，无已确认同类位点（仅 opencode_go 用 web_login；grok/kimi 走 oauth_device，t172 已覆盖 401 刷新，机制不同）。
- 测试缺口：session-manager.test.ts 12+ 捕获用例全部 mock「回跳请求已带有效 cookie」，无「回跳首请求匿名/认证 cookie 由响应设置」时序；connector opencode_go.test.ts 已覆盖 /auth 判定（采集侧正确），测不到捕获侧。补测：捕获后对 login_url 探测 /auth（期望 3xx+workspace，失败 saved:false+明确错误）；回跳首请求匿名 cookie 不得保存；无效 cookie 不落库。
- 线索：`.scratch/repro-cookie-timing.ts`（tsx 可跑，复现匿名 cookie 被判定成功）
- 处理：未开
