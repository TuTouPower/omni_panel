# Task plan

## 步骤与验证

1. 红：加用例（manifest-loader 接受任意 snake_case provider 名并加载成功；renderer 对未知 provider 显示 fallback mark + provider 名 label 不崩）→ 验证：相关 vitest 用例失败。
2. 放开 `connectorProviderSchema`（snake_case regex 约束）；`usageProviderSchema` 同步策略定案并记录 → 验证：loader 用例转绿。
3. `PROVIDER_LABELS` / `PROVIDER_ORDER` 未知 provider fallback；`auto_seed_connectors` 确认 user_dir 不被 removedConnectorIds 拦截 → 验证：renderer/seed 用例绿。
4. 写 `docs/guides/custom-connector.md`（manifest schema + connector.ts 模板 + vm sandbox 约束 + 示例）→ 验证：文档含完整模板。
5. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：schema 放开是多层改动（renderer 聚合 / IPC / 配置 / provider-usage），未知 provider 在 trend / token-stats / label-map 等路径出现未兜底崩溃；`z.string()` 放开过度（大写/特殊字符 provider 名流入）。
- 回退：schema 改动集中，按 `git diff` 分块还原；必要时退回 enum + `z.literal` 扩展。

## Finalization 时更新的 blueprint

- `docs/guides/`：新增 `custom-connector.md`。
- `docs/blueprint/domain.md`：provider 标识从封闭枚举改为开放 snake_case 命名空间，需同步领域定义。
