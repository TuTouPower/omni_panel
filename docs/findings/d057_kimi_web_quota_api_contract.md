# d057 Kimi 网页 quota 接口契约（ConnectRPC JSON）

- 来源：日常（2026-09-09，用户浏览器 Copy-as-cURL 重放实测；t463 spike 输入）
- 结论：quota 数据走 `POST https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats`，ConnectRPC JSON（`connect-protocol-version: 1`，请求体 `{}`），需 `authorization: Bearer <JWT>` + `x-msh-session-id` + 常规 Cookie；回包含 `ratelimitCode5h{ratio,enabled,resetTime}`、`ratelimitCode7d{同构}`（ratio 为 0~1小数）、`subscriptionBalance{amountUsedRatio,kimiCodeUsedRatio,expireTime}`（月周期锚点）；`GetSubscription`/`ListSubscriptions` 给出订阅周期（`currentStartTime/currentEndTime`，30 天）与余额。失效特征：未登录/过期调配额接口回 401（抓包实测一次）。
- 证据：`.scratch/kimi-spike/fixture_desensitized/` 下三接口脱敏样本（id/比例/时间已改写，结构原样）；密钥脚本已 shred，仓库无真凭据。
- 影响：t464 `kimi_web` 连接器按此实现（月用量取 `amountUsedRatio`/`expireTime`）；`login_url` 用 `https://www.kimi.com/settings/subscription?tab=quota`。**关键约束**：Bearer 仅 15 分钟有效（`exp-iat=900`）；Cookie 调 apiv2 全面 401（配额/用户信息/订阅三接口实测，`REASON_INVALID_AUTH_TOKEN`）——会话保持只能保 Cookie 不过期，不等于拿到 Bearer。**续期方案（已定）**：token pump——登录会话活着，页面每次调 apiv2 都在请求头里带有效 Bearer，用 Electron `webRequest.onSendHeaders` 在实例 partition 上拦截 `www.kimi.com/apiv2/*` 的 `authorization` 头写入 vault；connector 只管读 vault，401 走现有自动重登链。QR-status 轮询下发为备选。待 t464 验证：空闲无流量时 Bearer 过期需后台导航触发一次请求。
- 复用机制（已验证存在）：mimo/opencode_go 同款 session 保持——`session-manager.ts` 按实例持久登录 partition + `auth-ipc.ts trySilentCookieRefresh` 静默刷 Cookie + `refresh-service.ts:420` 会话连接器 401 自动重登。Kimi 需在此链上加 Bearer 续期一环（Cookie 保活复用现成，缺的是会话→Bearer 的口子）。
- 复用机制（已验证存在）：mimo/opencode_go 同款 session 保持——`session-manager.ts` 按实例持久登录 partition + `auth-ipc.ts trySilentCookieRefresh` 静默刷 Cookie + `refresh-service.ts:420` 会话连接器 401 自动重登。Kimi 需在此链上加 Bearer 续期一环（Cookie 保活复用现成，缺的是 Cookie→Bearer 的 mint 口）。
- 现状：有效
