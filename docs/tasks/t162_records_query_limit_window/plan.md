# Task plan

## 步骤与验证

1. `shared/types/ipc.ts` `TokenStatsRecordFilters` 增 `start?`/`end?`/`limit?` → 验证：typecheck 通过。
2. `token-stats-store.ts:430 query_records` 实现 start/end/limit 下推；空 filters 时 `limit` 默认 5000 → 验证：新增单测 `query_records_pushes_window_and_limit` 断言生成 SQL 含对应占位符。
3. `preload/index.ts` `getRecords` 签名透传新 filters（已是 `TokenStatsRecordFilters`，无需改形状）→ 验证：typecheck。
4. `TokenStatsView.tsx loadData` 传入 `currentRange.start/end` + limit；`currentRange` 变化时重拉（已有 `useEffect([loadData])`，把 start/end 纳入 `loadData` 依赖）→ 验证：渲染端 records 长度 ≤ limit。
5. 跑 `pnpm test` 全量；手动打开代理面板观察内存（任务管理器）→ 验证：内存峰值显著下降。

## 风险与回退

- 风险：`currentRange` 纳入 `loadData` 依赖后，切换 range 会重拉——属期望行为，但需确认 `onUpdated` 静默刷新不会用旧 range（silent 路径也要带当前 start/end）。
- 风险：limit 截断后 SessionTable 总行数显示与实际不符——SessionTable 已分页，显示当前页 slice；总页数基于截断后的 rows，需确认 `sessionRows` 仍来自已加载 records（截断后代表时间窗内前 limit 条，可接受）。
- 回退：filters 为可选字段，回退即移除传入参数，恢复全量（不推荐）。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 数据流处补注 records 查询带时间窗 + limit。
- `docs/specs/records_query_limit_window.md`：新建累积 spec。
