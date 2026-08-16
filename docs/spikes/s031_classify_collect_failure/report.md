# Spike report

## 问题

核实账号行 `is_auth_error` 是否覆盖 Grok 实际 401 错误文案，以及 refresh-service 是否能取得 Grok/Kimi OAuth manager 做即时刷新。

## 成功判据

- 读取连接器 HTTP 错误生成路径，确认 401 与网络错误实际文案。
- 读取 renderer 判定规则、refresh-service 失败路径和 OAuth manager 接线，确认可调用入口与改动位置。

## 尝试

- 读取 `src/main/core/connector/net-client.ts`、`connectors/grok/connector.ts`、`src/renderer/components/provider_card_states.tsx`、`src/main/core/scheduler/refresh-service.ts`、`src/main/index.ts`。
- 读取现有 renderer、scheduler、OAuth manager 测试，核对覆盖与依赖注入模式。

## 证据

- `net-client.ts` 对 HTTP 错误生成 `HTTP <status>: request failed (<bytes> bytes)`；Grok script 通过 `report_failed_account` 上报该错误，因此 401 进入 `failed_accounts`，不走 refresh-service 的 `catch`。
- renderer `is_auth_error` 当前只匹配 token、credential、unauthorized、auth、凭证、登录、密钥，不匹配 `HTTP 401: request failed (...)`；超时文案 `ETIMEDOUT`、`socket hang up` 不命中。
- refresh-service 当前 `is_auth_error` 匹配 401/403 等，但仅在抛错路径使用；OAuth manager 未注入 deps。`main/index.ts` 先创建 Grok/Kimi manager，再创建 refresh-service，两个 manager 均提供 `refresh_now(instance_id)`。
- Grok/Kimi OAuth manifest 使用 `auth.method = oauth_device`；OAuth auth 失败可通过 provider 与 instance_id 映射到对应 manager。manager 自带 per-instance refresh 去重与 token mutation 串行化。

## 结论

- 第一个未知契约已验证：renderer 判定需补齐 HTTP 401/403 及现有调度层认证错误语义，同时保持连接超时与普通 5xx 为非认证错误。
- 第二个未知契约已验证：现有依赖注入通道不存在，但可在 `RefreshServiceDeps` 注入按 connector definition/instance id 调用 `refresh_now` 的回调；主进程已有 manager 实例且创建顺序满足接线。
- OAuth script 连接器的即时刷新触发点必须覆盖 `failed_accounts` 路径；不能只改 `catch` 中的 auth 分支。

## 是否采纳

- 决定：是
- 理由：结论直接确定 t172 的最小实现边界与回归测试路径。
- 后续 task：t172
