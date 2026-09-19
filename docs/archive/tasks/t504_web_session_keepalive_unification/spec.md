# Task spec

## 背景

目前系统内所有基于网页登录的连接器（`capabilities: ["session"]`，包括 `opencode_go`、`mimo`、`kimi_web`）的会话生命周期管理严重割裂，缺乏统一的保活机制：

1. **认证失效判定漏判**：`is_auth_error` 仅匹配固定的 4xx 及部分中文词，`opencode_go` 抛出的 `Cookie 可能已失效，未跳转到 workspace` 与 `mimo` 在业务码非 0 时直接透传服务端文案（`usage_result.message` 或兜底 `MiMo usage response invalid`，无法稳定判定失效）均未被归类为认证错误，导致调度器（`refresh-service`）将其当作普通网络故障重试 3 次后直接标记失败，完全跳过了会话自动重登与保活调度。
2. **特例硬编码与能力割裂**：`kimi_web` 因 15 分钟短效 Token 被单独硬编码了 HTTP refresh_token 换票及 `hidden: true` 后台隐藏窗口重登（`auth-ipc.ts` 和 `session-manager.ts` 存在大量 `if (provider === "kimi_web")` 特例）；而 `opencode_go` 与 `mimo` 仅存一份静态 Cookie 快照，既无后台静默换票，也未接入后台无头重登，Cookie 过期后立即不可用。
3. **架构缺失**：所有会话型 Web 连接器在本质上具有一致的生命周期，应收敛至统一的「Web 会话保活管线（Session Lifecycle Pipeline）」：优先协议换票 -> 次选后台隐藏窗口自动轮换 -> 终选降级用户交互弹窗。

## 契约区

### 范围

- **统一认证失效错误判定**：扩展 `src/shared/lib/auth-error.ts` 中的 `is_auth_error`，收敛覆盖 `cookie`、`失效`、`session`、`未跳转`、`workspace` 等会话失效判定，保持无误报边界；规范 `opencode_go` 与 `mimo` 连接器的认证失效抛错口径。
- **抽象统一 Web 会话保活模型**：消除 `auth-ipc.ts` 和 `session-manager.ts` 中关于 `kimi_web` 的硬编码分支，重构为基于 `capabilities: ["session"]` 的通用保活状态机。
- **后台隐藏窗口自动保活（Headless Keep-Alive）**：当会话类连接器因凭据失效触发自动重登（`options.auto === true`）时，统一拉起后台隐藏窗口（`hidden: true`）在隔离 partition 内静默加载登录/续期路由，利用站点自身 SSO/Session 轮换机制更新 Cookie。
- **捕获即关窗与安全超时**：所有 session 连接器在后台重登模式下均启用 `close_when_credential_refreshed`（捕获并通过校验后立即关窗写回 Vault 并触发重试），超时（如 30s）未换到新凭据则销毁窗口并降级。
- **保留并泛化 Tier 1 协议换票**：保留并抽象 `kimi_web` 的 refresh_token 换票能力，确保旧行为无缝兼容且测试全绿。
- **自动化测试套件**：补齐 `opencode_go`、`mimo` 以及 `kimi_web` 在会话失效判定、静默保活、降级提示等场景下的单元与集成测试。

### 非范围

- 不修改各连接器的指标采集业务口径（用量窗口、百分比计算、重置时间等）。
- 不修改设备码 OAuth 类连接器（grok / kimi code）的已有链路。
- 不改变用户在设置界面中主动点击「网页登录」时的可见弹窗人机交互行为。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`is_auth_error` 能够将 `opencode_go`（如 `Cookie 可能已失效，未跳转到 workspace`）以及 `mimo` 规范后的未登录/凭据失效错误正确判定为认证错误（返回 `true`）。
- [ ] AC-002：当 `opencode_go` 或 `mimo` 采集报错为认证失效时，`refresh-service` 正确识别并触发 `sessionLogin` 自动重登流程，不再仅当普通异常耗尽重试。
- [ ] AC-003：调度器触发的自动重登（`options.auto === true`）对所有 session 类连接器均使用后台隐藏窗口（`hidden: true`）在对应持久化 partition 内静默执行，不弹出可见窗口。
- [ ] AC-004：后台隐藏窗口一旦捕获到经校验有效的新凭据，立即关闭窗口并将新凭据写入 Vault，随后当前采集轮次自动重试并产出最新用量观测。
- [ ] AC-005：后台隐藏窗口在超时时间内未捕获到新有效凭据时，自动销毁窗口，终态标记为 `failed` 且用户可见文案统一为「凭证失效，请重新登录」。
- [ ] AC-006：移除 `auth-ipc.ts` / `session-manager.ts` 中针对 `kimi_web` 的硬编码特例分支，重构为基于连接器能力的统一会话管理器，`kimi_web` 既有的 refresh_token 换票与 Bearer 刷新测试回归通过。
- [ ] AC-007：新增针对 `opencode_go` 与 `mimo` 会话失效自动保活链路（成功换票与超时降级分支）的自动化测试，断言新旧凭据差异与窗口销毁行为。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：用户问题排查（OpenCode Go 采集失败，Cookie 失效报错；MiMo 同类缺乏保活；Kimi Web 存在硬编码特例）。
- 既有设施：
    - `src/shared/lib/auth-error.ts`（认证失效正则判定）
    - `src/main/core/scheduler/refresh-service.ts`（调度器与 `sessionLogin` 触发链）
    - `src/main/ipc/auth-ipc.ts`（`trySilentCookieRefresh` 与 `handleCookieLogin`）
    - `src/main/core/session/session-manager.ts`（窗口生命周期、webRequest 捕获与有效性验证）
    - `connectors/opencode_go/connector.ts`、`connectors/mimo/connector.ts`、`connectors/kimi_web/connector.ts`
- 相关历史 task：t337（OpenCode 登录有效性校验）、t464（Kimi Web 连接器）、t469（Wildcard cookie 静默刷新）、t492（Kimi Web Bearer 续期与假成功修正）。

### 有意不测

- 外部站点的真实人机交互登录过程（验证码/扫码等）：以 mock/fake BrowserWindow 与 webRequest 事件覆盖。

### 测试策略

- 单元测试：扩展 `tests/unit/shared/auth-error.test.ts` 覆盖各类会话失效报错特征。
- 会话管理测试：扩展 `tests/unit/session/session-manager.test.ts` 断言通用 `hidden: true` 与 `close_when_credential_refreshed` 行为。
- 调度层测试：扩展 `tests/unit/scheduler/refresh-service.test.ts` 与 `tests/integration/scheduler/refresh-service.test.ts` 断言会话失效后自动重登、凭据换新重试成功以及未换新降级行为。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：后台拉起隐藏窗口若缺乏严格生命周期控制（如未能自动关窗或超时泄露），会导致内存/进程泄漏。
- 回退：确保无论成功、失败还是超时均走 `finally` / 定时清理强关窗口；如遇不可控问题可降级回仅限交互式登录。

### 依赖与约束

- 无外部新增依赖，使用 Electron 已有的 BrowserWindow 和 session API。

### Finalization 时更新的 blueprint

- 无
