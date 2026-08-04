# Task review t205（reviewer_focus: 通用）

- task：`t205_heatmap_8_bands`
- spec：`docs/tasks/t205_heatmap_8_bands/spec.md`
- diff_anchor：`9202d820c701421c6a7e8dd58667d28a93187b54`
- target：`git diff 9202d820c701421c6a7e8dd58667d28a93187b54`
- round：1
- reviewed_at：2026-08-04 20:51 UTC+8

## Findings

无 critical / important / minor finding。

实现逐条核对 spec 契约区：

- **AC1（8 正值档 + 0 值不着色）**：`Heatmap.tsx:30-38` pieces 由 `Array.from({length:8})` 生成；band 0 `{gt:0,lte:quantiles[0]}`，末档 `{gt:quantiles[6]}` 无上界，中间 `{gt:q[i-1],lte:q[i]}`。全部 lower bound `gt:0` 以上，0 不匹配任何 piece。s014（`docs/spikes/s014_heatmap_zero_render/report.md`）已用 ECharts 6.1.0 SVG renderer 实证 0 值默认 `fill="none"` 透明。spec 上下文区「未知契约清单」已从 `UNVERIFIED-SPIKE` 转为结论。✓
- **AC2（8 色由浅到深、肉眼可区分）**：`palette.ts:80,100` dark/light 各 8 色；`palette.test.ts:55-64` 断言两主题 `heat.length===8` 且相邻不重复。肉眼可区分度属 spec 声明的人工目检项，不出 finding。✓
- **AC3（按八分位、边界随分布变化）**：`chart-data.ts:559` `quantile(nonzero, 12.5 + i*12.5)`，i=0..6 产 7 条 p12.5..p87.5 边界。`build_heat_data` 只用正值（`filter(v=>v>0)`）算分位，0 不参与。✓
- **AC4（两主题生效）**：`heatmap_option.test.ts:13-18` 对 dark/light 均断言 pieces.length===8。✓
- **AC5（cell 值不被分档改变）**：`chart-data.test.ts:580-591` 专门用 3 cell（含 1 个 0 值）验证 data 原样保留。✓

实现质量核对：

- **buildHeatmapOption 抽取**：从组件 `useMemo` 内联抽为模块级纯函数（`Heatmap.tsx:22-67`），入参 `(data, quantiles, metric, pal)` 全显式，无闭包捕获；组件 `useMemo` 依赖列表 `[data,quantiles,metric,pal]` 与原实现一致。测试经该函数触达真实 piece 构造逻辑，非测 mock。抽取合理。
- **`?? 0` 类型兜底**（`Heatmap.tsx:31,33,34`）：TS `exactOptionalPropertyTypes`/`noUncheckedIndexedAccess` 下数组索引返回 `number | undefined`。`build_heat_data` 恒产 `quantiles.length===7`（`Array.from({length:7})`），运行时 `quantiles[0..6]` 不会 undefined，`?? 0` 纯类型满足，不掩盖真实逻辑。`pal.heat[i] ?? "#7c6cf6"` 同理——palette 恒 8 色，兜底永不触发。非 finding。
- **边界**：全 0 grid → `nonzero=[]` → `quantile` 对空数组返回 0（`chart-data.ts:549`），7 个边界全 0，pieces 退化为 8 个 `{gt:0}` 同色档；单正值 → 单元素数组所有分位等于该值。两种退化均不崩溃，渲染上无正值时整个 visualMap 无格命中（全背景），符合 AC1 语义。

测试可信度核对：

- `chart-data.test.ts:563-578`：8 个等差正值 → 断言 7 边界升序且落在 `[10,80]`。触达真实 `quantile` 插值逻辑，断言预期行为。
- `chart-data.test.ts:580-591`：AC5 直接对应。
- `palette.test.ts:55-64`：对应 spec 测试策略「两主题 heat 均 8 色、相邻不重复」。
- `heatmap_option.test.ts`：3 条分别覆盖 pieces=8、0 不被覆盖（断言每条 `gt>=0` 且无 `min` 属性）、8 色顺序 + 首尾边界（`pieces[0]={gt:0,lte:20}`、`pieces[7]={gt:80}` 无 `lte`）。无恒真断言、无 `.skip`、无 mock 误用。
- spec 测试策略三条全覆盖。

文档一致性：spec 上下文区未知契约已随 s014 结论更新；task.md 记录 Step1/2/3/4 与实际 diff 一致。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：
    - `palette.ts:80` dark heat 中 `#6c5ce8`（索引 4）与 `#7c6cf6`（索引 5）色相明度接近，肉眼可区分度需人工目检确认；属 spec 已声明的 AC2/AC4 人工项，非 agent 可判。
    - `task.md` Step 2/3 笔记里「2175 passed / 1 skipped」为 implementer 自述，未由 reviewer 重跑；不影响 finding 判定（diff 内代码+测试本身已满足 AC）。
- 总体判断：实现完整覆盖 AC1-AC5，抽取与测试均触达真实逻辑，无 blocking 问题。
- 系统性 follow-up：无。

verdict: PASS
