# p171 token-stats 会话跨多 directory 时 rollup 汇总翻倍

- 现象：rollup ready 后 dashboard 查询，若同一 (source, env, session_id) 跨多个 directory（罕见，session 通常绑定单 transcript 目录），聚合输出 SUM(calls/tokens) 翻倍。实测：window_rows 该 session 两目录 10+5=15，session_meta 两行，LEFT JOIN 后输出 20+10=30。oracle（records 路径）无此放大。
- 影响：token-stats 用量面板会话/项目维度的 token 与调用数虚高；会话列表重复该 session。仅 rollup ready 路径、跨多 directory 会话触发。
- 根因：`src/main/core/token-stats/token-stats-store.ts` `materialize_session_meta` from_records=false 分支按 `GROUP BY source, env, session_id, directory` 建 session_meta（现 608-620 行；多 directory 会话多行），而 `read_rollup_from_window_rows`（现 701-722 行）LEFT JOIN ON 只含 source/env/session_id（706-708 行），window_rows 每行与 session_meta 该 session 全部行相乘放大 SUM。t351 AC-002 引入（from_records 分支）。复验（.scratch/p171_repro.test.ts）：同 session 两目录（input 10+20+5=35 tokens 口径）rollup ready 输出 460=230×2，records 路径 230 正确，翻倍仍存在。已扫同类位点（检索轴：window_rows×session_meta JOIN 放大）：`dashboard_session_page_from_meta` 会话列表重复该 session（同根因下游症状，非独立放大）；`query_range_rollup`/`metric_buckets`/`session_buckets`/`heatmap` 均直读 window_rows/records、无 session_meta JOIN、无放大；仅 `read_rollup_from_window_rows` 一处放大位点，`query_dashboard_sessions` 复用同一函数同因。已扫，无其他同因位点。
- 测试缺口：token-stats-store.test.ts 的 dashboard rollup 测试均用单 directory 会话（dashboard aggregate read path 数据 s1/s2/s3/s4 各绑单目录），未覆盖同 session 跨多 directory；唯一多目录用例「splits a session into separate groups when directory changes」（1762 行）只查 token_stats_hour_rollup 表，不触 dashboard 读路径。应补「同 session 两 directory 时 rollup ready 汇总 == records 路径」断言。
- 线索：review_20260813_114911 后续 t351 review_general.md f005（reviewer 实测 15→30）。
- 处理：t387
- 核实：2026-08-15 问题仍存在；根因机制与现状一致（行号由 693-694 漂移至 706-708，逻辑不变）；复验 rollup ready 460 vs records 230，翻倍实证；同类位点已扫无其他独立放大位点；测试缺口成立。
