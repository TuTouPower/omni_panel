# Task spec

## 背景

kimi_web 网页连接器的认证凭证是 15 分钟寿命的 Bearer JWT（`exp-iat=900`），运行时只有一个来源：受控登录窗口的一次请求头捕获。窗口关闭后无任何续期通道，静默刷新只重读 cookie、原样保留过期 Bearer 却报成功，导致 Bearer 一过期采集即 401 且自动重登链空转（详见 `docs/pending/todo/p235_kimi_web_bearer_no_keepalive.md`）。

当前既定方案是 s036/d057 的「token pump」：在实例 partition 常驻拦截 `apiv2/*` 的 `authorization` 头抄写新 Bearer，空闲无流量时还需后台导航触发。但项目已有一整套 HTTP token 续期基础设施（`device_code_oauth_manager` 的 `refresh_now` + expires_at 驱动的自动刷新调度）。若网页端存在「会话/cookie → 新 Bearer」的 HTTP 接口，即可直接复用该套续期，避免常驻浏览器上下文与后台导航。

本 task 只回答「该 HTTP 续期路径是否存在、契约形态、能否复用」，并给出 t492 的实施依据；不实现续期通道。

## 契约区

### 范围

- 验证 kimi 网页登录态能否通过 HTTP 换取新的 Bearer，候选路径至少覆盖：
    1. 登录阶段的下发点——`auth.kimi.com` 的 `GetLoginQRCodeStatus` 响应是否直接携带令牌，或携带可交换令牌的材料；
    2. 运行期续期点——网页端保持在线时如何获得新 Bearer，是否存在 refresh token 型接口；
    3. 静态 cookie 会话能否换取新 Bearer（s036 已实测 cookie-only 调 apiv2 为 401，需确认是否存在其它可用的 exchange 口）。
- 给出每条候选路径的实测证据或明确否定证据，并写明能否由现有 `device_code_oauth_manager` 同套机制承接。
- 若 HTTP 路径不可用，给出否定判据，并明确 t492 按 token pump 实施的依据。
- 结论写入 `docs/findings/`；spike 过程与脱敏证据留 `docs/spikes/`。

### 非范围

- 不修改任何生产代码（`src/`、`connectors/` 一律不动）。
- 不实现 token pump，也不实现 HTTP 续期通道。
- 不改 kimi_web 连接器、manifest、指标口径与登录流程。
- 不修 `trySilentCookieRefresh` 的假成功语义（归 t492）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：对范围中每条候选续期路径给出「存在 / 不存在」结论，并附可复核的原始证据（脱敏请求/响应片段、时间戳，或明确记录该路径被实测否定的过程）；无证据的推测不计入结论。
- [ ] AC-002：若存在可用 HTTP 续期路径，结论给出其请求形态——endpoint、认证材料来源、请求体关键字段、响应中令牌位置与有效期，并逐项说明与 `device_code_oauth_manager`（token 存储键、`expires_at` 语义、`refresh_now` 返回值）的对接点与差异。
- [ ] AC-003：若不存在可用 HTTP 续期路径，结论给出否定判据——列出被排除的路径及排除依据，并明确 t492 应按 token pump 实施。
- [ ] AC-004：结论明确说明续期是否需要常驻浏览器上下文或后台导航；需要时给出最小触发条件（导航目标、触发时机、可观测的失败特征）。
- [ ] AC-005：结论覆盖「空闲无流量」场景——长时间无页面交互时能否仍获得新 Bearer；不能时写明失败特征与用户可观测表现。
- [ ] AC-006：入库产物不含可用真实凭据：JWT、cookie 值、session/device id 一律不得进入 `docs/`；抓包原值与临时样本销毁。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：不可自动测试。需真实账号在线实测 kimi 网页登录与会话续期行为，依赖人工扫码登录与浏览器抓包；替代验证为 `docs/spikes/` 下实测记录与脱敏证据，由 reviewer 复核证据与结论一致。
- AC-002：不可自动测试，同上；替代验证为结论中的请求形态与 `src/main/core/auth/` 现有实现逐项对照。
- AC-003：不可自动测试，同上；替代验证为否定判据的逐条证据。
- AC-004：不可自动测试，同上。
- AC-005：不可自动测试，同上；替代验证为长时空闲实测记录（须写明观测时长与观测方式）。
- AC-006：可自动测试——对入库产物做凭据形态扫描（JWT 结构、cookie 名值、session/device id 特征）并断言零命中。

## 上下文区

- 来源：`docs/pending/todo/p235_kimi_web_bearer_no_keepalive.md`（2026-09-15 核实；含最小复现 `.scratch/kimi-web-session/repro.test.ts` 与既有续期设施盘点）
- 既有契约来源：`docs/findings/d057_kimi_web_quota_api_contract.md`、`docs/spikes/s036_kimi_web_quota_pump/report.md`——其「QR-status 轮询下发」假设曾被判为备选后废弃，但无否定证据。
- 离线抓包线索（2026-09-15 核查，未验证）：`data/capture_20260909_053303.zip` 中，成功的 `GetLoginQRCodeStatus`（相对时间 13929ms）与首个带 Bearer 的 `GetCurrentUser`（14151ms）之间无任何其它 kimi.com 请求，Bearer 疑似在 QR-status 响应中下发；同批抓包含登录前 cookie-only 调 apiv2 返回 401 的记录。抓包响应体未捕获、JWT 全被 redact，无法离线证实。
- 待复用设施：`src/main/core/auth/device_code_oauth_manager.ts`、`src/main/core/auth/oauth_helpers.ts`（token 存取与 `expires_at` 语义）、`src/main/core/scheduler/refresh-service.ts` 的 `oauth_refresh` 钩子（当前触发条件硬编码 `auth.method === "oauth_device"`）。

### 有意不测

- 在线续期实测本身：依赖真实账号、真实后端与人工操作（扫码登录、长时空闲），不写成自动化测试；由 spike 记录与 reviewer 复核承载。

### 测试策略

- 本 task 不新增产品测试；仅对入库产物做脱敏扫描（AC-006），实现方式按项目默认。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- kimi 网页端的新 Bearer 下发/续期接口：`UNVERIFIED-SPIKE`，本 task 即该验证；结论与验证方式写入 `docs/findings/` 后替换本行。

### 风险与回退

- 风险：真实账号与在线抓包依赖人工操作，可能无法覆盖「长时间空闲后页面自身是否续期」；网页端实现变更会让结论短期失效；抓包工具对响应体/认证头脱敏，可能取不到令牌内容。
- 回退：spike 无生产改动；若关键证据无法取得，结论写「未验证 + 已排除路径清单」，t492 据此直接按既定 token pump 实施，不阻塞。

### 依赖与约束

- 需用户配合完成真实账号扫码登录与在线抓包；空闲续期观测需用户保持会话在线。
- 凭据零入库：样本一律脱敏，原值销毁；spike 产物入库前做形态扫描。
- 结论直接决定 t492 的实施形态，t491 未完成前 t492 不得启动。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：session 类连接器续期能力现状与 kimi_web 的差异（仅在结论改变该描述时更新）。
