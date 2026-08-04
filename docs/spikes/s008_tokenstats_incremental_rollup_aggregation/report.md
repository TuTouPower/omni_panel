# Spike report

## 问题

t192 需要确定两项前置方案：

1. 满足 dashboard 全部维度的最小持久聚合粒度（复用 day/session 表 / 补 hour 聚合 / 补 session-hour 聚合）。
2. 历史回填期间的可用性策略（启动阻塞 / 后台回填 + 旧路径 fallback）。

## 成功判据

- 聚合粒度：从候选表重建 dashboard 各区域（summary、time/project/session 轴、heatmap、session 分页）与 `token_stats_records` 重算结果一致；行数不随 per-message 数量线性增长。
- 回填策略：选择不阻塞启动、可自动回退到旧查询路径的方案。

## 尝试

实验代码见 `code/compare_aggregation.ts`（粒度语义对比）与 `code/compare_read_scale.ts`（读取规模对比）。合成 200 session × 5 model × 3 directory × 24h 窗口，分别以约 25/250/2500 条 message 密度回填三张候选表，并以 `token_stats_records` 全量聚合为 oracle 逐区域比对。

候选表：

- A `agg_daily`：per (source, env, session_id, UTC 日, model, directory)。
- B `agg_hour`：per (source, env, hour_start, model, directory)，不含 session 维度。
- C `agg_session_hour`：per (source, env, session_id, hour_start, model, directory)。

## 证据

行数对比（density=25 时 records=5000）：

| 表             | 行数 |
| -------------- | ---- |
| records        | 5000 |
| A daily        | 1000 |
| B hour         | 30   |
| C session_hour | 1000 |

dashboard 区域语义重建（oracle: calls=4900, sessions=200, tokens=2217900）：

| 方案           | calls | sessions               | tokens  | 判定                                         |
| -------------- | ----- | ---------------------- | ------- | -------------------------------------------- |
| A daily        | 4900  | 200                    | 2217900 | ✓（但缺 hour 粒度：heatmap/hour 轴不可重建） |
| B hour         | 4900  | SUM=1000（跨小时重复） | 2217900 | ✗ sessions 误计 800                          |
| C session_hour | 4900  | 200                    | 2217900 | ✓ 全区域一致                                 |

读取规模（固定 200 session × 5 model × 24h，message 密度 25→250→2500，records 5000→50000→500000）：

```
density=25   records=5000   agg_rows=1000   records_rollup_groups=1000   agg_time_chart_read=5
density=250  records=50000  agg_rows=1000   records_rollup_groups=1000   agg_time_chart_read=5
density=2500 records=500000 agg_rows=1000   records_rollup_groups=1000   agg_time_chart_read=5
```

聚合表行数恒为 session×hour×model 组合数，message 密度扩大 100 倍不变；time chart 最小读取为 hour×model 组合（5 行），与 records 量完全解耦。

## 结论

1. **聚合粒度选 C：per (source, env, session_id, hour_start, model, directory) 的 session-hour 表**。它是能精确重建全部 dashboard 维度（含 distinct session 计数、hour 粒度、project/directory 维度）的最小粒度；A 缺 hour 粒度（heatmap 与 hour 轴不可重建），B 缺 session 维度导致 sessions 计数跨小时重复。C 行数随 session×hour×model 组合增长，不随 per-message records 增长。
2. **title/directory 不存入聚合表**。session 分页与 session 轴需要的最新 title/directory 由 collector 维护的 `token_stats_sessions` 表提供（该表已存每 session 最新 title/directory，增量更新），聚合表只存可加和的数值列；避免 title 重命名导致的聚合重建风暴。
3. **回填选后台回填 + 旧路径 fallback**。迁移 v6 对已有数据库同步全量回填会阻塞启动；改为：启动后异步全量回填聚合表，回填完成前 dashboard 查询走现有 records 查询路径（t191），回填完成后切换聚合读取。records 保留为真相源，中断可重试、可重建。

## 是否采纳

- 决定：是
- 理由：C 粒度满足 AC1/AC2/AC5 的语义一致与规模解耦；后台回填满足 AC1/AC6 的重启幂等与安全重建，且不引入启动阻塞回归。
- 后续 task：t192
