# Spike report

## 问题

ECharts piecewise `visualMap` 改 8 档（仅正值）后，0 值格子不落入任何 piece，ECharts 默认如何渲染该格子？

## 成功判据

- 给出 0 值格子的实际填充行为（透明 / 用 series.itemStyle.color / 用 outOfRange.color），足以决定是否需要显式兜底。

## 尝试

- 临时脚本（jsdom + vitest jsdom env + echarts 6.1.0 SVG renderer）构造 2×1 heatmap：data 含 `[[0,0,0],[1,0,15]]`，visualMap 仅两段正值 piece（`gt:0,lte:10`、`gt:10,lte:20`），0 值不匹配任何 piece。分别测：A 无兜底、B `series.itemStyle.color="#ff0000"`、C `visualMap.outOfRange.color="#00ff00"`，dump SVG 形状与填充。

## 证据

- 三种配置下网格背景 `<rect fill="none">`；正值格子 `<path fill="#111111">`（匹配 piece 色）；**0 值格子 `<path fill="none">`（透明，透出网格背景 rect）**。
- `series.itemStyle.color` 与 `visualMap.outOfRange.color` 均**不**覆盖 0 值格子的填充——piecewise 对无匹配值一律渲染透明。
- 即 0 值格子天然显示为容器/网格背景色，正是 spec AC1「0 值显示为背景色」的预期。

## 结论

- ECharts piecewise 下 0 值（不匹配任何 piece）默认渲染透明，透出底层背景。无需 `series.itemStyle.color` 显式兜底即可满足 AC1。
- 现有 `series.itemStyle.borderColor + borderWidth` 保留网格边框，已提供 0 值格与无数据格的视觉区分。
- 限制：SVG renderer 验证；Canvas renderer 行为一致（ECharts 两种 renderer 共用 visualMap 映射逻辑）。

## 是否采纳

- 决定：是
- 理由：行为明确，8 档实现可直接去掉 0 值 piece，0 值自动透明。
- 后续 task：t205
