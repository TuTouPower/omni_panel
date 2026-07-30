# Task spec

## 背景

t164 遗留。KPI/donut 改用 `token_stats_buckets`（按日聚合）后，代理面板 KPI 的 current/prev 窗口 delta 由 buckets 的 `bucket_date`（UTC YYYY-MM-DD）字符串切分。24h preset 下，current 窗口拉 2 倍宽（48h）再按 date 切：current = 48h 含两天的 buckets，prev = 再前 24h 含一天——窗口宽度不对称，导致 24h delta 偏大（约 100% 误差）。7d/30d preset 因窗口足够宽，单日边界误差占比小，可接受。

## 范围

- 评估并实现 24h preset 的精确 delta。候选方案：
    - A：24h preset 下 KPI/donut 改用 records 驱动（records 带 start/end + limit，按精确 epoch 窗口聚合），buckets 仅用于 ≥7d 窗口。
    - B：新增 `token_stats_hourly` 聚合表（按小时），KPI 按 hourly 精确切分。collector 扩展 hourly emit。
    - C：buckets 切分改用 epoch 而非 date 字符串（需 buckets 带精确时间戳，当前只有 bucket_date）。
- 推荐方案 A（最小改动，复用 t162 的 records limit；24h 内 records 量本机约 2.3 万，受 limit 保护可接受）。

## 非范围

- 不改 7d/30d preset（日级边界误差占比小，保留 buckets 驱动）。
- 不改 Bar/Heatmap（已用 records）。
- 不改 collector（方案 A 不需新表；方案 B 需改 collector，若选 B 则改范围）。

## 验收标准

- [ ] 24h preset 下 KPI delta（tokens/sessions/calls/hitRate）基于精确 24h 窗口，不再因日级边界偏大。
- [ ] 7d/30d preset KPI delta 与改动前一致（不受影响）。
- [ ] 24h KPI 数值与改动前"肉眼合理"（current 与 prev 窗口宽度对称）。
- [ ] 单测覆盖 24h 窗口切分正确性。

## 依赖与约束

- 前置：t162（records limit）、t164（buckets/sessions 数据流）。
- 方案 A 需 TokenStatsView 在 24h preset 分支用 records 聚合 KPI（metricValue/hitRateOf），其余 preset 用 buckets。
- 24h records 量（本机 2.3 万）受 t162 limit 5000 保护时会截断——需评估 24h preset 是否提高 limit（如 24h 专用 limit 30000）或接受近似。
