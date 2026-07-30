# Task review t164（reviewer_focus: 代码）

- task：`t164_tokenstats_charts_use_daily`
- spec：`docs\tasks\t164_tokenstats_charts_use_daily/spec.md`
- diff_anchor：`1ee36da3ab1b97a973f234cc7f0c79063372698b9`
- target：`git diff 1ee36da3ab1b97a973f234cc7f0c79063372698b9`
- round：1
- reviewed_at：2026-07-30 23:50 UTC+8

## Findings

### t164_code_f001 - getRecords 传 `source`（snake）但 query_records 只识别 `agent`（kebab），服务端 agent 筛选失效

- 严重度：important
- 位置：`src/renderer/views/TokenStatsView.tsx:201-207`（loadData 调 getRecords）；`src/main/core/token-stats/token-stats-store.ts:455-482`（query_records 实现）；`src/shared/types/token-stats.ts:159-165`（TokenStatsRecordFilters 定义）
- 问题：loadData 给 `getRecords` 传 `{ ...env_filter, ...source_filter, start, end }`，其中 `source_filter = { source: "claude_code" }`（snake）。但 `query_records` 只读 `filters.agent`（kebab），完全不识别 `filters.source`，DB 层不拼该条件。`TokenStatsRecordFilters` 类型也无 `source` 字段；对象展开绕过了 TS excess-property check，故 tsc 通过。运行时后果：
    1. 选具体 agent（如 claude-code）时，服务端忽略 source，按 timestamp DESC 全局取（受 `DEFAULT_RECORDS_LIMIT` 截断）。
    2. 若总记录 ≥ limit，其他 agent 的记录会挤占额度，导致目标 agent 的旧记录被截断。
    3. `agentFiltered`（前端 `r.agent === agent` 兜底）保住了**展示正确性**，但数据完整性在 limit 命中时丢失——Bar/Heatmap 在多 agent 场景可能缺数据点。
    4. 也违背 t164「records 仅拉当前时间窗内」的目标——拉回了时间窗内全部 agent 的记录。
- 建议：二选一。
    - A（推荐）：在 loadData 里给 getRecords 传 `{ agent, ...env_filter, start, end }`（kebab，与服务端 `agent = @agent` 对齐），删除 source_filter 复用。
    - B：扩展 `TokenStatsRecordFilters` 与 `query_records` 同时接受 `source`（snake）。A 更小且与现有契约一致。
- 复现场景：DB 中 claude_code + opencode 记录各 >5000 条；选 agent=opencode、时间窗 7d；查 Bar 会看到 claude_code 的记录也被拉回（log query 或 db inspector 验证）。

### t164_code_f002 - modelColorMapFromBuckets 固定按 tokens 排序，丢失原 modelColorMap 按 metric 排序的行为（违反 spec「Top5 逻辑不变」）

- 严重度：important
- 位置：`src/renderer/lib/token-stats/chart-data.ts:547-562`（modelColorMapFromBuckets）；对比 `src/renderer/lib/token-stats/chart-data.ts:308-325`（原 modelColorMap）；调用处 `src/renderer/views/TokenStatsView.tsx:576`
- 问题：原 `modelColorMap(records, metric, theme)` 按**当前 metric** 排序 Top5（`metricValue(rs, metric)`：tokens→token 总量，calls→record 数，sessions→distinct session）。新 `modelColorMapFromBuckets(buckets, theme)` 无 metric 参数，固定 `bucket_tokens` 排序。SessionTable 的 model 颜色 tag 在 metric=calls / sessions 下不再与对应 donut 的 Top5 一致（calls donut 用 `modelSegmentsFromBuckets(..., (b) => b.calls)`，但 modelColors 仍按 tokens）。spec「非范围」明确「不改 donut/bar 的视觉表现（颜色、Top5 逻辑不变）」——这里 SessionTable 的 tag 配色语义被改了。
- 建议：给 `modelColorMapFromBuckets` 增加 `valFn`（或直接传 metric），与 `modelSegmentsFromBuckets` 对齐；调用处传 `(b) => b.calls` 或按 metric 选择。
- 复现：切 metric=calls，观察 SessionTable 的 model tag 颜色与「调用次数」donut 的 Top5 颜色不一致。

