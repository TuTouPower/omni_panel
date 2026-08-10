# p024 query_range_rollup 的 title 子查询选全表最新而非窗口内最新（2026-08-01）

- 来源：t184 review Round 2 f003 复核提示（non-blocking）
- 内容：`token-stats-store.ts` 的 `query_range_rollup` 用相关子查询选每组最新 timestamp 的 title 对齐 records `rs[0].title`，但子查询 `WHERE t2.session_id=... AND source=... AND env=...` 未带窗口 `timestamp` 过滤，选的是该 session 全表最新标题。records 版 `query_records` 先按窗口过滤再 `ORDER BY timestamp DESC`，`rs[0].title` 是窗口内最新。差异：session 在窗口外被改名时，rollup 返回窗口外的新名，session 轴 label 前 7 字符可能漂移；token 统计不受影响。如需严格对齐，给子查询加 `timestamp >= @start`（与外层窗口一致）条件。
- 处理：t188
