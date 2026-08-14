# Task review t383（reviewer_focus: 代码）

- task：`t383_trend_xaxis_labels_granularity`
- spec：`docs/tasks/t383_trend_xaxis_labels_granularity/spec.md`
- diff_anchor：`56b9b6d3d32361cdeacd222693bff54310455fe0`
- target：`git diff 56b9b6d3d32361cdeacd222693bff54310455fe0`
- round：1
- reviewed_at：2026-08-15 04:37 UTC+8

## Findings

### t383_code_f001 - `label_indices` 在 `target_labels == 1 && n > 1` 时 0/0 得 NaN，静默不渲染 X 轴标签

- 严重度：minor
- 锚点：边界条件缺陷（宽度极窄时触发，当前调用方不可达）
- 位置：`src/renderer/components/TrendSparkline.tsx:92-99`（分母 `target_labels - 1`，第 98 行）
- 问题：`max_labels = Math.max(1, Math.floor(inner_width / est_label_width))`，`target_labels = Math.min(n, max_labels)`。当 `inner_width < 76`（即 `width < 122`）且 `n >= 2` 时，`target_labels == 1`，第 98 行 `Math.round((k * (n - 1)) / (target_labels - 1))` 出现 0/0 → `NaN`。`label_indices` 为 `[NaN]`，整数下标 `i` 永不等于 `NaN`，`should_label` 恒 false → 该图 X 轴标签整体消失（不崩溃）。旧实现 `target_labels = n <= 5 ? n : 4` 对 `n >= 2` 恒 ≥2，分母恒 ≥1，无此边界；本 diff 引入该回归。当前唯一调用方 `ProviderAccountRow.tsx:288` 未传 width（默认 560 → `max_labels = 13`），故实际不可达，为潜在缺陷。
- 建议：`label_indices` 生成处加保护，如 `target_labels <= 1 ? [] : Array.from(...)`，或在 `target_labels == 1 && n > 1` 时退回固定标签（首尾各一），避免 NaN 分母。

### t383_code_f002 - `format_utc_date` 改为无生产消费方的导出（死代码）

- 严重度：minor
- 锚点：代码质量-死代码
- 位置：`src/shared/lib/trend.ts:45-49`
- 问题：`build_trend_series` 改走 `format_utc_iso` 后，`format_utc_date` 全仓仅 `tests/unit/shared/trend.test.ts:4,156-157` 引用，`src/` 生产代码零引用（已 grep 验证）。保留导出不破坏任何消费方（无生产消费者），但属死代码。
- 建议：若确认无外部契约依赖，删除该函数及其测试；若作为公开 API 保留，补一行注释说明保留原因（避免后续误判为死代码）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - `TrendSparkline.tsx:85` `const non_null = valid_points;` 是同一数组的冗余别名，无新增信息，建议直接复用 `valid_points`。
  - spec「Finalization 时更新」要求 `docs/specs/web-panel.md` 补 `/v1/trend` 响应 `date` 字段格式说明（当前 `YYYY-MM-DDTHH:mmZ`），本 diff 未含该文档改动，属 finalization 收尾项，非实现缺陷。
- 总体判断：AC-001~005 全部达成，三消费方共享 `build_trend_series` 一致，`format_utc_date` 并存不破坏消费方，数据点圆点（AC-005）未受影响，改动面收束在 spec 范围内；仅 2 条 minor（不可达的窄宽除零边界 + 死代码），无未解决 critical/important，PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 3323a63e785456bd
