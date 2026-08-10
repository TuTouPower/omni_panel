# d015 sparkline 查询需 source_instance_id 维度；idx_trend 对该查询冗余（2026-08-05）

- 来源：t214
- 结论：`query_trend_series` SQL 须含 source_instance_id 过滤——多账号 provider（tavily 等 12 个，connector 给所有账号写同一 account_id）账号真实身份压在 source_instance_id，缺该维度则同 provider 多实例采集混桶取随机最新，sparkline 显示错误账号数据（t057「instance 区分足够」结论只对 insert/get_latest/list_latest 成立，对 query_trend_series 不成立，漏验 sparkline）。加维度后 SQLite planner 改用 idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)——全覆盖 WHERE 等值列 + observed_at 范围；idx_trend(provider, account_id, metric_id, observed_at) 不含 source_instance_id，对该查询已冗余（planner 不选），但对不含 instance 的等价查询路径仍可用，故保留。
- 证据：t214 DB 实测 tavily 8 实例每天混桶（2026-07-29 有 392 行来自 8 实例，旧逻辑取随机最新）；EXPLAIN QUERY PLAN 加 source_instance_id 后显示 `USING INDEX idx_lookup`；集成测试 `trend-instance-isolation.test.ts` + local-api 端点测试验证隔离。
- 影响：trend 三路径（IPC trend:get/getBulk、local-api /v1/trend、web）均须透传 source_instance_id；account card 恒单 instance（accountKey 含 sourceInstanceId），bulk 顶层单一 source_instance_id 安全。后续若清理 idx_trend 须确认无其他查询路径依赖。
- 现状：有效
