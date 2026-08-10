# p031 query_dashboard records 与聚合路径双轨重复（2026-08-03）

- 来源：t192_code_f002（t192 Round 1，minor）
- 内容：`query_dashboard` 四段查询区域（read_rollup、time bucket、session 列表、heatmap）各维护 records 与 rollup 两份实现，语义等价但写法不同（`SUM(calls)` vs `COUNT(*)`、rollup 路径 GROUP BY 含 agent、started_at/ended_at 由子查询提供）。当前经 oracle 测试逐区相等无分叉，但长期修复遗漏源：任一区域修正须同步两份；read_rollup 聚合路径 GROUP BY 多含 `agent` 列，若未来 session 跨多 agent 则两路径产出不同行数。
- 处理：t201
