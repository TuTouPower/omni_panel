# d060 Kimi 网页会话可用 HTTP 刷新接口续期 Bearer，无需浏览器上下文

- 来源：s039 spike（t491，2026-09-15 真实账号在线实测）
- 结论：Kimi 网页登录态是标准 refresh-token 型会话，可用纯 HTTP 续期，不需要常驻浏览器、不需要后台导航、不需要 cookie。刷新端点 `POST https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken`（ConnectRPC JSON，最小请求仅需 `content-type: application/json` + body `{"refreshToken":"..."}`），返回 `{accessToken, refreshToken}`：accessToken 有效期 900 秒，refreshToken 有效期 90 天且每次刷新都会轮换。同时 **Bearer 是 quota 口的唯一凭证**——只带 Bearer（无 cookie、无 `x-msh-session-id`/`x-msh-device-id`）即可 200 取到 5 小时/7 天/月全部数据。
- 证据：
    - 登录下发点：`GetLoginQRCodeStatus` 响应体 `{"status":"STATUS_SUCCESS","accessToken":"<JWT>","refreshToken":"<JWT>","userId":"..."}`（s039 抓包响应体，脱敏件见 `docs/spikes/s039_kimi_web_bearer_mint_probe/report.md`）。
    - 刷新实测：最小请求（仅 `refreshToken` 字段）返回 200 与两个新 JWT；`exp-iat=900`（access）、`exp-iat=7776000`（refresh）；响应中 refreshToken 与入参不同（轮换）；旧 refreshToken 再次刷新仍 200（非严格单次使用）。
    - 错误形态：无效 refreshToken → 401 `{"code":"unauthenticated"}`；空值 → 400 `invalid_argument`；缺 `content-type` → 415；**不需要** `Origin`/`Referer`/`connect-protocol-version`。
    - quota 口负样本：有效 Bearer 200（696 字节，含 `ratelimitCode5h`/`ratelimitCode7d`/`subscriptionBalance`）；篡改签名 401 `token signature is invalid`；无 Authorization 401；垃圾 Bearer 401。
    - cookie 不能换令牌（候选路径 3 否定样本，`code/cookie_probe.mjs`，用真实登录 cookie）：`RefreshToken` 仅带 cookie → 400 `invalid_argument`（无 accessToken）；`GetSubscriptionStats` 仅带 cookie → 401 `unauthenticated`；`RefreshToken` 仅带 refreshToken（无 cookie）→ 200（对照，证明 cookie 非必需）。
    - 前端实现（`statics.moonshot.cn/kimi-web-seo/assets/token-*.js`）：令牌存 localStorage 的 `access_token`/`refresh_token`/`msh_user_id`；续期即 `createClient(AuthService).refreshToken({refreshToken})`，`AUTH_API_HOST = https://auth.kimi.com`。
    - 页面自身行为（20 分钟抓包）：页面空闲 960 秒、Bearer 在 954 秒实际过期期间**未发任何请求、未续期**；手动刷新页面（1136s）后页面才调 `AuthService/RefreshToken` 并携带新 Bearer。即网页端是懒刷新，空闲不续期——应用侧续期必须自己主动发起。
- 影响：
    - t492 应实现 HTTP 续期（refresh 换 access 后写回 vault）；s036/d057 的「token pump」方案作废，不需要常驻 partition 监听与后台导航。
    - 现有续期设施**不能直接复用，需适配**：`device_code_oauth_manager.refresh_now` 走 form 编码（`grant_type=refresh_token`）而 kimi 端点要 JSON `{"refreshToken"}`；`is_token_response` 只认 `access_token` 而 kimi 返回 `accessToken`；`compute_expires_at` 依赖响应体 `expires_in` 而 kimi 无该字段（有效期只在 JWT `exp`）；`refresh-service` 的 `oauth_refresh` 钩子门控为 `auth.method === "oauth_device"`，kimi_web（`web_login`）不会触发。形态可对齐、实现需适配，逐项差异见 `docs/spikes/s039_kimi_web_bearer_mint_probe/report.md` 的「AC-002」小节。
    - kimi_web 连接器可去掉 cookie 与 `x-msh-session-id`/`x-msh-device-id` 的采集依赖（仅保留 Bearer；refresh token 用于续期）。cookie 既不能换 Bearer 也不能取数（cookie-only 实测 400/401）。
    - 现有 `kimi_oauth_manager`（device-code，`auth.kimi.com/api/oauth/token`）与网页会话是同 host 不同端点，不能直接互换令牌。
- 现状：有效
