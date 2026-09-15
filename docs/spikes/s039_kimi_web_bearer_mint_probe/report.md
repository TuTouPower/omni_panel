# Spike report

## 问题

kimi_web（Kimi 网页版）的 quota 认证凭证是 15 分钟寿命的 Bearer JWT，运行时只在受控登录窗口捕获一次，Bearer 过期后采集固定失败且自动重登链空转（见 p235）。本 spike 只回答一个问题：**网页登录态能否用 HTTP 换取新 Bearer**——若能，t492 可复用项目已有的 refresh-token 型续期设施；若不能，按下述既定方案实现 token pump。

## 成功判据

- 找出登录阶段令牌的下发点，给出可复核的响应形态。
- 找到（或明确否定）运行期续期接口，并给出可直接复现的最小请求与响应形态。
- 判定续期是否需要常驻浏览器上下文或后台导航。
- 判定空闲无流量时能否续期。
- 入库产物不含可用真实凭据。

## 尝试

- 有头 Chrome（Playwright `launchPersistentContext`，`channel: chrome`）真实扫码登录 `https://www.kimi.com/`，全量抓 `request`/`response` 事件并**读取响应体**（上一轮 `data/capture_20260909_*.zip` 的响应体未落袋，这是此前漏掉令牌下发点的直接原因）。脚本 `code/probe.mjs`，抓包窗口 20 分钟。
- 从抓包产物提取凭据到 gitignore 目录，离线复现刷新：`code/extract_secrets.mjs` → `code/refresh_probe.mjs`。
- 轮换语义与 quota 认证需求：`code/quota_probe.mjs`。
- 负样本（证明接口真的校验令牌，而非一律 200）：`code/negative_probe.mjs`。
- 候选路径 3（cookie 换 Bearer）的否定样本：`code/cookie_probe.mjs`，用持久 profile 里的真实登录 cookie 打 `RefreshToken` 与 quota 口。
- 错误形态与最小协议要求：`code/error_probe.mjs`。
- 补充静态证据：从抓包命中的前端 bundle（`statics.moonshot.cn/kimi-web-seo/assets/token-*.js`）提取续期实现，确认 `AUTH_API_HOST` 与 localStorage 键名。
- 登录侧取 refresh token 的可行性：`code/login_storage_probe.cjs`（Electron，应用同款 webPreferences）验证主进程可读页面 localStorage。用 `.cjs`：Electron 42 以 `.mjs` 为入口时脚本挂住（实测），`.cjs` 正常。
- 入库产物凭据扫描：`code/scan_credentials.mjs`（AC-006 的复核命令，零命中退出码 0）。

分析期产物（含真实凭据，全部在 `.scratch/kimi-spike/`，不入库）：`network.jsonl`、`bodies/*.txt`、`storage.json`、`refresh_*.json`、`quota_probe_tokens.json`、`secrets.json`、`profile/`——均已按下方「凭据销毁」处置。

**凭据销毁（AC-006 后半句）**：分析完成后已执行（2026-09-15），记录如下。

|对象|处置|理由|
|---|---|---|
|`.scratch/kimi-spike/profile/`（Chrome 持久 profile，含登录 cookie 与 localStorage 令牌）|已删除（30 MB）|持活动会话|
|`secrets.json`、`quota_probe_tokens.json`、`refresh_*.json`、`storage.json`、`summary.json`|已删除|含真实 access/refresh token|
|`bodies/*.txt`（含 QR-status 响应体与前端 bundle 副本）、`network.jsonl`（含请求头）、`token.js`、`utils.js`|已删除|含真实令牌与凭据头|
|`*.log`（探针 stdout）|保留|只含 token 的 sha256 前 8 位与 exp，无明文|
|`docs/findings/`、`docs/spikes/s039_*/report.md`、`code/*.mjs`|保留（入库）|结论与可复现脚本|

