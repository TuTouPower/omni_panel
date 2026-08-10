# d009 窗口「完整小时段 + 边界段」UNION 精确重组；SQLite NULL 唯一键互异（2026-08-03）

- 来源：t192
- 结论：任意 `[start, end)` 窗口与整点小时聚合表的对齐拆分：`full_start = ceil_hour(start)`、`full_end = floor_hour(end)`；当 `full_start < full_end` 时窗口拆为 `[start, full_start) ∪ [full_start, full_end) ∪ [full_end, end)`，聚合表覆盖中段、records 覆盖两个不足整点的边界带，UNION ALL 后外层 `SUM(calls)`/`SUM(tokens)` 精确重组、`COUNT(DISTINCT session)` 跨两部分去重。**当无完整小时（`full_start > full_end`）时，原边界公式 `[start, full_start) ∪ [full_end, end)` 会溢出窗口**（例 `[07:35,08:00) ∪ [07:00,07:55) = [07:00,08:00)`），必须整窗回落 records。
- 证据：t192 dashboard aggregate read path 用例覆盖跨小时/跨天、不足一小时窗口、agent/platform 过滤、三 metric、xaxis time/project/session、别名、分页，聚合路径与 records 路径逐区 `toEqual`。
- 影响：凡「预聚合小时表 + 任意窗口查询」场景可复用该拆分；不足一小时窗口的边界带公式溢出是通用陷阱。
- 现状：有效
