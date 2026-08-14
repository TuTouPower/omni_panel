# p171 token-stats 会话跨多 directory 时 rollup 汇总翻倍

- 现象：rollup ready 后 dashboard 查询，若同一 (source, env, session_id) 跨多个 directory（罕见，session 通常绑定单 transcript 目录），聚合输出 SUM(calls/tokens) 翻倍。实测：window_rows 该 session 两目录 10+5=15，session_meta 两行，LEFT JOIN 后输出 20+10=30。oracle（records 路径）无此放大。
- 影响：token-stats 用量面板会话/项目维度的 token 与调用数虚高；会话列表重复该 session。仅 rollup ready 路径、跨多 directory 会话触发。
- 根因：`src/main/core/token-stats/token-stats-store.ts` `materialize_session_meta` from_records=false 分支按 `GROUP BY source, env, session_id, directory` 建 session_meta（多 directory 会话多行），而 `read_rollup_from_window_rows` 的 LEFT JOIN ON 只含 source/env/session_id（693-694 行），window_rows 每行与 session_meta 该 session 全部行相乘放大 SUM。t351 AC-002 引入（from_records 分支）。已扫：`dashboard_session_page_from_meta`（会话列表重复）、`dashboard_session_page`（records 路径无此问题）；无其他同因位点。
- 测试缺口：token-stats-store.test.ts 的 rollup 测试均用单 directory 会话，未覆盖同 session 跨多 directory；应补「同 session 两 directory 时 rollup ready 汇总 == records 路径」断言。
- 线索：review_20260813_114911 后续 t351 review_general.md f005（reviewer 实测 15→30）。
- 处理：未开
