# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

t268 建立 token 层后，需要组件层承接 DESIGN.md「Components」节定义的组件形态全集。当前按钮、卡片、菜单等有大量近似手写实现与一套用量很少的 shadcn 风组件双轨并存，本 task 建统一 ui 组件库，形态一种不丢、近似实现按代码盘点合并。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 先盘点 `src/renderer` 现存组件实现（按钮、卡片、徽章、分段控件、开关、菜单、对话框、输入、用量条、KPI、骨架屏、状态点、列表行、标题栏），产出「组件 × 现存变体」清单，作为本 task 形态覆盖基线。
- 实现统一 ui 组件库：Button（primary/secondary/danger/ghost/icon 及现存尺寸档）、Card、Input、Switch、Segmented、Menu、Dialog、Progress（细线/胶囊双形态）、Badge（计数/来源标签双形态）、StatusDot、KPI 数字、Skeleton、PanelTitleBar。
- 复合模式沉淀为 `@utility`：毛玻璃菜单、KPI 数字、骨架屏、交互反馈过渡。
- 组件只消费语义 token，不写 `dark:` 变体、不写散落于 token 外的字面量。

### 非范围

- 不把任何业务窗口切换到新组件库（t270 起逐窗口迁移）。
- 不删除任何现存手写实现（随各窗口迁移逐步删除）。
- 不实现盘点清单之外的新形态。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 盘点清单中每一种现存组件形态在组件库中有对应组件/variant，无遗漏；合并决策在 task 实施笔记中逐条留痕。
- [ ] 每个组件 variant 有渲染级测试：结构、token 类名、交互态（hover/disabled/checked）行为正确。
- [ ] 全部组件在明暗主题下无需 `dark:` 类即渲染正确（测试断言语义类名，黑盒抽查暗色渲染）。
- [ ] Progress 细线与胶囊两种形态并列存在，胶囊形态数值内嵌、两形态共用风险阶梯填充色。
- [ ] 组件视觉与 DESIGN.md Components 节一致，人工抽查确认。[deploy]

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC 5：视觉一致性属人工对照，agent 无法自证。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 像素级视觉：同 t268，靠人工对照。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 组件单测（jsdom/happy-dom）断言结构与类名；不断言具体色值。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：盘点遗漏某现存形态，导致后续窗口迁移时形态丢失。
- 回退：单 commit；清单随 task 目录归档，可补建组件。

### 依赖与约束

- 依赖 t268（token 层可用）。
- 形态保留原则与组件形态全集以 `DESIGN.md`「Components」「Do's and Don'ts」节为准。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：组件层条目（组件清单与 @utility 清单）。
