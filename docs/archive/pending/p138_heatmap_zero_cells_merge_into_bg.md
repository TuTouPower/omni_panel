# p138 热力图 0 值格子与背景融为一体，无小方格轮廓

- 现象：热力图有值格子正常上色，但无用量（0 值）格子与卡片背景融为一体，看不出独立小方格轮廓。期望 0 值时段可辨识为「存在但无数据」的格子。
- 影响：时段热力图（TokenStatsView 热力图卡片）可读性受损；0 值时段无法辨识为「存在但无数据」的格子。
- 根因：产品缺陷。热力图格子 `itemStyle.borderColor` 用 `pal.sliceBorder`（Heatmap.tsx），该色解析 `--color-surface-card`：light `#ffffff`、dark `#1f232c`，与 0 值格子所露背景**同源同 token**（格子所在 Card 背景即 `--color-surface-card`，Card.tsx），故两主题均完全同色、0 值格无边框轮廓。2026-08-11 单色梯度改动（36bb7cb1，`--color-usage-N` → `--color-heat-N`）只改 heat 色系，未触及边框/背景机制，问题仍在。已确认同类位点：仅 Heatmap.tsx 一处（`pal.sliceBorder` 消费点）。已扫丢弃：`sliceBorder` 其余消费（MetricDonut.tsx:69 饼图切片全有值着色、无透明格；BarChart tooltip/dataZoom 边框与格子背景无关）；全仓 `type: "heatmap"` / `visualMap|piecewise` 仅 Heatmap.tsx。无其它已确认同类位点。
- 测试缺口：heatmap_option.test.ts 断言 8 个 piecewise piece 与 0 值不覆盖，但未断言边框色与背景对比；补测须断言 light/dark 两主题 `series[0].itemStyle.borderColor` ≠ 0 值格背景色（卡片 `--color-surface-card` 解析值，DEFAULT 下 light `#ffffff` / dark `#1f232c`）。当前实现补测断言红（已用 .scratch/p138/verify_border.ts 验证），修复方向：边框色改用与背景有对比的色（如 outline/hairline），或给 0 值格浅色填充。
- 线索：`.scratch/p138/ANALYSIS.md`（核实过程 + 修正：p138 原写背景为 `--color-surface-window`，实际 0 值格露出的是卡片背景 `--color-surface-card`，同 token 完全同色）、`.scratch/p138/verify_border.ts`
- 处理：t317
