# Task plan

## 步骤与验证

1. 审计 `chart-data.ts` 每个 export 函数的输入需求（modelSegments/projectSegments/agentSegments/compositionSegments/prepareBarData/prepareHeatmapData/modelColorMap），标注哪些可由 daily/sessions 满足、哪些必须 records → 验证：表格产出。
2. 为可迁移函数写 daily/sessions 版本（同名新签名或新函数），保留 records 版本供 Heatmap → 验证：单测对比两版本在同输入下的聚合结果一致。
3. `TokenStatsView` 重构数据流：`getDaily`/`getSessions` 主数据 + records 仅 Heatmap 时间窗 → 验证：渲染端 records 持有量下降，图表数值一致。
4. SessionTable 改服务端分页（`getSessions` limit/offset） → 验证：翻页只请求当前页。
5. `pnpm test` + 手动对比改动前后面板数值 → 验证：视觉与数值一致。

## 风险与回退

- 风险：`compositionSegments`（cache_read/input/cache_write/output）需要 records 级的逐条 token 字段——daily 有这些字段（按 model/date 聚合），但跨 model 合并的命中率公式需核对一致性。
- 风险：Heatmap 小时级数据 daily 无法提供；若 records 时间窗 + limit 仍过大（24h 内可能 2 万行），需评估独立 hourly 表。
- 风险：改动面大，易引入数值偏差——必须逐图表对比改动前后。
- 回退：`TokenStatsView` 回到 records 全量（不推荐）。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 渲染数据流（daily/sessions/records 分工）。
- `docs/blueprint/domain.md`：daily/sessions/records 三表职责。
- `docs/specs/tokenstats_charts_use_daily.md`：新建累积 spec。
