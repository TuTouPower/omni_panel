# session_pagination 效率审阅

审阅范围：当前 git diff 中 token-stats session pagination、API/SQL response size、IPC DTO、renderer query/merge。仅列高置信 Efficiency 候选；未审 correctness/security/style。

## 1. Dashboard 单次请求重复扫描同一时间范围

- **file**：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:978-1081`
- **summary**：`query_dashboard` 对相同筛选范围分别执行 current rollup、previous rollup、时间图表、session total、session page、heatmap 查询；这些查询都直接读取 `token_stats_records`，没有共享中间结果或统一聚合。
- **failure_scenario**：30 天范围存在大量事件时，用户每次切换筛选、翻页或刷新都会重复遍历同一批 raw records 多次；即使最终 DTO 有界，SQL CPU 和 I/O 仍随事件数线性放大。
- **建议方向**：将时间范围过滤结果物化为一次临时聚合/CTE，或复用已有按日/小时聚合表；session total/page 从同一 session 聚合结果派生，避免每个 dashboard 请求重复扫 raw table。
- **无法确认假设**：未检查 SQLite `EXPLAIN QUERY PLAN` 与实际数据规模；判断基于这些语句彼此独立、均包含同一范围谓词，SQLite 不会跨独立 statement 复用结果。

## 2. Session 分页使用 OFFSET，深页成本随偏移量增长

- **file**：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:1017-1043`
- **summary**：session 汇总先 `GROUP BY source, env, session_id`，再按 `ended_at` 排序并使用 `LIMIT @session_limit OFFSET @session_offset`；renderer 翻页按 100 条步长传 offset（`D:/Dev/Code/omni_usage_t191/src/renderer/components/token-stats/SessionTable.tsx:92-97`）。
- **failure_scenario**：总 session 数达到数千或数万时，访问第 N 页需要先生成/排序并丢弃前 N 页结果；连续翻页会反复支付此前页面成本，深页延迟和数据库临时内存随 offset 增长。
- **建议方向**：改为基于 `(ended_at, session_id, source, env)` 的 keyset/cursor 分页；cursor 只携带上一页末项排序键，避免 OFFSET 丢弃历史结果。
- **无法确认假设**：未运行 `EXPLAIN`；即使排序可使用临时索引，SQLite 仍需处理并跳过 offset 行，无法把深页变成恒定成本。

## 3. 翻页重新获取并缓存完整 Dashboard DTO，重复返回非 session 数据

- **file**：`D:/Dev/Code/omni_usage_t191/src/renderer/views/TokenStatsView.tsx:304-355`；`D:/Dev/Code/omni_usage_t191/src/renderer/lib/token-stats/query-cache.ts:54-66`
- **summary**：`session_offset` 被纳入 query key；每次 session 页变化都会调用完整 `getDashboard`，返回 current/previous summary、chart、heatmap 和当前页 sessions，而不是只请求下一页 sessions。每个 offset 又作为独立 cache entry 保存完整 DTO。
- **failure_scenario**：用户浏览 1,000 个 session 时产生多个完整 dashboard 响应；网络 payload、IPC 序列化/反序列化和 renderer 内存均重复保存相同 chart/heatmap/summary。缓存最多保留 8 个重复 DTO，翻页期间仍造成显著峰值。
- **建议方向**：拆分 aggregate/dashboard 与 session-page 查询；aggregate 只按不含 offset 的 key 缓存，session 页单独按 cursor/offset 缓存或只保留当前页，并在 renderer 合并展示所需数据。
- **无法确认假设**：假设 session 列表会被实际翻到多个页面；当前 DTO 上限较小，但 chart/heatmap 仍会在每个 page response 中重复传输。

## 4. Session 页只需要少量行，却为每次请求构建全部 session-model 映射

- **file**：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:978-979,1044-1059`
- **summary**：`read_rollup` 返回当前范围内全部 `(source, env, model, directory, session_id)` 分组；随后 `model_map` 遍历全部 rollup 行建立每个 session 的模型集合，最后只为 `session_rows` 当前页取值。
- **failure_scenario**：session 数量或每 session 模型数很大时，翻到任意一页都要在 JS 主进程分配并遍历全量 rollup 分组；实际只返回 100 行，却让 CPU/内存成本随全部 session/model 基数增长。
- **建议方向**：先限定当前页 session，再对这批 session 查询模型集合；或在 SQL 中用 page CTE 与模型聚合 join，避免把全量 rollup materialize 到 JS。
- **无法确认假设**：假设单个 session 可能包含多个 model，且范围内 session 数可明显超过 100；现有测试覆盖低基数场景，未证明高基数下成本可接受。

## 5. 最新标题/目录使用相关子查询，按 rollup 分组重复查找

- **file**：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:947-953,1020-1032`
- **summary**：current/previous rollup 的每个分组都执行一次 latest-title 相关子查询；session page 又对每个 session 执行 title 和 directory 两次相关子查询。一个 session 若按多个 model/directory 分组，相同最新元数据会被重复定位。
- **failure_scenario**：高模型基数或多目录 session 下，rollup 分组数远大于 session 数，相关子查询次数随分组数增长；每次 dashboard 请求还会在 page 查询中再次定位同一元数据。
- **建议方向**：先按 `(source, env, session_id)` 计算每个 session 的最新记录/元数据，再与 rollup/page 聚合 join；保留 session-time 复合索引作为辅助，但不要依赖重复相关子查询。
- **无法确认假设**：已新增 session-time 索引，单次定位可能较快；未测实际 query plan，因此这里只确认重复查找结构，不量化具体耗时。
