# Task spec

## 背景

打开代理面板（`agent` 路由 `TokenStatsView`）后内存上涨约 500 MB。根因之一：`token-stats-store.ts:430 query_records` 的 SQL **无 LIMIT**，把全表 38 万行（本机）一次性经 IPC 传到渲染进程。

现状澄清（审阅核实）：

- `query_records` **已支持** `start`/`end` 时间窗下推（`token-stats-store.ts:442-449`，用 `timestamp >= @start AND timestamp <= @end`，非 BETWEEN）。
- `TokenStatsRecordFilters`（`shared/types/token-stats.ts:159-164`）**已含** `start?`/`end?`。
- 真正缺的：① `query_records` 无 `LIMIT`；② `TokenStatsView.loadData`（`TokenStatsView.tsx:163`）调用 `getRecords` 时只传 `env`，**不传当前时间窗** start/end，导致主进程拿到全表后渲染端才 `filtered()` 过滤。

## 范围

- `query_records`：SQL 末尾加 `LIMIT @limit`；`filters.limit` 缺省时用一个安全默认（如 5000）兜底。
- `TokenStatsRecordFilters`（`shared/types/token-stats.ts`）：补 `limit?`。
- `TokenStatsView.loadData`：把 `currentRange.start/end` 传入 `getRecords`（当前只传 env）；`loadData` 依赖纳入 start/end，切换 range 重拉。
- SessionTable 已分页；records 按时间窗 + limit 拉取，超 limit 时按 `ORDER BY timestamp DESC` 保留最新 N 条。
- `loadData` 的图表侧改动是临时止血，t164 会接管（改为 daily/sessions 数据源）。

## 非范围

- 不改 collector emit 逻辑（t166）。
- 不改图表改用 daily（t164）。
- 不加索引（t163）。
- 不改 `onUpdated` 刷新策略（t166）。

## 验收标准

- [ ] `query_records` SQL 含 `LIMIT`，且 `filters.limit` 缺省时有默认兜底（默认 5000）。
- [ ] `TokenStatsView.loadData` 向 `getRecords` 传入当前时间窗 start/end。
- [ ] 打开代理面板后渲染进程持有的 records 数 ≤ limit（默认 5000），不再为全表规模。
- [ ] 窗口内 records ≤ limit 时，KPI/donut/bar/heatmap/session 表数据与改动前一致；超限时仅保留最新 N 条（视觉一致由 t164 兜底）。
- [ ] 新增/更新单测覆盖 `query_records` 的 limit 下推（start/end 下推已有，不重复测）。

## 依赖与约束

- 无前置依赖；可与 t163 并行。
- 兼容性：`filters.limit` 仅新增可选字段，旧调用方不传时走默认 limit，不破坏契约。
- `filters` 类型定义在 `shared/types/token-stats.ts`（非 `ipc.ts`）。