### t164_code_f003 - 24h preset 下 buckets daily 边界使 current/prev 不对称（current 多算约 1 天）

- 严重度：minor
- 位置：`src/renderer/views/TokenStatsView.tsx:283-294`（currentBuckets / prevBuckets）；`src/renderer/views/TokenStatsView.tsx:191-197`（2x-wide 拉取）
- 问题：buckets 是 daily 粒度（`bucket_date` = UTC YYYY-MM-DD）。`currentBuckets` 用 `bucket_date in [utc_date(start), utc_date(end)]` 闭区间。24h 窗口（如 start=2026-07-29 10:00, end=2026-07-30 10:00）→ current 取 [07-29, 07-30] 两天共 48h 数据；prev 取 [07-28, 07-29) 一天 24h 数据。current 比 prev 多算一整天，KPI delta（▲/▼）与 donut 在 24h preset 下偏大。代码注释（:281-282）说「acceptable for KPI/donut deltas which are day-granular anyway」——对 7d/30d 窗口误差比例小（1/7、1/30），对 24h 误差 100%。spec 未明示此取舍。
- 建议：24h preset 下要么单独标注 delta 不显示（或显示「日内」），要么 KPI 改用 records 精确窗口（records 本就为 Bar/Heatmap 拉了）。至少在 spec / task.md 记录此取舍。
- 复现：preset=24h，比较「总 Token」KPI 与 BarChart 同窗口总和。

## 结论

- 本轮新发现：3 条（2 important + 1 minor）
- 总体判断：KPI/donut/session-table 的 records→buckets/sessions 迁移主体成立；hitRate、agent 映射、currentSessions 区间相交、SessionTable props 重构均正确。两处 important 需在收尾前修：getRecords 的 source/agent 过滤契约不一致（运行时 agent 筛选失效），以及 modelColorMapFromBuckets 丢失 metric 维度排序（违反 spec Top5 不变）。

verdict: FAIL

## Round 2 (2026-07-31 00:10 UTC+8)

### 前轮 finding 复核

- **f001（important）已修**：`TokenStatsView.tsx:205-210` loadData 给 getRecords 传 `{ ...env_filter, ...agent_filter, start, end }`，其中 `agent_filter = { agent }`（kebab，如 `"claude-code"`），与 `token-stats-store.ts:459-462` `query_records` 读 `filters.agent` 并拼 `agent = @agent` 对齐。buckets/sessions 仍用 `source_filter`（snake，如 `"claude_code"`），与 `query_buckets:402-404` / `query_sessions:429-431` 读 `filters.source` 对齐。契约一致，运行时 agent 筛选生效。
- **f002（important）已修**：`chart-data.ts:548-564` `modelColorMapFromBuckets` 新增 `valFn: (b) => number = bucket_tokens` 参数，按 `valFn` 累计 model 总量后 `topGroups(totals, 5)`。`TokenStatsView.tsx:577-584` 调用处按 metric 传：`calls → (b) => b.calls`、`sessions → (b) => b.sessions`、其他（tokens）→ `undefined` 走默认 `bucket_tokens`。与 `modelSegmentsFromBuckets` 的 valFn 参数完全对齐，SessionTable model tag 颜色与当前 metric 对应 donut 的 Top5 一致。spec「Top5 逻辑不变」恢复。
- **f003（minor）遗留**：24h preset daily 边界不对称（current 比 prev 多算约 1 天），代码注释（:281-282）记录 acceptable，spec 未明示取舍。维持遗留，本轮不要求修。

### 本轮新发现

0 条。tsc --noEmit 通过；metric→valFn 映射三分支 + undefined 兜底完整；无类型安全回归。

### 总体判断

两处 important finding 均已正确修复，契约与原 records 路径行为对齐；f003 维持遗留。本轮无新问题。

verdict: PASS
