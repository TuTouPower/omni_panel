# Efficiency 审阅报告

## 审阅范围

- `D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts`
- `D:/Dev/Code/omni_usage_t191/src/main/core/local-api/server.ts`
- 辅助调用方 `D:/Dev/Code/omni_usage_t191/src/main/ipc/token-stats-ipc.ts`
- 仅审 `git diff HEAD` 引入或直接触发查询路径的效率问题；未改文件，未跑长测试。

## 候选问题

### 1. current/previous rollup 对同一窗口范围执行两次完整聚合扫描

- file: `D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts`
- line: 978
- summary: `query_dashboard` 连续调用 `read_rollup(query.start, query.end)` 与 `read_rollup(query.start - width, query.start)`；两条 SQL 结构相同，均对 `token_stats_records` 做时间过滤、GROUP BY 和关联 title 查询，工作量近似按窗口数据量翻倍。
- failure_scenario: 记录表达到数十万/百万行，用户切换 30d 或接近允许上限的自定义范围时，每次 dashboard 请求先后扫描 current 与 previous 两个等宽窗口；SQLite 同步执行，延迟和主进程占用随两次聚合线性累加。可将 `[start - width, end)` 作为一次扫描，以 period CASE/分组字段区分 current/previous，再拆分结果。
- 置信度: 高
- 优先级: P1（效率）

### 2. session_count 与 session_rows 重复执行同一范围的 session 分组

- file: `D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts`
- line: 1007
- summary: `session_count` 为求 total 执行一次完整的 `GROUP BY source, env, session_id`；紧接着 `session_rows` 又对相同过滤条件执行一次相同分组，只是追加聚合字段、排序和分页。
- failure_scenario: 当前窗口包含大量 session 时，任何 dashboard 请求都会为 session 表区域重复扫描/分组同一批 records，即使只请求第一页 100 条。可用共享 CTE（同时产出 rows 和 count）或窗口总数避免第二次分组；空页场景需保留可取得 total 的路径。
- 置信度: 高
- 优先级: P1（效率）

### 3. rollup 的 title 相关子查询按 model/directory 分组重复探测同一 session

- file: `D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts`
- line: 947
- summary: rollup 分组键包含 `source, env, model, directory, session_id`，但相关 title 子查询只依赖 `source, env, session_id` 与时间范围。一个 session 在窗口内有多个 model 或 directory 时，会为每个分组重复执行相同的 `ORDER BY timestamp DESC LIMIT 1` 索引查找；current/previous 两次 rollup 还会各自重复。
- failure_scenario: 单个长期 session 有模型切换或目录变更，形成几十/上百个 rollup 分组时，title 查找次数按分组数增长，而结果相同。高并发 dashboard 刷新下，这些重复索引探测叠加在两次聚合上。可先按 `(source, env, session_id)`、窗口求最新 metadata，再与 rollup 聚合结果 JOIN。
- 置信度: 高
- 优先级: P2（效率）

### 4. session_rows 为每个 session 分别执行 title 与 directory 两次相关 I/O

- file: `D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts`
- line: 1020
- summary: session 分组查询对同一 `(source, env, session_id, range)` 先后执行 title、directory 两个相关子查询；两者使用相同排序和过滤，仅返回列不同。
- failure_scenario: 首屏分页最多 100 个 session 时，单次请求额外产生最多约 200 次按 session 的索引探测；切页或轮询 dashboard 时重复发生。可在一个按最新 timestamp 排序的 metadata CTE 中同时取得 title/directory，再 JOIN session aggregate。
- 置信度: 高
- 优先级: P2（效率）

### 5. HTTP dashboard 请求在主聚合前额外扫描 sessions 表求 freshness

- file: `D:/Dev/Code/omni_usage_t191/src/main/core/local-api/server.ts`
- line: 312
- summary: `/v1/dashboard` 每次调用 `store.last_updated()`，其实现执行 `SELECT MAX(updated_at) FROM token_stats_sessions`；随后 `query_dashboard` 仍执行多条 records 聚合。新增主数据接口每次请求固定多一次 sessions 表扫描。
- failure_scenario: session 表较大且 dashboard 高频刷新时，`MAX(updated_at)` 成为每次请求额外的同步 I/O；若 renderer 同时轮询 `/v1/status`，还会重复相同查询。可在 store/manager 写入路径维护内存中的 latest timestamp，或让 dashboard 查询服务一次性生成 status，避免独立扫描。
- 置信度: 中
- 优先级: P2（效率）

## 未发现

- dashboard DTO 的 chart、session items、heatmap 都有 schema 上限；本 diff 未见明显无界响应序列化。
- `idx_records_ts` 与 `idx_records_session_ts` 针对时间范围和相关 session 查找，方向正确；未将其列为问题。
