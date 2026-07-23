# Task spec

## 背景

review_20260723_opus：I10（`src/renderer/components/token-stats/BarChart.tsx:91,96,99`）ECharts tooltip formatter 拼 HTML，`label`/`p.seriesName`/`otherDetails` 未转义；xaxis=session 时 label 是用户会话标题，xaxis=project 是目录名，seriesName 是 model/项目名；ECharts tooltip 经 innerHTML 渲染。I11（`MetricDonut.tsx:32`）`${p.name}` 未转义。`chart-data.ts:323` 已有 `escapeHtml` 却只用于 extra 字段。web 构建下可触发脚本执行。

## 范围

- BarChart tooltip formatter：所有动态字符串（label、seriesName、otherDetails）经 `escapeHtml`。
- MetricDonut tooltip：`escapeHtml(p.name)` 或在 segment 构造时统一转义。
- 统一：动态字符串一律 escapeHtml，或 formatter 返回 DOM 节点（避免 innerHTML）。

## 非范围

- 不改 ECharts 版本或渲染方式（仅转义输入）。
- 不处理桌面端 contextIsolation 已有的防护（本 task 针对 web 构建与 DOM innerHTML 路径）。

## 验收标准

- [ ] tooltip 含 `<script>` / `<img onerror>` 字符串不执行（文本展示）。
- [ ] BarChart/MetricDonut 所有动态字段经 escapeHtml。
- [ ] 单测覆盖 escapeHtml 输入 + formatter 输出无未转义 `<`。
- [ ] 现有图表测试不回归。

## 依赖与约束

- 无外部依赖；纯 renderer 转义修复。
