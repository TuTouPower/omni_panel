# Task plan

## 步骤与验证

1. 确认方案：对比 A（records 驱动 24h KPI）/B（hourly 表）/C（buckets epoch）。推荐 A--评估 24h records 量与 limit 取舍 -> 验证：方案决策记录。
2. 方案 A 实现：TokenStatsView 在 `preset === "24h"` 分支，KPI/donut 用 records 版聚合（metricValue/hitRateOf/agentSegments/compositionSegments/modelSegments/projectSegments）；prev 窗口用 prevRangeRecords -> 验证：typecheck。
3. 24h records limit 评估：24h 内 records 量（本机 2.3 万），若超 5000 截断会失真；24h preset 专用 getRecords 调用提高 limit（如 30000）或接受近似 -> 验证：单测 + 手动。
4. 7d/30d 分支保留 buckets 驱动不变 -> 验证：单测 7d/30d 仍走 buckets。
5. 单测覆盖 24h 窗口切分（current/prev 各 24h 精确对称）+ 7d/30d 不回归 -> 验证：单测。
6. `pnpm test` + 手动对比 24h KPI delta 前后 -> 验证：数值合理（对称窗口）。

## 风险与回退

- 风险：24h records 量超 limit 截断导致 KPI 失真--需专用更高 limit 或接受近似（24h 内单 session 不会超万级，聚合后可接受）。
- 风险：24h 与 7d/30d 两套 KPI 路径并存增加维护复杂度--通过清晰分支 + 注释控制。
- 风险：方案 A 的 records 版聚合需保留 t164 删除前的函数（agentSegments/compositionSegments 等仍存在，modelSegments/projectSegments 需确认未被删）。
- 回退：24h 回到 buckets 驱动（接受日级边界偏大）。

## Finalization 时更新的 blueprint

- `docs/specs/ai-cli-token-stats-ui.md`：数据源分工表补 24h preset 例外（records 驱动 KPI）。
