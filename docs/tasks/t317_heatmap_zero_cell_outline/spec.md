# Task spec

## 背景

热力图 0 值不进入任何 visualMap piece，格子保持透明并露出 Card 背景；格子边框同时使用解析到同一 `--color-surface-card` 的 `pal.sliceBorder`，因此 light 与 dark 两主题下边框和背景完全同色，0 值时段无法辨识。p138 已确认 2026-08-11 单色梯度改动未触及该机制。

## 契约区

### 范围

- 为 Heatmap 使用与卡片背景有可见对比的专用格子轮廓或等价 0 值可见样式。
- 保持 0 值不进入 8 档有值色带，非零格子的单色相强度梯度语义不变。
- 补 light/dark 两主题的 heatmap option 与渲染回归测试。

### 非范围

- 不修改 MetricDonut 等其它 `sliceBorder` 消费者。
- 不调整热力图 8 档阈值、数据聚合或 tooltip 内容。
- 不改变 0 值为“无用量”而非最低有值档的语义。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：light 主题下，0 值热力图格子具有可见轮廓，格子边框色或等价可见样式不与 `--color-surface-card` 背景同色。
- [ ] AC-002：dark 主题下，0 值热力图格子具有可见轮廓，格子边框色或等价可见样式不与 `--color-surface-card` 背景同色。
- [ ] AC-003：0 值仍不进入任一 `gt: 0` 的有值色带；非零格子仍按现有 8 档 `--color-heat-N` 强度梯度着色。
- [ ] AC-004：MetricDonut 的切片描边与其它图表样式不因本修复改变。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：option 测试断言两主题轮廓色与卡片背景不同、0 值仍不命中色带；图表回归测试确认 MetricDonut palette 不变。

## 上下文区

- 来源：p138（2026-08-11 核实：Heatmap `itemStyle.borderColor=pal.sliceBorder` 与 Card 背景同取 `--color-surface-card`；已扫无其它 heatmap 同因位点）
- 已确认同类位点：仅 `Heatmap.tsx` 一处；MetricDonut 全部切片有值着色，机制不同，不纳入修复。
- 补测方向：`heatmap_option.test.ts` 增加 light/dark 对比断言，并保留 8 档与 0 值不覆盖断言。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 不做跨显示器色彩管理或像素级颜色差阈值测试：以解析后的颜色值不同和渲染可辨为本 task 边界。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- option 单测：在 DEFAULT light/dark palette 下断言 Heatmap series 的轮廓色不等于 `surface-card`，并断言 0 值不命中 8 个 piece。
- palette/组件回归：确认新增专用 heatmap 轮廓不会改变 MetricDonut `sliceBorder`。
- web 渲染验证：构造含 0 值与非零值的 fixture，确认两主题均能看到完整格子轮廓。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：轮廓对比过强会干扰非零格子的连续色带观感，或误改共享 `sliceBorder` 影响饼图。
- 回退：使用 Heatmap 专用轮廓字段，若视觉不合适只回退该字段，不改共享 palette 与数据色带。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- 无。
