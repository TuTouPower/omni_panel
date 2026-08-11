# p138 热力图 0 值格子与背景融为一体，无小方格轮廓

- 现象：热力图有值格子正常上色，但无用量（0 值）格子与卡片背景融为一体，看不出独立小方格轮廓。
- 影响：时段热力图（TokenStatsView 热力图卡片）可读性受损；0 值时段无法辨识为「存在但无数据」的格子。
- 根因：产品缺陷。热力图格子 `itemStyle.borderColor` 用 `pal.sliceBorder`（Heatmap.tsx），该色解析 `--color-surface-card`：light `#ffffff`、dark `#1f232c`，与格子所露背景 `--color-surface-window`（light `#ffffff`、dark `#181b22`）几乎同色。0 值格子透明露背景，又无可见边框 → 融进背景。已确认同类位点：仅 Heatmap.tsx 一处（`pal.sliceBorder` 消费点）。已扫丢弃：`sliceBorder` 其余消费（MetricDonut/图表切片描边）为有值图形，同色边框不产生此问题。
- 测试缺口：heatmap_option.test.ts 断言 8 个 piecewise piece 与 0 值不覆盖，但未断言边框色与背景对比；补测须断言 light/dark 两主题边框色 ≠ 背景色（`--color-surface-window` 解析值）。
- 线索：`.scratch/heatmap_border_analysis.md`
- 处理：未开
