# d005 records 查询时 hour 聚合可消除 LIMIT 截断（2026-07-31）

- 来源：s005
- 结论：`token_stats_records` 上按 UTC+8 本地整点小时 `(timestamp - ((timestamp + 28800000) % 3600000))` × model 查询时聚合，行数 = hour×model 组合（7d 428 行 vs 明细 140,481 行），无 LIMIT 截断；聚合 hour_start_epoch 与渲染层 `bucketize(start,end,"hour")` 桶起点对齐（内部小时全部命中，含 start 的偏首小时桶经 `idx(ts<=start)→0` 正确映射）。
- 证据：s005 探针对真实 DB：7d 聚合 428 行/141 小时；首个小时 7/24 14:00Z（最早日期不丢）；内部小时全在 bucketize 桶起点集合。
- 影响：7d/30d + 小时粒度柱状图可走该聚合，替代 `query_records` 10 万级明细进渲染层；与 day buckets / heatmap 聚合并列。
- 现状：有效

- 现状：有效
