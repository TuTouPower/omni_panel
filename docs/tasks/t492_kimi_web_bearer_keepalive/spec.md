# Task spec

## 背景

kimi_web 的 quota 认证凭证是 15 分钟寿命的 Bearer JWT，只在受控登录窗口打开时捕获一次。运行期没有任何续期通道，且 `trySilentCookieRefresh` 对 kimi_web 的判定是「`authorization` 字段非空即算可用」——它原样保留过期 Bearer 却返回成功，使 `refresh-service` 的 401 自动重登链用同一个过期令牌重试一次后落 `failed`，全程不打开登录窗。结果是：添加账号后约 15~20 分钟采集固定失败，只能由用户手动重跑「网页登录」恢复（复现与证据见 `docs/pending/todo/p235_kimi_web_bearer_no_keepalive.md`）。

本 task 让 kimi_web 具备无人值守的 Bearer 续期能力，并修正静默刷新的假成功语义。续期通道形态（复用现有 HTTP token 续期设施，或按 s036/d057 的 token pump 在实例 partition 拦截请求头）由 t491 的实测结论决定。

## 契约区

### 范围

- 为 kimi_web 增加 Bearer 续期通道：在运行期产出新 Bearer 并写回 `SESSION_COOKIE` 的 JSON 凭据，使采集不再依赖用户手动重登。形态按 t491 结论实现。
- 修正 `trySilentCookieRefresh` 对 kimi_web 的「非空即有效」判定：无法产出可用新 Bearer 时不得报告成功。
- 修正 401 自动重登链语义：重登后重试必须使用新 Bearer；未换到新 Bearer 时不计入成功重登，也不得因此耗尽重试预算后静默失败。
- 替换 t469 把「原样保留过期 authorization」当期望的假绿测试，并补齐覆盖新语义的测试。
- 清理与本缺陷同源的死代码：`session-manager.ts` 中 kimi_web 分支的空 `if` 块。
- 续期相关的失败对用户可见且可操作（保留既有「凭证失效，请重新登录」入口，不出现裸 HTTP 状态码文案）。

### 非范围

- 不改 quota 接口、指标口径（5 小时/周/月）、登录页地址与登录窗口交互。
- 不改 opencode_go / mimo 等其它 session 连接器的凭据格式与刷新语义。
- 不改 grok / kimi code 的 device-code OAuth 链路。
- 不引入新的连接器认证方式（如把 kimi_web 改为 oauth_device）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：kimi_web 实例的 Bearer 过期后，无需用户手动重登即可在后续刷新轮次中重新产出有效观测。
- [ ] AC-002：当续期通道无法产出可用新 Bearer（过期或缺失）时，静默刷新路径不报告成功——调用方不得据此认为凭据已更新。
- [ ] AC-003：采集因 401 触发自动重登并成功时，重试请求携带的 Bearer 与失败那次不同；未能换到新 Bearer 时该轮不计入成功重登。
- [ ] AC-004：续期写回凭据时保留未产生新值的 `session_id`、`device_id`，且更新后的 cookie 仍可用于采集。
- [ ] AC-005：自动化测试覆盖 AC-002 / AC-003 / AC-004 的正反分支；t469 遗留的假绿用例被表达新语义的用例替换（旧用例整体删除或重写，不得就地把预期改成当前实现输出）。
- [ ] AC-006：续期失败时用户可见提示不含裸 HTTP 状态码（如 `HTTP 401: request failed`），且「重新登录」入口仍可触发。
- [ ] [deploy] AC-007：真实 kimi_web 实例连续运行超过 Bearer 有效期（≥20 分钟）后仍持续产出观测，期间无手动重登操作。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：可自动测试——以过期 Bearer 凭据驱动真实 `refresh-service` 与真实 connector，断言续期后重试成功产出观测。
- AC-002：可自动测试——以过期/缺失 Bearer 驱动真实 `trySilentCookieRefresh`，断言不返回成功。
- AC-003：可自动测试——断言两次请求携带的 Bearer 不同；未换新时断言该轮不判定为重登成功。
- AC-004：可自动测试——断言写回后的 JSON 保留 `session_id`、`device_id`，且 cookie 字段被更新。
- AC-005：可自动测试——测试本身即证据。
- AC-006：可自动测试——渲染层断言错误提示文案与「重新登录」入口可见。
- AC-007：不可自动测试。需真实账号、真实后端与长时运行，自动化环境无法自证；替代验证为部署后人工跑一次 ≥20 分钟的连续采集记录（附日志时间线），由 reviewer 复核。

