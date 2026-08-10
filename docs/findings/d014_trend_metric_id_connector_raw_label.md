# d014 trend 查询键是 metric_id（connector 完整键），非 raw_label（2026-08-05）

- 来源：t207
- 结论：`observation-store.query_trend_series` 的 SQL `WHERE provider=? AND account_id=? AND metric_id=? AND observed_at>=?` 按 `metric_id` 列精确匹配。`metric_id` 列存的是 connector/executor 写入时构造的完整键，与 `raw_label`（短标签）不同：CPA Claude = `claude:${account_id}:${key}`（key=`five_hour`/`seven_day`），opencode_go = `opencode_go:${raw_label}`，grok = `grok:product:${raw_label}`，tavily = `tavily:monthly_usage`，tier1/probe executor = `${manifest.id}:usage`。前端 `trend:getBulk` / `trend:get` / web `/v1/trend` 三条路径的查询键必须等于该列值。`raw_label` 仅作 label-map 配置键，与 trend 查询无关。
- 证据：t207 跨层集成测试 `tests/integration/observation/trend-query-key.test.ts` 用真实 store 验证 CPA Claude 与 opencode_go 两种 metric_id 构造形态均能查回，反证条用 raw_label 查回全 null。回归源 commit 48512085（p022）误以「observation store 以 raw_label 索引」为前提。
- 影响：`usageItemSchema` 加可选 `metric_id`（plugin 脚本输出不产，runtime ready-state 经 `observation_to_metric_record` 必填）；`ProviderUsagePeriod.metric_id` 必填；前端 `ProviderAccountRow` bulk 用 `period.metric_id` 查询。新 connector 的 metric_id 构造规则须保证 trend 查询路径能拿到一致键。
- 现状：有效
