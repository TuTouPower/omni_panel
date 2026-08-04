# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

代理面板「时段热力」当前 5 档（`visualMap` piecewise）：0 值单独一档 + 正值按四分位 4 档（`build_heat_data` 返回 q1/q2/q3，`Heatmap.tsx` pieces 五段）。用户要求热力图改成八档，并取消 0 值的最低档——即 0 值格子不再占一个颜色档（显示为背景/无色），正值按八分位分成 8 档渐变。当前 `palette.ts` 的 `heat` 数组仅 5 色，需扩到 8 档正色（加底色）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `build_heat_data`（chart-data.ts）：四分位 → 八分位（返回 8 个分位点）；档位划分覆盖全部正值。
- `palette.ts`：`heat` 数组扩为 8 档正值色（深浅两主题各 8 色），并明确 0 值背景色。
- `Heatmap.tsx`：`visualMap.pieces` 改为 8 段（仅正值，不含 0 值档）；0 值格子渲染为背景色（series itemStyle 兜底）。
- 同步更新 chart-data / Heatmap 相关单测与 palette 测试。

### 非范围

- 不改热力图数据来源与聚合 SQL（weekday×hour cells 不变）。
- 不改变 tooltip、坐标轴、或 7×24 网格结构。
- 不做档位数量可配置或自定义配色。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：热力图为 8 个正值档位；0 值格子不再被单独着色，显示为背景色（与无数据格区分度靠网格边框）。
- [ ] AC2：8 档颜色由浅到深递进，正值最高的格子颜色最深、最低正值最浅；任意两档颜色肉眼可区分。
- [ ] AC3：分档按正值八分位计算——同一数据下档位边界随窗口数据分布变化，而非固定数值阈值。
- [ ] AC4：深浅两主题均生效，颜色对比度在各自主题下可读。
- [ ] AC5：改动不影响既有数据聚合（cells 值不变，仅渲染分档变化）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC3：`build_heat_data` 纯函数单测可验证 8 分位点与档位边界；visualMap pieces 结构断言。
- AC2/AC4（肉眼可区分/可读性）：主观视觉标准，无法自动断言。以 palette 测试断言 8 色数组非空、相邻色相不同 + 执行期截图目检，[deploy] 或人工确认。
- AC5：chart-data 单测确认 cells 数据不变（分档不影响 cell 值）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 颜色主观可区分度（AC2/AC4 视觉部分）：自动断言无法覆盖，人工目检。
- ECharts 对未匹配 piece 的 0 值格子的实际渲染：`UNVERIFIED-SPIKE`，执行期渲染截图确认，必要时用 series.itemStyle.color 显式兜底。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- `chart-data.test.ts`：`build_heat_data` 对含 0 值与正值的 grid 断言 8 个分位点、0 值不在分档计算内；边界（全 0、单正值、大量重复值）行为。
- `palette.test.ts`：两主题 `heat` 均 8 色、递增、相邻不重复。
- `Heatmap` 组件测试：visualMap pieces 段数=8、不含 `{min:0,max:0}` 档；series itemStyle 有背景兜底色。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- ECharts piecewise 对不落在任何 piece 的值（0 值）的默认渲染色：已核实（s014）——ECharts 6.1.0 SVG renderer 下 0 值（无匹配 piece）默认 `fill="none"`（透明，透出网格背景 rect），`series.itemStyle.color` 与 `visualMap.outOfRange.color` 均不覆盖。去掉 0 值 piece 后 0 值格自动显示背景色，满足 AC1，无需显式兜底。

### 风险与回退

- 风险：八分位档位过密导致相邻档颜色难分辨；0 值底色与背景混淆。
- 回退：回退实现 commit 即恢复 5 档。

### 依赖与约束

- 依赖：无（纯前端渲染；t204 模型筛选若已合入，热力图数据已随筛选变化，本 task 不依赖 t204）。

### Finalization 时更新的 blueprint

- 无
