# Task plan

## 步骤与验证

1. 跑 `pnpm test:e2e:electron --grep "persists secrets"` → 验证：过/失败
2. 若失败：读 SettingsView accounts DOM + 修 selector → 验证：重跑绿
3. 全量 `pnpm test:e2e:electron` → 验证：不破
4. task_report + 归档 + commit

## 风险与回退

- 风险：electron 驱动慢/flaky → 重试或记录
- 回退：class 修还原

## Finalization 时更新的 blueprint

- 无
