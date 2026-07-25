# Task plan

## 步骤与验证

1. 提取 `use-device-login.ts`（参数化 namespace），grok/kimi 改薄封装 -> 验证：OAuthDeviceForm 测试 + grok/kimi hook 行为不回归。
2. 提取共享 oauth-device-code 模块（接口 + helper + auto-refresh 引擎参数化 config），grok/kimi manager 改薄封装 -> 验证：`grok_oauth_manager.test.ts`（既有全套，回归网）+ `kimi_oauth_manager.test.ts` 全绿。
3. `pnpm test` 全绿 -> 验证：CI 命令。

## 风险与回退

- 风险：grok auto-refresh / token generation / mutation tail 行为字节级回归。 -> 回退：grok 既有 30+ 用例做回归网；任何行为差异立即 abort 重构、保留原实现。
- 风险：过度抽象（参数化 config 过深反而难读）。 -> 回退：只抽真正逐字重复的 helper；config 注入限于 URL/client_id/scope/设备头/refresh body 差异。
- 风险：kimi 设备头（X-Msh-\*）与 device_id 注入需在 config 表达。 -> 回退：config 含 `build_headers?: () => Promise<Record<string,string>>` 钩子，kimi 注入设备头，grok 不注入。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：auth 小节补「grok/kimi 共享 oauth-device-code 引擎 + 各自 config」。
- `docs/specs/connector-auth.md`：oauth_device device-code 流程描述更新（共享引擎）。
