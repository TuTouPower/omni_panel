# Task spec

## 背景

来源：p110/p111/p112/p113/p117/p118（t283 DESIGN 视觉对照标注不修项，2026-08-11 用户决定合并为对齐包）。六条均为 ui 组件与 DESIGN.md components token 的视觉差异，对比度均达标（t283 e2e 已断言不退化），差异属设计侧裁决范畴：

1. **Switch**（p110）：代码 20×36 vs token 38×22；开态 accent 蓝 vs token `switch-track-on` success 绿；关态 on-surface-muted vs token surface-raised。
2. **Badge count**（p111）：代码 accent 实底白字 vs token `badge-count` primary-container 浅底 + primary 字。
3. **Progress**（p112）：代码 thin 4px / capsule 24px vs token 6px / 22px；组件当前零消费（仅导出）。
4. **Button 字重**（p113）：DESIGN 正文「按钮字重 600」 vs typography token body-md fontWeight=450，代码取 500 居中——规格内部矛盾。
5. **Menu hover**（p117）：代码 hover surface-raised vs token `menu-item-hover` primary 底 + on-primary 字。
6. **Dialog 动画**（p118）：token 规定 160ms 上浮淡入，代码无任何入场动画。

## 契约区

### 范围

- 六项逐项对齐 DESIGN.md token 或明确裁决为「维持现状」（裁决须有依据并记录）
- 对齐涉及 token 值调整时走 `designmd export` 同步 + drift check
- 每项对齐后对比度不退化（t283 对比度断言保持）

### 非范围

- DESIGN.md 正文与 token 的矛盾裁决本身之外的文档体系调整
- 组件结构/API 重构
- 未消费组件（Progress）的功能性实现

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

- [ ] AC-001：六项逐项有对齐结果（代码或 token 变更，或记录「维持现状」裁决 + 依据），收尾报告含逐项对照表
- [ ] AC-002：token 值变更时 `pnpm designmd:check` drift 通过；`ui_component_theme` web e2e 明暗两态对比度断言全绿（不退化）
- [ ] AC-003：涉及组件消费方测试全绿（Switch/Badge/Button/Menu/Dialog 相关单测 + 全量 `pnpm test`）

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：对比度断言（t283 e2e）+ designmd check + 组件单测；「维持现状」裁决以收尾报告记录。

## 上下文区

- 来源：p110/p111/p112/p113/p117/p118（合并，2026-08-11 用户决策）
- 设计裁决点：Switch 尺寸与开态色、Badge count 配色、Menu hover 反馈、Dialog 入场动画、Button 字重规格矛盾、Progress 消费时对齐——逐项在收尾报告给出裁决依据

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 像素级视觉一致性：人工对照，不写自动断言（t283 同口径）

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 回归：t283 `ui_component_theme` web e2e（明暗两态对比度）+ 组件单测 + `pnpm designmd:check`

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：对齐改动影响既有视觉基线（消费方布局/配色）
- 回退：样式级改动逐项可回退；回归测试守护

### 依赖与约束

- 依赖：DESIGN.md（t268）与 ui 组件库（t269）为 token 真相源

### Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：如裁决影响「组件只消费语义 token」规则，同步说明
