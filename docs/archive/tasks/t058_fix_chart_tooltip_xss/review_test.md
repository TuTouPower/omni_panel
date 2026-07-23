# Task review t058（reviewer_focus: 测试）

- task：`t058_fix_chart_tooltip_xss`
- spec：`docs\tasks\t058_fix_chart_tooltip_xss\spec.md`
- diff_anchor：`67bdb00fc7c22f950947a1a57feba7ef4e68dbe2`
- target：`git diff 67bdb00fc7c22f950947a1a57feba7ef4e68dbe2`
- round：1
- reviewed_at：2026-07-23 22:30 UTC+8

## Findings

### t058_test_f001 - 缺 formatter 输出无未转义 `<` 的集成测试（AC3 后半未覆盖）

- 严重度：important
- 位置：`tests/unit/renderer/lib/token-stats/chart-data.test.ts:36-50`（仅新增 escapeHtml 单测）；未覆盖的 AC 证据点在 `src/renderer/components/token-stats/BarChart.tsx:78-104` 与 `src/renderer/components/token-stats/MetricDonut.tsx:26-36` 的 tooltip formatter
- 问题：spec AC3 原文「单测覆盖 escapeHtml 输入 **+ formatter 输出无未转义 `<`**」明确两件事，diff 只做了前半（escapeHtml 纯函数级输入/输出）。两个组件的 tooltip formatter 是 XSS 路径的实际出口（ECharts 经 innerHTML 渲染），但无任何测试把恶意字符串（如 `<script>` / `<img onerror>`）喂进 formatter 并断言返回 HTML 中不含未转义 `<` / 不含危险子串。escapeHtml 单测通过 ≠ formatter 调用了 escapeHtml ≠ 所有动态字段都被转义。AC1（「tooltip 含 `<script>` / `<img onerror>` 字符串不执行」）同样依赖 formatter 级证据，当前也未覆盖。
- 建议：最小修复方向二选一：
    1. 把 BarChart / MetricDonut 的 tooltip formatter 提取为 `chart-data.ts` 中纯函数（如 `formatBarTooltip(ps, labels, metric, totalFmt, otherDetails)` / `formatDonutTooltip(p, format)`），针对含 `<script>` / `<img onerror>` 的 `seriesName` / `name` / `label` / `otherDetails` key 输入，断言返回串不含未转义 `<`（如 `/<(?!\/?b>|br\/?>)/` 不匹配，或直接断言不含 `<script` / `<img` 子串且 `<` 后仅跟 `b>` / `br/>` / `span` 等白名单标签）。
    2. 若不重构，用 `@testing-library/react` + ECharts 实例触发 `mousemove` 显示 tooltip，断言 tooltip DOM 文本内容里原文呈现 `<script>` 字符串而非执行脚本（行为级证据，可信度更高）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：1 条。
- 总体判断：escapeHtml 纯函数级单测覆盖到位（`<script>` / `<img onerror>` / `&<>'"` 均断言精确输出，无危险模式），但 AC3 后半「formatter 输出无未转义 `<`」未覆盖，AC1 亦缺 formatter 级证据——本轮 diff 让「escapeHtml 正确」可证，但未让「tooltip HTML 无 XSS」可证。

verdict: FAIL

## Round 2 (2026-07-23 23:50 UTC+8)

### 前轮 finding 复核

- **t058_test_f001（important）→ 已修**：
    - 实现侧：`src/renderer/components/token-stats/BarChart.tsx:39-66` 提取 `build_bar_tooltip_html`（label / seriesName / otherDetails key 经 `escapeHtml`），`src/renderer/components/token-stats/MetricDonut.tsx:23-32` 提取 `build_donut_tooltip_html`（name 经 `escapeHtml`）；formatter 仅一行转发（`BarChart.tsx:118-119`、`MetricDonut.tsx:45`）。`chart-data.ts:323` 将 `escapeHtml` 由 `function` 改为 `export function`。
    - 测试侧：新增 `tests/unit/renderer/components/token-stats/tooltip_xss.test.ts` 6 用例 + `chart-data.test.ts:36-50` 补 `escapeHtml` 纯函数单测。
    - AC3 后半（formatter 输出）覆盖完整性：spec 列出的 4 个动态字段逐一喂恶意串并断言——label `<script>alert(1)</script>`（test 1）、seriesName `<img onerror='a'>`（test 2）、otherDetails key `<b>evil</b>` 且 `seriesName === "其他"` 触发分支（test 3）、donut name `<script>x</script>`（test 4）+ `<img onerror='a'>`（test 5），另附 null params 边界（test 6）。
    - 断言强度：`not.toContain("<script>")` / `not.toContain("<img onerror")` + 正向 `toContain("&lt;script&gt;")` / `toContain("&lt;b&gt;evil&lt;/b&gt;")`。escapeHtml 若被绕过或漏调，对应断言必然失败。非恒真、非 `toBeDefined` 充数、非 `.skip` / `.only`、非 `if` 包裹 expect、非 mock-self。符合 R1 选项 2 建议形式。
    - 本地验证：`pnpm vitest run tests/unit/renderer/components/token-stats/tooltip_xss.test.ts tests/unit/renderer/lib/token-stats/chart-data.test.ts` → PASS 20 / FAIL 0。
    - 残留风险（非 finding，仅提示）：测试直调纯函数，未走 React 组件 → ECharts formatter 调度链；若未来有人在组件内联新 formatter 绕过 `build_*_tooltip_html`，本测试不能捕获。R1 已明确接受选项 1（提取纯函数）作为合规修复路径，此风险归属代码 review 维度，不构成测试 finding。

### 本轮新发现

无。

### 总体判断

R1 f001 彻底修复（提取纯函数 + 恶意输入断言覆盖全部动态字段，断言强度满足 R1 建议）；本轮扫描未发现新的危险模式、断言弱化、覆盖倒退或回归风险。

verdict: PASS
