# Spike report

## 问题

验证 token_stats_records 上查询时 hour 聚合的可行性：UTC+8 本地整点小时分组是否与渲染层 `bucketize(start, end, "hour")` 桶序列对齐，7d 窗口聚合行数是否远小于明细。

## 成功判据

- 聚合 SQL 返回的 hour_start_epoch（本地整点小时起点的 UTC 毫秒）与渲染层 bucketize 的桶起点一致（内部小时全部对齐；含 start 的偏首小时桶映射到桶 0）。
- 7d 窗口聚合行数 ≈ hour×model 组合数（数百），远小于明细 14 万行。
- 窗口内最早日期有数据（不截断）。

## 尝试

用真实 DB 写探针 `.scratch/probe_hour_agg.mjs`：`SELECT (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start_epoch, model, SUM(tokens), COUNT(*) calls, COUNT(DISTINCT session_id) sessions FROM token_stats_records WHERE timestamp>=@start AND <=@end GROUP BY hour_start_epoch, model`，并模拟渲染层 `bucketize` 桶起点列表做对齐比对。

## 证据

- 7d 窗口（2026-07-24T14:36Z .. 07-31T14:36Z）：聚合 428 行 / 141 个不同小时 vs 明细 140,481 行。
- 聚合首个小时 = 2026-07-24T14:00Z（7/24 有数据，不截断）；`bucketize` 桶数 169（168 整点 + 1 偏首小时）。
- 内部小时全部落在桶起点集合；仅 2 个边界小时（含 start 的 7/24 14:00 偏首桶）不在起点集合——其 hour_start_epoch ≤ start，`bucketize.idx(ts)` 的 `ts <= start → 0` 分支正确映射到首桶，与现有 records 路径语义一致。

## 结论

- `(timestamp - ((timestamp + 28800000) % 3600000))` 正确给出 UTC+8 本地整点小时起点，与渲染层 bucketize（主机 UTC+8）对齐；首偏小时桶映射正确。
- 聚合行数 = hour×model（7d 428），无 LIMIT 截断，可完全消除 10 万级明细进渲染层。
- 过滤条件与 `query_heatmap` 同构（agent + env + start/end），可照搬其 WHERE 构造。

## 是否采纳

- 决定：是
- 理由：hour 聚合可行且与现有时区口径、渲染层桶语义一致，方案落地无阻塞。
- 后续 task：t173
