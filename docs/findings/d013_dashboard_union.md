# d013 模型过滤可加在 dashboard 窗口物化 union 两侧，聚合与全窗口一致（2026-08-04）

- 来源：s013
- 结论：dashboard 窗口物化（`dashboard_window_union_builder`）在 hour_rollup 整小时段与 records 边缘小时段两侧 WHERE 各加 `AND model = @model`（与 agent/env 并列），聚合结果（calls 用 `SUM(calls)`、sessions 用 `COUNT(DISTINCT source||env||session_id)`、tokens 用四分量求和）与 records 全窗口过滤完全一致；窗口内 distinct model 列表可直接从 `token_stats_records` 按 agent/platform/range 过滤查 `SELECT DISTINCT model ORDER BY model`（records 全窗口与 union 窗口数量相同），且须不含 model 条件——否则选中模型后下拉坍缩无法直接切换。
- 证据：s013 用本机真实库（530k records）7d 窗口实测，`gpt-5.6-sol` 过滤后 calls=12850/sessions=43/tokens=1261048396，records 全窗口与 store 结构 union 两侧过滤逐项相等；distinct model 两种取法均 19。
- 影响：dashboard / dashboard_sessions 加 `model` 可选参数即可复用现有窗口物化，无需新表；rollup 未就绪路径（`dashboard_records_source`）与 `build_dashboard_conditions` 同样加条件。
- 现状：有效
