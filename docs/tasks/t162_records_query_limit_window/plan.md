# Task plan

## 步骤与验证

1. `shared/types/token-stats.ts` `TokenStatsRecordFilters` 增 `limit?`（start/end 已存在）→ 验证：typecheck 通过。
2. `token-stats-store.ts:430 query_records` 末尾加 `LIMIT @limit`；`filters.limit` 缺省时默认 5000 → 验证：新增单测 `query_records_applies_limit` 断言 SQL 含 LIMIT 且默认值生效。
3. `preload/index.ts` `getRecords` 已透传 `TokenStatsRecordFilters`（含新增 limit），无需改形状 → 验证：typecheck。
4. `TokenStatsView.tsx loadData` 向 `getRecords` 传入 `currentRange.start/end`（当前只传 env）+ limit；`loadData` 依赖纳入 start/end → 验证：渲染端 records 长度 ≤ limit。
5. 跑 `pnpm test` 全量；手动打开代理面板观察内存（任务管理器）→ 验证：内存峰值显著下降。

注：loadData 的图表侧改动是临时止血，t164 会接管为 daily/sessions 数据源。

## 风险与回退

- 风险：`currentRange` 纳入 `loadData` 依赖后，切换 range 会重拉——属期望行为；`onUpdated` 静默刷新也要带当前 start/end（否则用旧 range）。
- 风险：limit 截断后 SessionTable 总页数基于截断后的 rows（窗口内最新 N 条），超限时与改动前不一致——已在验收标准中承认，视觉一致性由 t164 兜底。
- 回退：`filters.limit` 可选，回退即不传，恢复全量（不推荐）。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 数据流处补注 records 查询带时间窗 + limit。
- `docs/specs/records_query_limit_window.md`：新建累积 spec。
