# Task review t383（reviewer_focus: 测试）

- task：`t383_trend_xaxis_labels_granularity`
- spec：`docs/tasks/t383_trend_xaxis_labels_granularity/spec.md`
- diff_anchor：`56b9b6d3d32361cdeacd222693bff54310455fe0`
- target：`git diff 56b9b6d3d32361cdeacd222693bff54310455fe0`
- round：1
- reviewed_at：2026-08-15 04:45 UTC+8

## Findings

### t383_test_f001 - /v1/trend 集成测试未断言 date 时刻格式（AC-004 第三消费方未钉）

- 严重度：minor
- 锚点：AC-004（三路径序列一致含时刻）
- 位置：`tests/integration/local-api/server.test.ts:1598-1651`（"GET /v1/trend filters by source_instance_id"）
- 问题：AC-004 三个消费方中，`trend:get` / `trend:getBulk` 在 `trend-ipc.test.ts` 已把断言更新为 ISO 时刻（`T12:00Z` / `T08:00Z`），而 `/v1/trend` 集成测试只断言 `percent`（10 / 50），未对响应 `date` 字段做任何断言。当前 `server.ts:1454` 与 IPC 共享同一 `build_trend_series`，格式一致由函数单测保证，故不阻断（spec 可测试性声明亦把 HTTP 往返列 `[deploy]`）。但若未来该路径改用独立格式化逻辑丢弃时分，现有测试不报警。
- 建议：在 `/v1/trend` 集成测试中对 `points_a[0].date` 加格式断言（精确值或 `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/`），补全第三消费方的时刻链路覆盖。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无「迁就实现」的改测。逐处核验：
  - `trend.test.ts:44-47` 既有断言 `"2026-07-14"` → `"2026-07-14T00:00Z"`：spec AC-001 明确要求 date 保留时刻，属契约变更后的合法预期更新，非就地迁就；断言仍为精确 `toBe`，未弱化。输入观测为 UTC 午夜（`Date.UTC(2026,6,20)`），`T00:00Z` 是契约正确输出。
  - `trend-ipc.test.ts:75,128-129`：mock 的 `observed_at` 本就是非午夜时刻（`Date.UTC(2026,6,14,12,0,0)` / 8 点），断言改为含时刻的精确值，实为**强化**——通过 IPC handler 真实触达 `build_trend_series` 验证时刻保留，非放水。
  - `trend_sparkline.test.tsx` 旧「renders at most ~5 X-axis date labels」：按 spec 测试策略「整体删除或按新语义整体替换」处理——已删除，由 AC-002/AC-003/AC-001 三个新测试替换，未就地改预期。
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - AC-003「不重叠」仅以标签数上界为代理断言（13 个 × 估算宽 38px = 494px < 514px 内宽），未做像素级几何断言——符合 spec 上下文区「有意不测」跨平台字体逐像素度量。
  - AC-005 数据点圆点可见性由既有测试（"one circle per point" / "skips null"）保持，未随 t383 改动删除；120 点 + 节流场景下圆点数无专门断言，但 circle 渲染路径（`valid.map`）与 `label_indices` 完全解耦，风险低，可作可选扩展。
- 总体判断：测试改动可信、覆盖达标、无危险模式、改测方向合规；mutation 敏感性经隔离 worktree 实测验证（`same_day` 强制 false → AC-001 1 failed；节流删除（`target_labels = n`）→ AC-003 1 failed；`format_utc_iso` 回退 `format_utc_date` → trend 2 + IPC 2 = 4 failed；`same_day` 强制 true → 4 failed），implementer 声称的「same_day 失效 1 failed」属实。仅 1 条 minor，verdict PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 3323a63e785456bd
