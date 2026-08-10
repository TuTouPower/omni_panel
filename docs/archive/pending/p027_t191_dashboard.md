# p027 t191 dashboard 单请求对同一窗口重复执行多次聚合

- 来源：t191_code_f004
- 内容：`query_dashboard` 对同一 `[start,end)` 窗口串行执行 current/previous rollup、time chart、session count、session page、heatmap 共 5–6 次全窗口聚合；better-sqlite3 同步执行期间 IPC/local API 请求排队
- 处理：t201
