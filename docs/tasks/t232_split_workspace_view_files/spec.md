# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p055。

`src/renderer/components/workspace/WorkspaceView.tsx` 与 `src/renderer/styles/workspace.css` 超项目 400 行 minor 阈值。2026-08-07 核实：WorkspaceView.tsx 770 行、workspace.css 770 行（登记时 629/780），均超阈值。工作台为 t224 新建且后续（t225 面板交互 / t226 摘选）持续演进，建议按功能拆分以降低单文件维护成本。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 按功能拆分 `WorkspaceView.tsx`（消息状态逻辑、弹窗样式等）与 `workspace.css`，使各文件回到项目行数阈值内。
- 拆分后行为与视觉完全一致（重构不改功能）。

### 非范围

- 不改工作台任何用户可见行为、消息状态机、面板交互。
- 不引入新依赖或状态管理方案。
- 不做功能新增。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 拆分后 `WorkspaceView.tsx` 与 `workspace.css`（含拆出的各文件）均在项目行数阈值内。
- [ ] 工作台现有功能与视觉无回归（消息流、面板交互、摘选、弹窗样式一致）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：可自动（`wc -l` 或 lint 行数门禁）。
- AC2：拆分为纯重构，现有单测/渲染测试须全绿；视觉一致依赖既有渲染断言与人工抽查，无独立自动断言则按项目现有覆盖。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 拆分本身不新增行为，不为此新增专项测试；依赖既有 WorkspaceView 渲染/交互测试保证无回归。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 复用 `tests/unit/renderer/components/workspace/` 既有测试；拆分后测试文件 import 路径同步更新，断言不变。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：跨文件拆分可能引入 import 环或状态引用错位；样式拆分会话可能漏移选择器。靠既有测试 + 行数检查收敛。
- 回退：还原拆分即可，单文件改动，可整体 revert。

### 依赖与约束

- 依赖 p055 登记。
- 约束：不改行为；命名遵循 `snake_case`。

### Finalization 时更新的 blueprint

- 无
