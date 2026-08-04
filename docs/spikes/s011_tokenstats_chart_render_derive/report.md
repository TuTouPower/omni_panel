# Spike report

## 问题

t200 的 UNVERIFIED-SPIKE：把 dashboard 查询缓存 key 中的展示维度（`metric` / `xaxis` / `gran`）剥离后，renderer 能否用服务器返回的聚合数据完整派生所有展示；会话分页独立加载的最小契约。

## 成功判据

- 确认 dashboard 聚合源数据里，各展示区域是否 metric / xaxis / gran 无关（即同一窗口的同一份数据能否派生任意展示）。
- 确认 renderer 已有或需新增哪些派生函数，且派生结果与现服务器端 `dashboardChart` 在全部选项组合下等价。
- 确认会话分页独立查询的可行性（新 IPC 通道 vs 复用字段）。

## 尝试

- 读 `query_dashboard`（token-stats-store.ts:1093-1443）与共享类型、BarChart 消费路径。
- 逐区域核对 DTO 字段是否 metric 无关：
    - `current` / `previous`（summary）：含 tokens/sessions/calls/cache\_\*/agent_totals/model_token_totals/model_call_totals/project_session_totals —— **全 metric 无关**（三套值都已算）。
    - `heatmap`：每 cell 含 calls/sessions/tokens —— **metric 无关**。
    - `sessions`：每 session 含全部 token/call 字段 —— **metric 无关**。
    - `chart`：唯一 metric / xaxis / gran 相关区域。服务器 `dashboard_chart_from_hour_buckets`（:442）/ `dashboard_chart_from_rollup`（:483）按请求的 metric/xaxis/gran 从 `bucket_rows` / `current_rollup` 派生。
- 核对 `bucket_rows` 的 SQL 分组（:1248-1283）：GROUP BY（bucket_expression, chart_dimension），`chart_dimension = metric==="sessions" ? COALESCE(directory,'(unknown)') : model`。`calls = SUM(calls)`、`sessions = COUNT(DISTINCT source|env|session)`、`tokens = SUM`。
    - tokens 与 calls metric 的 bucket_rows **完全相同**（都按 (bucket, model) 分组，行内含三值）。
    - sessions metric 的 bucket_rows 按 (bucket, directory) 分组，`sessions` 是该粒度 distinct 计数。
- 核对 renderer 现有派生函数（chart-data.ts）：
    - `prepareBarDataFromHourBuckets`（:365）/ `prepareBarDataFromBuckets`（:314）按 `b.model` 分组、按 metric 取值 —— 与服务器 tokens/calls 路径语义一致；但 sessions 路径服务器按 directory 分组，renderer 现有函数按 model，**不直接等价**。
    - `prepareBarDataFromRollup`（:955）按 xaxis=project/session 派生 —— 与服务器 `dashboard_chart_from_rollup` 同源。

## 证据

- `query_dashboard` 的 summary/heatmap/sessions 三区域在 DTO schema 中字段齐全且与请求 metric 解耦（token-stats.ts:299-365）。
- 服务器对同一窗口的 `bucket_rows` 在 tokens/calls 下恒为 (bucket, model) 粒度、sessions 下为 (bucket, directory) 粒度；rollup 为 (source,env,session,model,directory,agent) 粒度 —— 全部有界（随桶×分组数，不随 per-message 行数）。
- 会话分页的 session SQL（:1292-1371）独立于 chart/summary/heatmap，可整体抽为独立查询。

## 结论

- **展示派生可行且必须**：把 `chart` 从服务器预派生改为 DTO 携带 metric 无关的聚合源数据，renderer 用现有/新增派生函数本地派生。DTO 的 chart 需替换为 `chart_data = { metric_buckets, session_buckets, rollup }`：
    - `metric_buckets`：per (hour, model) 的 `{ hour_start, model, calls, tokens }` —— 服务 tokens/calls metric 时间轴（与现有 `prepareBarDataFromHourBuckets` 语义一致，day 粒度时 hour_start 即本地日界）。
    - `session_buckets`：per (hour, COALESCE(directory,'(unknown)')) 的 `{ hour_start, directory, sessions }` —— 服务 sessions metric 时间轴；**不能**由 metric_buckets 跨 model 求和（session 跨 model 时重复计数），须独立 distinct。
    - `rollup`：复用 `current_rollup`（TokenStatsRollupRow[]）—— 服务 tokens/calls 的 project/session 轴。
    - sessions metric 恒走 time 轴（`effective_xaxis`），故 rollup 仅服务 tokens/calls。
- **查询缓存 key 可剥离 metric/xaxis/gran**：同一 `[start,end)` + 筛选下，chart_data 与 summary/heatmap/sessions 都 metric 无关，切换展示维度纯本地派生，不触发 IPC。
- **会话分页需独立通道**：DTO 的 `sessions.items` 是首页；翻页请求会连同 summary/chart/heatmap 一起重算（p029）。最小契约：新增 `get_dashboard_sessions` IPC（入参含 session_offset/limit，返回 { items, total, has_more }），主 dashboard 查询只回首页；renderer 翻页只发该通道、缓存 key 不含 session_offset。

## 是否采纳

- 决定：是
- 理由：前提（展示维度仅影响 renderer 派生）成立；派生函数 renderer 侧已大部分存在，补充 sessions 时间轴 directory 分组与 chart_data 装载即可。
- 后续 task：t200