复核命令（零命中即退出码 0）：`node docs/spikes/s039_kimi_web_bearer_mint_probe/code/scan_credentials.mjs`——扫描入库产物 11 个文件的 JWT 结构、cookie 名值、`Bearer` 头、`x-msh-*` id 特征；同时 `grep -rlE "eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\." .scratch/kimi-spike` 无命中。

## 证据

### 1. 登录下发点：QR-status 响应直接返回双令牌

`POST https://auth.kimi.com/api/account.gateway.v1.AuthService/GetLoginQRCodeStatus` 在扫码确认后返回（JWT 值已脱敏）：

```json
{
    "status": "STATUS_SUCCESS",
    "accessToken": "<JWT:606b>",
    "refreshToken": "<JWT:607b>",
    "userId": "<已脱敏>"
}
```

时间线：`GetLoginQRCodeStatus`（相对时间 54s，200）后，首个带 Bearer 的请求 `apiv2/...UserService/GetCurrentUser` 立即出现，Bearer `exp_in=900s`。两者之间无任何其它 `kimi.com` 请求——Bearer 确实来自该响应。

### 2. 运行期续期接口：存在、纯 HTTP 可用

`POST https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken`（ConnectRPC JSON；`AUTH_API_HOST=https://auth.kimi.com`，来自前端 bundle）

脚本 `refresh_probe.mjs` 的 `try_refresh` 固定发送 `connect-protocol-version` / `content-type` / `Accept` / `Origin` / `Referer`，因此 `refresh_probe` 各行**不是**最小请求；最小性结论由 `error_probe.mjs` 的 E5~E8 支撑。

|样本|脚本|请求差异|结果|
|---|---|---|---|
|minimal_camel|`refresh_probe.mjs`|connect + content-type + Accept + Origin/Referer + `{"refreshToken": "..."}`|200，返回 `{accessToken, refreshToken}`|
|with_headers_camel|`refresh_probe.mjs`|同上|200|
|with_headers_snake|`refresh_probe.mjs`|头与 `minimal_camel` 相同；仅请求体字段名改 `refresh_token`|200（两种字段名都接受）|
|E7 only content-type|`error_probe.mjs`|**只带 `content-type: application/json`**|200（最小请求）|
|E6 无 Origin/Referer|`error_probe.mjs`|connect + content-type|200|
|E8 只带 connect-protocol-version|`error_probe.mjs`|缺 content-type|415|
|E5 无任何自定义头|`error_probe.mjs`|——|415|

即：必需头只有 `content-type: application/json`；`connect-protocol-version`、`Origin`、`Referer` 均可省。

- 新 access token `exp-iat=900`；新 refresh token `exp-iat=7776000`（90 天）。
- **refresh token 轮换**：响应中的 refreshToken 与入参不同；用旧 refreshToken 再刷一次仍 200（非严格单次即废）。
- 错误形态：无效 refreshToken → 401 `{"code":"unauthenticated","details":[...]}`（无 message 字段）；空值 → 400 `invalid_argument`。

### 3. quota 口只认 Bearer；cookie 不能换令牌（候选路径 3 的否定样本）

`code/cookie_probe.mjs` 复用探针一的持久化 profile 读真实登录 cookie（6 个，不打印值），构造候选路径 3 的否定样本：

|样本|请求|结果|
|---|---|---|
|C1|`RefreshToken`：**仅带登录 cookie**（无 refreshToken 字段）|400 `invalid_argument`，无 accessToken|
|C2|`GetSubscriptionStats`：**仅带登录 cookie**（无 Authorization）|401 `unauthenticated`|
|C3|`RefreshToken`：仅带 refreshToken（无 cookie），对照|200，返回 `{accessToken, refreshToken}`|

即：**cookie 既不能换新 Bearer，也不能取数；cookie→Bearer 的 exchange 口不存在**（否定判据见上表 + s036 的 cookie-only 401 记录）。quota 口与续期端点都只认令牌本身。

