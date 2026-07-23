# Task review t058（reviewer_focus: 代码）

- task：`t058_fix_chart_tooltip_xss`
- spec：`docs\tasks\t058_fix_chart_tooltip_xss\spec.md`
- diff_anchor：`67bdb00fc7c22f950947a1a57feba7ef4e68dbe2`
- target：`git diff 67bdb00fc7c22f950947a1a57feba7ef4e68dbe2`
- round：1
- reviewed_at：2026-07-23 16:25 UTC+8

## Findings

无。

## 评估明细

### AC 覆盖（代码层）

- **AC1（`<script>`/`<img onerror>` 不执行）**：`escapeHtml` (`src/renderer/lib/token-stats/chart-data.ts:323-335`) 覆盖 `& < > ' "` 五字符，三元链完整闭合；`<script>` 与 `<img onerror>` 输入经函数后均成实体，tooltip 经 innerHTML 注入不再解析为标签。✅
- **AC2（BarChart/MetricDonut 所有动态字段经 escapeHtml）**：逐字段核对见下表，无遗漏。✅
- **AC3/AC4（单测/不回归）**：测试轴，归 test reviewer。

### BarChart tooltip formatter 字段核对（`BarChart.tsx:78-104`）

| 字段                                                      | 来源                                                                                                                        | 处理                             | 结论 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---- |
| `label` (`:91`)                                           | xaxis=time→bucketize 日期；xaxis=project→`shortDir(dir)`（目录名，用户控制）；xaxis=session→`r.title`（会话标题，用户控制） | `escapeHtml(label)`              | ✅   |
| `METRIC_LABEL[metric]` (`:91`)                            | 文件顶部常量字面量                                                                                                          | 不转义（可信）                   | ✅   |
| `fmtV(total)` / `fmtV(p.value)` / `fmtV(v)` (`:91,96,99`) | `fmtTok`/`fmtInt` 数字格式化输出                                                                                            | 不转义（数字）                   | ✅   |
| `p.marker` (`:96`)                                        | ECharts 库内置生成（`<span style=...>`，颜色取自 palette 常量）                                                             | 不转义（可信库输出，非用户输入） | ✅   |
| `p.seriesName` (`:96`)                                    | `seriesNames = [...top, "其他"]`，`top` 来自 `topGroups` 聚合 model/dir key（用户控制）                                     | `escapeHtml(p.seriesName)`       | ✅   |
| `p.seriesName === "其他"` 比较 (`:97`)                    | 原值比较，不输出                                                                                                            | 不转义（不进 HTML）              | ✅   |
| `k`（otherDetails key，`:99`）                            | `Object.entries(cells[ci])` 的 key，即 model/dir 名（用户控制）                                                             | `escapeHtml(k)`                  | ✅   |

### MetricDonut tooltip formatter 字段核对（`MetricDonut.tsx:26-36`）

| 字段                        | 来源                                                                                                 | 处理                 | 结论 |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- | ---- |
| `p.name` (`:33`)            | segment.name = model/dir/agent 名（用户控制）                                                        | `escapeHtml(p.name)` | ✅   |
| `format(p.value)` (`:33`)   | 调用方传数字格式化（`fmtTok`/`fmtInt`）                                                              | 不转义（数字）       | ✅   |
| `String(p.percent)` (`:33`) | ECharts 计算的数字百分比                                                                             | 不转义（数字）       | ✅   |
| `p.data.extra` (`:34`)      | `chart-data.ts:118-128, 161-171` 构造时已对 key/value 经 `escapeHtml`；外层 `<br/><span>` 为固定模板 | 拼接原始值（已转义） | ✅   |

### 非范围内的相邻面（仅记录，不进 finding）

- **`Heatmap.tsx:40` tooltip formatter**：`${day} ${hour}:00 — <b>${fmtV(p.value[2])}</b> ${METRIC_LABEL[metric]}`。`day` 来自 `WEEKDAYS` 常量，`hour`/`p.value[2]` 为数字，`METRIC_LABEL` 为常量。无用户控制字段。即便不在本 task spec 范围（spec 仅命名 BarChart/MetricDonut），本身无 XSS 风险。
- **`MetricDonut.tsx:46` 系列中心 label `{v|${centerValue}}`**：series label 走 ECharts canvas/SVG 文本渲染，不经 innerHTML；且 `centerValue` 调用点（`TokenStatsView.tsx:375,389,401,424`）为 `fmtTok`/`fmtInt`/百分比格式化输出。`topAgentLabel`（`TokenStatsView.tsx:410` ← `:278`）含 agent 名，但渲染路径非 innerHTML，无 XSS 风险。本 task spec 明确聚焦 tooltip innerHTML 路径，系列 label 不在范围。

### 不变量 / 约束遵守

- **「不改 ECharts 版本或渲染方式」**：仅转义输入，未换库、未改 renderer。✅
- **「无外部依赖；纯 renderer 转义修复」**：未引入新依赖，`escapeHtml` 为本文件既有内部函数，改 `function` → `export function`。✅
- **「统一：动态字符串一律 escapeHtml」**：BarChart 与 MetricDonut 均复用同一 `escapeHtml`，未在组件内再造。✅

### 代码质量

- **DRY**：`escapeHtml` 在 `chart-data.ts` 内部（`:123,166` extra 构造）与外部（BarChart、MetricDonut）三处调用均复用同一实现。无重复。
- **控制流**：`escapeHtml` 三元链 CC≈6（基数 1 + 5 个字符分支），低于 10 阈值。
- **边界**：`labels[ci] ?? ""`（`BarChart.tsx:89`）已处理 undefined；`otherDetails[ci]?.slice(0,10)`（`:98`）可选链兜底；`escapeHtml` 入参均为 `string` 类型，无 null 穿透。
- **命名 / 职责**：`escapeHtml` 导出自 chart-data 模块略偏 utility 味，但函数本就预存在该文件，仅改可见性属最小改动；为追求「utility 归位」另起文件会扩大改动范围，违反精准修改原则。不构成 finding。
- **死代码 / 无用 import**：无。
- **文件大小**（`wc -l`）：`chart-data.ts` 406 行（本 task 净增 0 行，改可见性不增行）；`BarChart.tsx` 193 行；`MetricDonut.tsx` 73 行。均不达「净增致超阈值」触发条件。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 总体判断：转义覆盖 BarChart 与 MetricDonut tooltip 内全部用户控制字段；ECharts 库生成的 `marker`、数字格式化输出、预转义的 `extra` 正确保留原状；无遗漏、无自由发挥、无 scope 漂移。

verdict: PASS
