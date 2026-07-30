# Task spec

## 背景

打开代理面板（`agent` 路由 `TokenStatsView`）后内存上涨约 500 MB。根因之一：`token-stats-store.ts:430 query_records` 对 `token_stats_records` 表执行 `SELECT ... ORDER BY timestamp DESC`，**无 LIMIT、无时间窗 WHERE**，把全表 38 万行（本机）一次性经 IPC 传到渲染进程。`TokenStatsView.loadData` 调用 `getRecords()` 时也不传时间窗，时间过滤在数据到达渲染端后才做（`filtered()` 在 `useMemo` 里）。

## 范围

- `query_records`：filters 增加 `start`/`end`/`limit`，SQL 下推 `WHERE timestamp BETWEEN @start AND @end`，末尾 `LIMIT @limit`。
- `TokenStatsView.loadData`：把当前 `currentRange`（start/end）与默认 limit 传入 `getRecords`。
- `getRecords` 的 IPC 类型（`shared/types/ipc.ts` `TokenStatsRecordFilters`）补 `start?`/`end?`/`limit?`。
- SessionTable 已有分页，records 仍按时间窗拉取，limit 取一个安全上限（如 5000，超出的由 SessionTable 分页体现总数）。

## 非范围

- 不改 collector emit 逻辑（t166）。
- 不改图表改用 daily（t164）。
- 不加索引（t163）。
- 不改 `onUpdated` 刷新策略（t166）。

## 验收标准

- [ ] `query_records` SQL 含 `WHERE timestamp BETWEEN` 与 `LIMIT`，且在空 filters 时有默认 limit 兜底。
- [ ] 打开代理面板后渲染进程持有的 records 数 ≤ limit（默认 5000），不再为全表规模。
- [ ] KPI/donut/bar/heatmap/session 表数据与改动前视觉一致（基于同一时间窗的 records 聚合）。
- [ ] 新增/更新单测覆盖 `query_records` 的 start/end/limit 下推。

## 依赖与约束

- 无前置依赖；可与 t163 并行。
- 兼容性：`getRecords` filters 仅新增可选字段，旧调用方不传时走默认 limit，不破坏契约。