|样本|请求|结果|
|---|---|---|
|B1|仅 `Authorization: Bearer <新 access>`（无 cookie、无 `x-msh-*`）|200，696 字节，含 `ratelimitCode5h`/`ratelimitCode7d`/`subscriptionBalance`|
|B2|Bearer + 从 JWT 取 ssid/device（JWT 里其实没有，等同 B1）|200|
|N1|有效 Bearer|200|
|N2|篡改签名的 Bearer|401 `token signature is invalid`|
|N3|无 Authorization|401|
|N4|垃圾 Bearer|401|

结论：quota 口认证只需 Bearer；cookie、`x-msh-session-id`、`x-msh-device-id` 均非必需。access/refresh JWT 的 payload 里不含 ssid/device_id（登录时的 access token 曾带这两个 claim，刷新出的不带）。

### 4. 前端实现（静态佐证）

`token-*.js`：`REFRESH_TOKEN_KEY="refresh_token"`、`ACCESS_TOKEN_KEY="access_token"`、`USER_ID_KEY="msh_user_id"`（三者都写 localStorage）；`refreshAccessToken()` 调用 `createClient(AuthService, createConnectTransport({ baseUrl: AUTH_API_HOST + "/api" })).refreshToken({refreshToken})`，成功后 `setToken({accessToken, refreshToken})`。页面登录后 localStorage 实际键名与之一致（含 `access_token`、`refresh_token`、`msh_user_id`）。

### 5. 页面自身续期行为

20 分钟抓包窗口（`code/probe.mjs`，相对时间轴）：

- 0~54s：扫码登录，`GetLoginQRCodeStatus` 返回双令牌，Bearer 代际 1（`7b79c792`，`exp_in=900s`）。
- 54~1136s：页面空闲，**没有任何请求，也没有刷新**——Bearer 在 954s 实际过期后页面仍未续期。
- 1136s：手动刷新页面 → 页面自行调用 `AuthService/RefreshToken`（响应含 2 个 JWT）→ 随后 `GetCurrentUser` 携带新 Bearer（代际 2，`b3874823`，`exp_in=900s`）。

即：**页面是懒刷新**（只在需要发请求时才续期，空闲不续期），且页面用的续期端点与本 spike 离线实测的端点完全一致。

### 6. 登录侧取 refresh token 的可行性

`code/login_storage_probe.cjs`（Electron，`contextIsolation: true` + `sandbox: true` + `nodeIntegration: false`，与 `src/main/index.ts` 登录窗一致）：

```json
{
    "execute_javascript_allowed": true,
    "read_value": "fake-refresh-token",
    "storage_keys": ["refresh_token", "msh_user_id", "access_token"],
    "cookie_count": 0
}
```

主进程 `webContents.executeJavaScript` 在登录窗同款配置下可读页面 localStorage；而 kimi SPA 确实把 `refresh_token` 写在 localStorage（第 5 节实测，页面续期就是读它）。故 t492 可在登录成功后从登录窗读取该键入库。

## 结论

- **可行，且不需要浏览器**。kimi 网页登录态是标准 refresh-token 型会话：登录响应给 `accessToken`（900s）+ `refreshToken`（90 天），续期就是 `AuthService/RefreshToken` 的纯 HTTP 调用，无需 cookie、无需 `x-msh-*`、无需 `Origin`/`Referer`，也不需要常驻浏览器或后台导航。
- **最小请求**：`POST https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken`，头 `content-type: application/json`，体 `{"refreshToken":"<token>"}`；200 返回 `{accessToken, refreshToken}`（必须落盘新 refreshToken）。

### AC-002：与 `device_code_oauth_manager` / `oauth_helpers` 的对接点与差异（逐项）

**结论：形态可对齐，实现不能直接复用**——下列四处差异必须由 t492 适配，否则 `refresh_now` 会以 `unexpected token response shape` 或 `no refresh_token stored` 失败，且得不到到期前调度。