## 上下文区

- 来源：`docs/pending/todo/p235_kimi_web_bearer_no_keepalive.md`（2026-09-15 核实）
- 复现证据：`.scratch/kimi-web-session/repro.test.ts`，`pnpm vitest run --config .scratch/kimi-web-session/vitest.repro.config.mts`——R1 静默刷新返回 `true` 且 authorization 逐字节未变（exp 早于当前 300 秒）；R2 真实 `refresh-service` + 真实 connector 下 Bearer 两次相同、登录窗 0 次、终态 `failed`。
- 续期形态依据：t491（`docs/tasks/t491_kimi_web_bearer_mint_spike/`）的实测结论；若结论为「无可用 HTTP 续期路径」，按 `docs/findings/d057_kimi_web_quota_api_contract.md` 与 `docs/spikes/s036_kimi_web_quota_pump/report.md` 的 token pump 方案实施。
- 既有设施：`src/main/core/auth/device_code_oauth_manager.ts`、`src/main/core/auth/oauth_helpers.ts`、`src/main/core/scheduler/refresh-service.ts`（`oauth_refresh` 钩子当前仅对 `auth.method === "oauth_device"` 生效）、`src/main/ipc/auth-ipc.ts`（`trySilentCookieRefresh`）、`src/main/index.ts:394`（`sessionLogin` 接线）。
- 相关历史 task：t464（连接器与凭据捕获）、t469（wildcard 静默刷新修复，其 AC-002 用例即假绿来源）。

### 有意不测

- 真实 kimi 账号的交互式登录过程：本 task 的回归点是续期分支与凭据写回，用 mock/fixture 覆盖；不依赖真实账号。
- 无 display 环境（web/headless）下的续期行为：沿用既有已知降级（`docs/guides/cli-mode.md`），本 task 不改变该降级语义。

### 测试策略

- 使用真实 `trySilentCookieRefresh` + fake Electron session cookie store，覆盖过期/缺失/新鲜 Bearer 三种输入。
- 以 Kimi 凭据 JSON（含过期 JWT fixture）驱动真实 `createRefreshService`，断言重登后重试的 Bearer 与首次不同、失败时终态与错误可见。
- 凭据 fixture 全部脱敏；断言日志与错误信息不含 token/cookie 明文。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 新 Bearer 的获取通道（HTTP mint 接口是否存在；不存在时的 partition 拦截点与空闲触发方式）：`UNVERIFIED-BLOCKING`，待 t491 结论；核实后改写为结论与验证方式。

### 风险与回退

- 风险：token pump 需要常驻 partition 监听与后台导航，可能带来额外资源占用或触发页面反感；若续期依赖浏览器上下文，纯 CLI/headless 模式仍无法续期。
- 回退：保留现有手动「网页登录」入口与 `trySilentCookieRefresh` 的 cookie 刷新能力；续期通道失败时按 AC-002/003 显式失败并提示重登，不回退到静默假成功。

### 依赖与约束

- 前置：t491 完成并给出续期形态结论（`depends_on: t491`），未完成前不得 start。
- 涉及鉴权凭据写入与持久化，按 `full` 级 review。
- 凭据只入 vault；日志、错误信息、fixture 均不得出现真实 JWT/cookie/session/device 值。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：session 类连接器续期能力的现状（若本 task 改变了该描述）。
- `docs/specs/connector-session.md`：后台续期章节由「未实现」更新为实际能力与边界。
