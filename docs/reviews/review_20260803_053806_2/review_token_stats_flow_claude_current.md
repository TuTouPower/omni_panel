# Efficiency 审查

- 模块：`token_stats_flow`
- 范围：`git diff HEAD` 中 token-stats-store/server 变更及其 callers/callees、IPC/web 端点
- 结论：以下 6 个候选均来自静态调用链追踪；未修改源文件，未运行长测试。

## 候选 1：一次 dashboard 请求重复扫描同一时间范围

- file：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:978-1082`
- summary：`query_dashboard` 顺序执行 current/previous `read_rollup`、time chart 聚合（xaxis=time 时）、session total、session page、heatmap；其中至少 4 个查询对 current window 独立扫描 `token_stats_records`，没有共享中间聚合。
- failure_scenario：30d/高密度数据打开面板时，单个 IPC/HTTP 请求触发 current rollup、session count、session rows、heatmap，time 轴再加 bucket 聚合；better-sqlite3 同步执行，主进程在多次全范围读期间阻塞。web 每 10 秒刷新或多个窗口并发时，成本按请求次数叠加。
- 置信度：高
- 无法确认假设：未用真实数据测各 SQL 的 query plan；若 SQLite cache 已完全命中，磁盘 I/O 会下降，但 CPU、聚合和主进程同步阻塞仍存在。

## 候选 2：未限制的 rollup 分组把高基数数据全部物化到 JS

- file：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:934-975`
- summary：`read_rollup` 按 `source, env, model, directory, session_id` 分组并把全部行 `.all()` 读入 `DashboardRollupRow[]`；后续才在 JS 中取 Top 5/Top 20，SQL/DTO 没有对临时 rollup 行数设上限。
- failure_scenario：每个 session 或 model/directory 组合都产生一行时，30d 数据有数万至数十万分组；单次 dashboard 请求先分配并遍历全部分组，再建立多个 Map/Set（summary、project sessions、chart），内存和 CPU 随分组数线性增长，尽管最终响应只保留少量 Top 项。
- 置信度：高
- 无法确认假设：完整 summary 的精确 totals 确实要求读取所有分组；若数据集始终很小，该成本不显著，但实现没有容量上界。

## 候选 3：rollup/session 查询重复执行窗口内 latest 元数据子查询

- file：`D:/Dev/Code/omni_usage_t191/src/main/core/token-stats/token-stats-store.ts:944-451, 1018-1039`
- summary：rollup 的 title 子查询按每个 `(model, directory, session)` 分组重复查同一 session 的窗口内最新 title；session page 又分别为每个 session 执行 title 和 directory 两个相关子查询。新增 `idx_records_session_ts` 可减少排序，但不能消除重复索引查找。
- failure_scenario：一个 session 含多个 model/directory 时，rollup 对同一 session 重复执行相同 title lookup；session page 再执行 title/directory lookup。高 session/model 基数下，相关查找次数随分组数增长，并叠加候选 1 的扫描。
- 置信度：高
- 无法确认假设：假设 better-sqlite3/SQLite 没有把这些相关子查询跨外层分组自动去重；通常 SQLite 不会把不同 outer row 的相关子查询结果共享。

## 候选 4：web bridge 每 10 秒无条件触发完整 dashboard 重查

- file：`D:/Dev/Code/omni_usage_t191/src/web/usageboard-web.ts:58-62`；caller `D:/Dev/Code/omni_usage_t191/src/renderer/views/TokenStatsView.tsx:420-431`
- summary：web `onUpdated` 由固定 `setInterval(POLL_MS=10_000)` 无条件广播；TokenStatsView 每次收到事件都会 mark cache stale，并对 preset 更新 range revision，随后重新调用新增 `getDashboard`。
- failure_scenario：没有新 token record、用户不操作时，web 面板仍每 10 秒执行一次 dashboard HTTP 请求；每次请求都重新完成候选 1 的多次同步 SQL 聚合，多个 web 页面时每页各自轮询。新 dashboard 端点让每次轮询成本集中到一个昂贵请求，缺少 last_updated/generation 条件避免空刷新。
- 置信度：高
- 无法确认假设：假设 web 页面是常驻打开且 token stats 没有独立 SSE 更新通知；当前代码中确实只看到固定 timer，没有基于数据版本的短路。

## 候选 5：web getDashboard 丢弃分页参数，翻页会重复取第一页

- file：`D:/Dev/Code/omni_usage_t191/src/web/usageboard-web.ts:235-245`
- summary：renderer caller 传入 `session_offset`、`session_limit` 及 alias 参数，但 web bridge 只序列化 agent/platform/start/end/metric/xaxis/gran；LocalAPI `/v1/dashboard` 支持的分页参数因此在 web 路径始终缺省。
- failure_scenario：用户在 web SessionTable 翻到第 11 页后，TokenStatsView 生成不同 `session_offset` 的 cache key 并发起新请求，但 URL 仍无 offset，server 每次都执行完整 dashboard 聚合并返回 offset=0 的前 100 条；翻页不能复用已有结果，也不能取得下一页，造成重复数据库工作。
- 置信度：高
- 无法确认假设：假设 web 端使用当前 TokenStatsView/SessionTable 路径（`src/web/main-web.tsx` 直接挂载同一 App，已确认）；桌面 preload IPC 不受该 bridge 丢参影响。

## 候选 6：每次 dashboard 聚合前额外执行一次 MAX(updated_at)

- file：`D:/Dev/Code/omni_usage_t191/src/main/ipc/token-stats-ipc.ts:114-122`；HTTP 同路径 `D:/Dev/Code/omni_usage_t191/src/main/core/local-api/server.ts:308-313`
- summary：IPC/HTTP caller 在调用 `query_dashboard` 前单独调用 `store.last_updated()`；该函数再对 `token_stats_sessions` 执行 `SELECT MAX(updated_at)`，与 dashboard 的 records 聚合完全独立。
- failure_scenario：每次面板首屏、选项切换、web 轮询都额外打开一次数据库查询，即使 dashboard 查询已经要读取同一数据窗口；高频刷新时形成固定附加查询和同步往返，可把 freshness 作为同一查询/缓存元数据返回。
- 置信度：高
- 无法确认假设：未确认 `token_stats_sessions` 的行数和索引规模；该项相对前 5 项通常是低成本，但请求频率高时仍是可避免的重复读取。
