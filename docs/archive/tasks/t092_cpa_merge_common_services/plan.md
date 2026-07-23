# Task plan

## 步骤与验证

1. 红：加用例（弹窗内 CPA 出现在常用服务网格、无"高级方式"section、点 CPA 进标准 auth 表单含 monitor 参数）→ 验证：`pnpm vitest run` 相关用例失败。
2. `common-services.ts` 加 cpa 条目；`VENDOR_AUTH_MAP` 加 `cpa: "apikey"`；`AddAccountDialog.tsx` 删 `has_cpa`/`on_cpa` 与高级方式 JSX → 验证：网格用例转绿。
3. CPA monitor\_\* 参数迁入 ApiKeyForm 扩展或 CPA 参数子表单 → 验证：auth 表单用例转绿。
4. 调用方（SettingsView 等）删 `has_cpa`/`on_cpa` 透传 → 验证：`pnpm typecheck` 通过。
5. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：monitor\_\* 参数在标准 ApiKeyForm 中表达不完整（既有 CPA 账号编辑路径回归）；`has_cpa` 删除遗漏调用点。
- 回退：改动集中在弹窗与表单层，`git checkout` 还原。

## Finalization 时更新的 blueprint

- 无（UI 结构调整，无架构/约定变化）。