|维度|现有实现（grok / kimi code）|kimi 网页会话|对接处置|
|---|---|---|---|
|请求协议|`post_form` + `form_encode`：`application/x-www-form-urlencoded`，`grant_type=refresh_token&client_id=…&refresh_token=…`（`oauth_helpers.ts:91-93`、`device_code_oauth_manager.ts:118-125`）|ConnectRPC JSON：`content-type: application/json` + `{"refreshToken":"…"}`（本报告第 2 节）|需 kimi 专属 refresh 实现；form 形态本 spike 未测，不应假定可用|
|响应字段名|`is_token_response` 只认 `access_token`；`is_error_response` 只认 `error`（`oauth_helpers.ts:79-89`）|成功体为 `accessToken` / `refreshToken`；错误体为 `{code:"unauthenticated"}` / `{code:"invalid_argument"}`（本报告第 2 节）|需 camelCase 适配与 `code` 型错误映射；verbatim 复用会被判为 shape 异常|
|`expires_at` 来源|`compute_expires_at` 依赖响应体 `expires_in`（`oauth_helpers.ts:137-140`）|响应体无 `expires_in`；有效期只在 JWT `exp`（access 900s、refresh 90 天）|需从 JWT `exp` 推导；否则 `expires_at` 为 `undefined`，`schedule_auto_refresh_if_enabled` 退化为 `REFRESH_RETRY_DELAY_MS`(60s) 轮询（`device_code_oauth_manager.ts:440-445`）|
|存储键|`OAUTH_TOKEN` / `OAUTH_REFRESH_TOKEN` / `OAUTH_EXPIRES_AT`（`oauth_helpers.ts:9-11`）|现有 kimi_web 凭据在 `SESSION_COOKIE` 的 JSON（cookie/authorization/session_id/device_id）|需决定：扩展该 JSON 加 `refresh_token`/`access_expires_at`，或新增独立键；本次不实现（t492 定）|
|`refresh_now` 返回值|`RefreshResult{success, error}`，内部 `refresh_in_flight` 去重 + `token_generation` 串行化（`device_code_oauth_manager.ts:321-377`）|同形态可用，但去重/串行化需按 kimi_web 实例维度实现|形态可对齐|
|401 即时刷新钩子|`refresh-service.ts:272-279` 的 `oauth_refresh` 门控为 `auth.method === "oauth_device"`，index.ts:412-423 只给 grok/kimi code 注册|kimi_web 是 `web_login`，该钩子**不会触发**|需扩展门控或改走 session 重登链（t492 定）|

- **不需要常驻浏览器上下文或后台导航**（AC-004 结论）：续期由应用进程直接发 HTTP 完成，与页面是否打开无关。
- **空闲无流量也能续期**（AC-005 结论）：续期不依赖页面产生流量；应用只要在 Bearer 到期前主动调用刷新接口即可。注意网页端自身是懒刷新（第 5 节），所以“应用主动续期”是唯一可靠路径。
- **s036/d057 的 token pump 方案作废**：不需要 partition 常驻监听，也不需要后台导航触发。
- 限制与可信度：实测为本机真实账号、单次会话；refreshToken 的 90 天期限与轮换的长期行为未做长时验证（中）；服务端字段名与端点属实测事实（高），若前端改版可能变更（低影响，失败可见）。
- 遗留待 t492 决定的问题：登录窗口现在只捕获 Bearer（不含 refresh token）。本 spike 已验证取法可行（第 6 节），t492 需选定实现路径并落地——候选：登录成功后对登录窗执行 `webContents.executeJavaScript("localStorage.getItem('refresh_token')")`，或从 `GetLoginQRCodeStatus` 响应体取；具体时机与失败回退由 t492 决定。

## 是否采纳

- 决定：是
- 理由：最小请求实测 200 且返回可用新 Bearer，quota 口用新 Bearer 取数成功；负样本证明认证真实生效。
- 后续 task：t492
