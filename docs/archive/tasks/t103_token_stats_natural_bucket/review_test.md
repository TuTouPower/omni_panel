# Task review t103（reviewer_focus: 测试）

- task：`t103_token_stats_natural_bucket`
- spec：`docs\tasks\t103_token_stats_natural_bucket\spec.md`
- diff_anchor：`917567d3192d82b31c615718f42f5f59441cac5f`
- target：`git diff 917567d3192d82b31c615718f42f5f59441cac5f`
- round：1
- reviewed_at：2026-07-24 23:01 UTC+8

## Findings

### t103_test_f001 - 24h/30d 未覆盖实际柱状图聚合路径，小时模式 AC 缺少回归保护

- 严重度：important
- 位置：`tests/unit/renderer/lib/token-stats/aggregate.test.ts:146-169`、`tests/unit/renderer/lib/token-stats/chart-data.test.ts:192-225`、`tests/unit/renderer/views/token_stats_view.test.tsx:10-12`
- 问题：24h 与 30d 只直接断言 `bucketize` 的桶数量或 label，实际柱状图唯一新增的聚合测试仅以 `gran="day"` 调用 `prepareBarData`。`TokenStatsView` 将 `BarChart` 整体 mock，未检查用户选择的 `gran` 是否透传。若 `prepareBarData` 或视图/组件调用链错误地固定使用 day granularity，直接 `bucketize(..., "hour")` 仍会通过，但 24h 面板会聚合成日桶而非要求的 25 根小时柱；同类问题也会使 30d 的 31 根桶未受真实数据路径保护。
- 建议：在 `prepareBarData` 添加 `start=2026-07-23 15:30`、`end=2026-07-24 15:30`、`gran="hour"` 用例，断言 25 个 labels/bucketStarts 及首、中、末小时 record 分别落入索引 0、相应完整桶、24；并让 `TokenStatsView` 的 BarChart mock 可捕获 props，断言选择小时粒度时传入 `gran="hour"`。可同测或另测 30d 透传后输出 31 个日桶。

## 结论

- 本轮新发现：1 条。
- 测试可信：新增测试均使用真实纯函数，无新增 mock、skip、only、条件跳过、超时或恒真断言；测试 diff 空白检查通过。
- 验收覆盖：7d 的 `prepareBarData` 实际日桶聚合已覆盖；24h/30d 仍停在 `bucketize` 单元级，未覆盖到柱状图实际聚合与视图透传，不能充分证明「24 小时显示约 25 根柱」及 30d 柱状图输出。
- 已运行：`pnpm exec vitest run tests/unit/renderer/lib/token-stats/aggregate.test.ts tests/unit/renderer/lib/token-stats/chart-data.test.ts`，31 passed。

verdict: FAIL

## Round 2 (2026-07-24 23:09 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：`t103_test_f001` 已修。`tests/unit/renderer/lib/token-stats/chart-data.test.ts:227-262` 经 `prepareBarData` 真实聚合路径验证 24h 的 25 个自然小时桶、首/中/末 partial 或完整桶的记录归属，以及 30d 的 31 个自然日桶和首末 bucket start；`tests/unit/renderer/views/token_stats_view.test.tsx:188-204` 捕获 `BarChart` props，验证 24h 切换为 `gran="hour"`、30d 恢复 `gran="day"`。`TokenStatsView.tsx:280-284` 的 preset 切换逻辑与此一致。
- 当前 spec 的 DST 约束与实现一致：本地 `Date` setter 推进自然边界，不使用固定毫秒步进，且明确 DST 专用测试不在范围内。
- 测试可信：新增用例使用固定本地时间与真实纯函数；视图层 mock 仅隔离图表渲染并捕获公开 props。未发现新增 skip、only、条件跳过、超时、弱化或恒真断言。
- 已运行：`pnpm exec vitest run tests/unit/renderer/lib/token-stats/aggregate.test.ts tests/unit/renderer/lib/token-stats/chart-data.test.ts tests/unit/renderer/views/token_stats_view.test.tsx`，39 passed。

verdict: PASS
