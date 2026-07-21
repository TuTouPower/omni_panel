# Task plan

## 步骤与验证

1. `git rm tests/e2e/electron/account_operations.spec.ts` → 验证：删除
2. `playwright --project=electron --list` → 验证：不含 account_operations
3. task_report + 归档 + commit

## 风险与回退

- 无（删废弃 spec）

## Finalization 时更新的 blueprint

- 无
