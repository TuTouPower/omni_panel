# Task plan

## 步骤与验证

1. Edit observation-mapping.ts observation_to_metric_record L48 加 error 映射 → 验证：typecheck
2. 写 tests/unit/observation_mapping_error.test.ts（last_error 有/null）→ 验证：pnpm test 绿
3. Edit account_error_badge.spec.ts 移除 skip → 验证：pnpm test:e2e:web badge case pass
4. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：e2e badge case 仍 skip（stale observation 无 last_error）→ 检查 observation-store last_error 列
- 回退：移除 error 映射，恢复 skip

## Finalization 时更新的 blueprint

- 无
