# Task plan

## 步骤与验证

1. 写红测 `tests/unit/metric_record_error.test.ts`（MetricRecord schema parse 含 error 通过 + 无 error 兼容）→ 验证：pnpm test 红（usageItemSchema 加 error 前 parse 拒 error 字段）
2. `plugin-output.ts` usageItemSchema 加 `error: z.string().optional()` + export usageItemSchema → 验证：pnpm test 绿
3. PopupView `accountErrors` 从 MetricRecord.error 构建（Map accountId → {error, provider, accountLabel}）→ 验证：typecheck + pnpm test
4. ProviderAccountList props 加 `accountErrors`，透传到 ProviderAccountRow（T027 用）→ 验证：typecheck
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：export usageItemSchema 增 public surface → 仅单测 import，runtime 不改
- 回退：删 error 字段 + 恢复原 PopupView providerErrors

## Finalization 时更新的 blueprint

- 无
