# p023 自定义 ≤25h 范围的小时柱仍走 records，高密度时同源截断（2026-08-01）

- 来源：t183 review 结论段提示（spec 明确保守保留，未随 t183 修复）
- 内容：`TokenStatsView` 的 `hour_fetch` 条件为 `gran !== "hour" || !time_axis || (is_short_window && preset !== "24h")`——非 24h preset 的 ≤25h 自定义范围（custom range）时间轴小时柱仍走 records，高密度时受倒序 LIMIT 50000 截断，与 p020 同源。t183 只覆盖 24h preset；如需消除，让 ≤25h 自定义范围同样走 hour 聚合（hour 聚合支持任意窗口，无短窗口对称切分约束——那是 KPI/donut 的事）。
- 处理：t187
