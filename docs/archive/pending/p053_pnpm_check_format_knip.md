# p053 合并后 pnpm check 存量失败：format:check 与 knip 死类型（批次前遗留）

- 来源：t216-t222 合并后验证
- 内容：合并后 `pnpm check` 两处失败，均为批次前存量、本批次 7 个 task 未触碰：
    1. `tests/unit/renderer/views/session_history_test_utils.ts`（t210 遗留）prettier format 不通过——`npx prettier --write` 即可修。
    2. knip 报 `src/shared/types/token-stats.ts:444-451` `TokenStatsDashboardPlatform/Metric/XAxis/Granularity` 4 个未使用导出（t189 时代 dashboard 类型，非本批次新增）。
- 处理：fe80caa2
