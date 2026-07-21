# session 型连接器（受控网页登录）

复用网页登录态做采集。运行时契约见 `connector-runtime.md`；平台能力见 `platform-services.md`（SessionManager）。

## 定位

session 能力的连接器（MiMo / OpenCode Go / Kimi）需要用户在受控窗口登录，宿主捕获真实 cookie，后续采集带 cookie 发请求。解决"用量数据只在登录后网页可见、无 API key"的场景。

## IPC（`src/shared/types/ipc.ts`）

- `SESSION_LOGIN` / `session.login(request)` — `request: SessionLoginRequest = { instance_id, provider, login_url, cookie_names[] }`
- `SESSION_REFRESH` / `session.refresh(request)` — 复用 `SESSION_LOGIN` handler，重新打开登录窗（无后台定时续期）
- `AUTH_COOKIE_LOGIN` / `auth.cookieLogin(instanceId)` — 通用 cookie 登录（兼容旧路径，由 auth-ipc 注入固定 `auto_close_ms`）

`SessionLoginRequest`（shared 契约）4 字段；内部 `LoginRequest`（`session-manager.ts:37-43`）额外含可选 `auto_close_ms`，由宿主层注入，不暴露给渲染进程。

返回 `SessionLoginResult = { saved: boolean }`。成功保存后 UI 提示"网页登录成功，Cookie 已保存"，失败提示"未捕获到 Cookie"。

## 登录流程（SessionManager）

1. 宿主打开受控 `BrowserWindow`，**按实例**独立持久化分区 `persist:session-login:{instance_id}`（`session-manager.ts:176-178`）。
2. 通过 `webRequest` 捕获浏览器**实际发出**的目标接口请求头（尤其 Cookie）——**不从 cookie jar 猜拼**；同源匹配由 `should_capture_cookie` 判定，具体接收哪些 cookie 由 manifest `cookieNames` 声明（`"*"` 表示全部）。
3. 命中 `cookie_names` 列表即捕获成功，写入 SecretsVault（key 命名见 `secret-vault.md`）。
4. 关闭登录窗口（若 `auto_close_ms` 设置，捕获后自动延时关闭）。

## 后台续期

未实现。当前 `SESSION_REFRESH` 复用 `SESSION_LOGIN` 的 handler（`session-ipc.ts:63-68`），仅打开登录窗由用户重新完成登录，无按 `cookieRefreshHours` 的后台定时续期；代码库中无 `cookieRefreshHours` 字段。捕获成功后由 `auto_close_ms` 延时自动关窗。

## 采集

登录后，脚本（`connector.ts` 的 script 分支）经 `ctx.http`（`connector-runtime.md` 的 ConnectorContext）带 cookie 发请求解析用量。`source = "session"`。

## 限制

- 控制台复制脚本无法读 HttpOnly Cookie —— 必须走网页登录捕获或 DevTools/Application 导出。
- 必需 HttpOnly Cookie 时，`auth:cookieLogin` 的 JS 注入路径不可用，强制走 `session:login` 受控窗口。

## 触发再登录（`refresh-service`）

首次 auth 错误 + session 能力 + 有 `sessionLogin` 依赖 → 每轮刷新最多触发一次登录。保存成功后额外等待 2s，再继续 refresh-service 通用三次采集尝试；登录失败仍继续剩余尝试，三次均失败才向前端暴露 `failed`。
