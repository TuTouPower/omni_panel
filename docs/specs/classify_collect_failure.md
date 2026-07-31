# 采集失败区分凭证失效：重新登录门控 + OAuth 401 即时刷新

## 需求

账号行的「重新登录」入口对任意采集错误（超时、5xx、解析失败）都显示，与凭证失效呈现不可区分；OAuth(poll) 连接器 poll 收到 401 时无即时自救，只能等定时自动刷新，定时链断后每轮 poll 都 401 且无兜底。目标：重新登录按钮只对凭证失效类错误显示；OAuth 连接器 auth 错误时即时刷新 token 并重试采集。

## 行为

- 账号行「重新登录」按钮仅对凭证失效类错误（`is_auth_error`）显示；非凭证类采集错误只展示「已过期」/「采集失败」badge。
- OAuth(poll) 连接器（manifest `auth.method = oauth_device`）采集因 auth 错误（401/403）失败时，对该实例触发一次即时 `refresh_now`；刷新成功后本轮重新采集，成功则观测不标 stale。
- 即时刷新失败（refresh_token 终态失效、无 refresh token、网络仍不通）时退化为现有路径：历史观测标 stale、状态按失败处理。
- 每个实例每轮刷新周期至多一次即时刷新尝试，不引入重试风暴；与 OAuth manager 定时自动刷新并发安全（manager per-instance 去重 + token mutation 串行化）。

## 数据契约

- 凭证失效判定唯一口径 `src/shared/lib/auth-error.ts` `is_auth_error`：合并调度层 401/403/invalid\_\* 与渲染层中文凭证词；不用裸 `token`/`auth` 子串（防 `Unexpected token`、`oauth preflight skipped` 误报）。renderer 与 refresh-service 共用。
- `RefreshServiceDeps.oauth_refresh`：`(instanceId, definition) => Promise<RefreshResult | undefined>`；按 provider 映射 grok/kimi OAuth manager 的 `refresh_now`；非内置 oauth_device 连接器返回 undefined 走退化。

## 调用契约

- `refresh-service` 的 OAuth 即时刷新覆盖两条失败路径：script 连接器 `failed_accounts` 结果路径（grok/kimi 主路径）与 tier-1 poll 抛错路径；刷新成功时 `max_attempts + 1` 补一次重试预算（末轮刷新成功不空转）。
- `ProviderAccountRow.show_relogin_button` 增加 `is_auth_error(_error)` 门控；`provider_card_states.tsx` 的 `is_auth_error` 改为 re-export 共享实现。

## 边界与不变量

- 「已过期」badge 存在与 stale 标记机制不变（数据新鲜度语义不随本 spec 改变）。
- session 连接器 cookie 自动重登路径不变；OAuth manager 定时自动刷新调度与重试策略不变。
- 非 `oauth_device` 连接器 auth 错误不触发即时刷新（沿用 t155 不重试语义）。
- `is_auth_error` 对连接超时（ETIMEDOUT、socket hang up、TLS 断开）与 5xx 必须返回 false。

## 关联 task

- t172：采集失败分类修复（本 spec）。

## 验证

- `tests/unit/shared/auth-error.test.ts`：真实 net-client 文案分类 + 防误报。
- `tests/unit/renderer/components/provider_account_row.test.tsx`：401 显示按钮 / 超时不显示。
- `tests/unit/scheduler/refresh-service.test.ts`：failed_accounts 与抛错路径刷新成功重试/失败退化/每轮至多一次/末轮边界；非 oauth 不触发回归。
