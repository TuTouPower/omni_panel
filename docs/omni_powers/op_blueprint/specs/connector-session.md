<!-- omni_powers: blueprint/specs/connector-session -->

# session 型连接器（受控网页登录）

复用网页登录态做采集。运行时契约见 `connector-runtime.md`；平台能力见 `platform-services.md`（SessionManager）。

## 定位

session 能力的连接器（MiMo / OpenCode Go / Kimi）需要用户在受控窗口登录，宿主捕获真实 cookie，后续采集带 cookie 发请求。解决"用量数据只在登录后网页可见、无 API key"的场景。

## IPC（`src/shared/types/ipc.ts`）

- `SESSION_LOGIN` / `session.login(request)` — `request: { instance_id, login_url, cookie_names[] }`
- `SESSION_REFRESH` / `session.refresh(request)` — 复用分区续期凭据
- `AUTH_COOKIE_LOGIN` / `auth.cookieLogin(instanceId)` — 通用 cookie 登录（兼容旧路径）

返回 `SessionLoginResult = { saved: boolean }`。成功保存后 UI 提示"网页登录成功，Cookie 已保存"，失败提示"未捕获到 Cookie"。

## 登录流程（SessionManager）

1. 宿主打开受控 `BrowserWindow`，每个需登录 provider 一个独立持久化分区 `persist:<provider>-login`。
2. 通过 `webRequest` 捕获浏览器**实际发出**的目标接口请求头（尤其 Cookie）——**不从 cookie jar 猜拼**。
3. 命中 `cookie_names` 列表即捕获成功，写入 SecretsVault（key 命名见 `secret-vault.md`）。
4. 关闭登录窗口。

## 后台续期

- 按 `cookieRefreshHours`（0=关 / 6 / 12 / 24h）复用分区刷新凭据，减少重复登录。
- 续期失败 → 该连接器观测标 stale + 提示重新登录。

## 采集

登录后，脚本（`connector.ts` 的 script 分支）经 `ctx.http`（`connector-runtime.md` 的 ConnectorContext）带 cookie 发请求解析用量。`source = "session"`。

## 限制

- 控制台复制脚本无法读 HttpOnly Cookie —— 必须走网页登录捕获或 DevTools/Application 导出。
- 必需 HttpOnly Cookie 时，`auth:cookieLogin` 的 JS 注入路径不可用，强制走 `session:login` 受控窗口。

## 触发再登录（`refresh-service`）

首次 auth 错误 + session 能力 + 有 `sessionLogin` 依赖 → 每轮刷新最多触发一次登录。保存成功后额外等待 2s，再继续 refresh-service 通用三次采集尝试；登录失败仍继续剩余尝试，三次均失败才向前端暴露 `failed`。
