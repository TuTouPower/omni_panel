# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：`docs/pending.md` p098（t269 review f006 minor，AC5 deploy）。核实（2026-08-10）：ui 组件库若干视觉细节需人工对照 DESIGN.md——Switch 尺寸/on 色、Button 字重/圆角、Badge 配色、MenuItem hover、SecretInput 显隐图标（当前 emoji）、Progress 粗细、Dialog 入场动画。实现已对齐 DESIGN 主体，本项为像素级人工对照。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 逐项人工对照 ui 组件与 DESIGN.md 的视觉规格，产出对照清单（项 → 现状 → 差异）
- 差异项修复（样式级调整，不重构组件）

### 非范围

- 组件结构/API 调整
- 设计 token 体系变更（t268 已交付）

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：对照清单完整记录 DESIGN.md 规格项与现状差异（task 收尾报告）
- [ ] AC2：确认存在差异的项已按 DESIGN.md 修复或明确标注不修原因

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2 为人工视觉对照（`[deploy]`，agent 无法自证像素级一致）；样式修复后跑既有组件测试回归。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉一致性：人工对照，不写自动断言

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 样式修复后：既有组件单测 + 消费页面渲染回归

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：像素级差异主观性强，修复可能引入新偏差
- 回退：样式级改动，可逐项回退

### 依赖与约束

- 依赖：DESIGN.md（t268）与 ui 组件库（t269）已交付

### Finalization 时更新的 blueprint

- 无
