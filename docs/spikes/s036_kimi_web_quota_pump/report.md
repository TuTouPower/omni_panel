# Spike report

## 问题

Kimi 网页登录模式是否可行：quota 数据口形态、会话凭证形态、Bearer 续期口子。

## 成功判据

- quota 三窗口字段形态有实测样本（脱敏）。
- Bearer 获取/续期路径有可实现结论（非猜测）。

## 尝试

- 用户浏览器全量抓包 ×2（`data/capture_20260909_052941.zip`、`data/capture_20260909_053303.zip`，运行数据不入库）：确认端点清单与协议，响应体均不可得（工具 `redact_data` 下 body 全灭，重抓无意义）。
- Playwright 有头浏览器用户扫码登录 + 会话复用：确认 profile 落盘无会话值（mock keychain 下 Cookie 值全空），会话只活在进程内存。
- 用户 Copy-as-cURL 重放：`GetSubscriptionStats` / `GetSubscription` / `ListSubscriptions` 真响应落袋（密钥已 shred，脱敏样本进 `code/`）。
- 纯 Cookie 调 apiv2 三接口：全 401（`REASON_INVALID_AUTH_TOKEN`）。
- 代码核实：`src/main/index.ts:650-668` 登录 partition 经 `on_before_send_headers` 全量透出请求头；`session-manager.ts:149` 已只信任 webRequest 捕获。

## 证据

- `code/GetSubscriptionStats.json`：`ratelimitCode5h{ratio,enabled,resetTime}`、`ratelimitCode7d{同构}`（ratio 0~1 小数）、`subscriptionBalance{amountUsedRatio,kimiCodeUsedRatio,expireTime}`（月周期锚点）。
- `code/GetSubscription.json` / `code/ListSubscriptions.json`：30 天订阅周期（`currentStartTime/currentEndTime`）与余额。
- Bearer 仅 15 分钟有效（JWT `exp-iat=900`）；抓包请求头证明页面每次调 apiv2 自带有效 `authorization`。
- 失效样本：401 `{code:unauthenticated, REASON_INVALID_AUTH_TOKEN, Session expired}`（Cookie-only 实测）。

### 可复核请求模板（占位符）

```http
POST https://www.kimi.com/apiv2/kimi.gateway.membership.v2.MembershipService/GetSubscriptionStats
connect-protocol-version: 1
content-type: application/json
authorization: Bearer <REDACTED_JWT>
x-msh-session-id: <REDACTED_SESSION_ID>
x-msh-device-id: <REDACTED_DEVICE_ID>
cookie: <REDACTED_COOKIE_HEADER>

{}
```

`GetSubscription` 与 `ListSubscriptions` 使用同一 host、协议和认证头集合，仅替换 RPC 方法名。实验期曾直接观察到 JWT 的 `exp - iat = 900` 秒；真 JWT、Cookie 值、session/device 值均已销毁，入库 fixture 只保留脱敏后的响应结构。

## 结论

- 可行。quota 口：`POST www.kimi.com/apiv2/.../GetSubscriptionStats`（ConnectRPC JSON，空 `{}`，需 Bearer + x-msh-session-id + Cookie）。
- 有效 Cookie 名：本次实验未观测到“仅凭 Cookie 即可调用 quota 口”的有效 Cookie 名；保留的 Cookie 仅作为页面会话材料，Cookie-only 调用三接口均 401。实际 quota 认证凭证是 Bearer，另需 `x-msh-session-id`、`x-msh-device-id`。
- 续期：token pump——实例 partition 复用现有 `on_before_send_headers` 拦截 `apiv2/*` 的 `authorization` 头写 vault；connector 读 vault；401 走现有自动重登链。无需找隐藏刷新接口。
- 限制/可信度：拦截点为现成 API（高）；空闲无流量时无新 Bearer 可抄，需后台导航触发一次（中，留 t464 验证）；页面改版风险同 opencode_go 类（低影响，有失败可见性）。
- QR-status 轮询下发 hypothesis 已废弃（pump 更直接）。

## 是否采纳

- 决定：是
- 理由：契约实测 + 续期路径有现成 API 支撑
- 后续 task：t464
