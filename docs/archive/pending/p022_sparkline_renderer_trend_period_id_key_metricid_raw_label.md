# p022 sparkline 恒空：renderer trend 传 period.id（长）与 trend key metricId（raw_label 短）不匹配（2026-08-01）

- 来源：t181 review 未进表提示（pre-existing 系统性 fixture 不一致）
- 现象：synthetic e2e 下 sparkline 恒空。renderer `trend_api.get(provider, accountId, period.id)` 传完整 period.id（长，如 `srcInstanceId:...:metricId`），但 trend 数据 key（real responses / mock_server）的 metricId 是 raw_label（短，如 `gemini-models`）→ 不命中 → 空。
- 根因：renderer 传 period.id，trend 索引按 raw_label。real/real-server 同机制（query_trend_series 按 metric_id 精确匹配）。
- 处理：已修（2026-08-02 手动修复，直接在 main）——ProviderAccountRow.tsx trend 调用改传 `period.raw_label`（与 trend key metricId 一致），对齐 real 录制行为。
