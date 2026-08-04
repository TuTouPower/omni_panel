# Efficiency 审查

## 范围

`git diff HEAD` 中 `src/main/core/token-stats/token-stats-store.ts`、`src/main/core/local-api/server.ts`，并读取 `TokenStatsView.tsx` 的调用上下文。只报告重复 I/O、全量查询、串行瓶颈；未修改源文件，未运行长测试。

## Findings

### 1. 单次 dashboard 请求对同一时间窗口重复执行 5–6 次全窗口聚合

- file: `src/main/core/token-stats/token-stats-store.ts`
- line: 978
- summary: `query_dashboard` 先后执行 current rollup、previous rollup、可选 time chart、session count、session page、heatmap；除 session page 外均重新扫描同一时间窗口，均在 better-sqlite3 同步调用中串行完成。
- failure_scenario: 30 天或允许的 400 天窗口包含大量 message records 时，一次打开/刷新面板会触发至少两次 rollup 聚合，再触发 chart、session、heatmap 聚合；每个查询都重新访问同一批记录并建立 GROUP BY/DISTINCT 临时结果。由于查询同步运行在 main process，读取期间 IPC 和 local API 请求排队，刷新频率或多个客户端同时访问时延迟线性叠加。
- confidence: 高
- 无法确认假设: 未执行 `EXPLAIN QUERY PLAN`/基准，无法量化索引命中率、临时 B-tree 大小和每次扫描实际耗时；即便使用 timestamp 索引，聚合仍需访问窗口内全部匹配记录。

### 2. rollup/session 查询中的相关子查询形成按分组重复 I/O

- file: `src/main/core/token-stats/token-stats-store.ts`
- line: 947
- summary: rollup 每个 `(source, env, model, directory, session_id)` 分组执行一次“窗口内最新 title”相关子查询；session page 又对每个 session 分别执行 title 与 directory 两个相关子查询，且 current/previous rollup 会各自重复这一逻辑。
- failure_scenario: 一个窗口有 N 个 session、每个 session 有多个 model/directory 分组时，rollup 结果产生接近 N×model_count 次 title lookup；随后 session page 再执行每行 2 次 lookup。`idx_records_session_ts` 可将单次 lookup 变成索引 seek，但不能消除 N+1 次 seek；大量 session 时随机访问和同步执行时间明显增长。
- confidence: 中高
- 无法确认假设: 未查看 SQLite 实际执行计划，无法确认 SQLite 版本是否对这些 scalar correlated subquery 做 decorrelation；代码形状和 `LIMIT 1 ORDER BY` 通常会按外层行执行。

### 3. session 分页只改变 OFFSET，却重新计算整个 dashboard

- file: `src/main/core/token-stats/token-stats-store.ts`
- line: 1017
- summary: `session_offset` 只应用在最终 `GROUP BY source, env, session_id ... LIMIT/OFFSET`，但每次分页请求仍先完整执行 current/previous rollup、chart、session_count 和 heatmap；`OFFSET` 不能减少前置聚合工作。
- failure_scenario: 用户从第一页翻到第二页时，renderer 的 query key 包含新的 `session_offset`，因此缓存 miss 并重新调用 `getDashboard`；服务端再次扫描并聚合整个时间窗口，只返回下一组 100 行。连续翻页会将同一窗口的全量聚合重复执行多次，主进程同步查询造成串行阻塞。
- confidence: 高
- 无法确认假设: 未运行 UI 量测；结论依赖当前 `TokenStatsView.tsx` 将 `session_offset` 纳入 query key 且分页直接触发 `loadData`，源码中可见该调用链。

### 4. `session_offset` 没有上界，极大 OFFSET 仍触发全量分组

- file: `src/shared/types/token-stats.ts`
- line: 273
- summary: `session_offset` 仅要求 nonnegative/safe，没有最大值；SQLite 会先完成窗口内 `GROUP BY`，再丢弃 OFFSET 前的结果。
- failure_scenario: 任意客户端请求极大合法 safe integer offset 时，响应可能为空，但数据库仍扫描并聚合整个窗口；未认证的 web read endpoint 可被重复请求放大 CPU/I/O。正常分页也会在高 offset 处退化，keyset pagination 或 capped offset 才能避免该成本。
- confidence: 中
- 无法确认假设: 需要结合部署网络暴露范围、SQLite 对超大 OFFSET 的具体执行计划及实际请求方，才能确认是否可被外部触发和实际耗时。
