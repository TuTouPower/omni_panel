# Task spec

## 背景

用户审查会话窗口后要求：删除会话面板头部的「全选可见」「清空选择」「聚焦面板」三个按钮，且三个按钮对应的**功能一并彻底删除**，不保留替代入口。

## 契约区

### 范围

- `SessionPane` 头部操作区：移除「全选可见」「清空选择」「聚焦面板」三个按钮及其 on_select_all / on_clear_select / on_focus 回调链路。
- 聚焦功能彻底删除：`WorkspaceView` 的 `focused_index` 状态、`focused` 类名/`col-span-full`/`hidden` 切换逻辑、`SessionPane` 的 `focused` prop 与 focused 样式分支。
- 全选/清空功能彻底删除：`select_all_in_column` / `clear_selection_in_column` 若仅此链路使用则一并移除。
- 连带删除失效测试用例；`docs/specs/session_window_design_migration.md`（或 workspace 相关 spec）中「面板聚焦」表述随 finalization 修订。

### 非范围

- 保留头部其余按钮（大纲、关闭等）及其行为。
- 消息逐条 checkbox 选择与摘选托盘功能保留，不受影响。
- 不动槽位数据模型与布局列数计算。

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

- [ ] AC-001：会话面板头部 DOM 不再渲染「全选可见」「清空选择」「聚焦面板」三个按钮。
- [ ] AC-002：代码中不再存在聚焦面板的状态与入口（`focused_index`、`focused` prop/类名、占满网格的 `col-span-full` 切换逻辑移除），类型检查通过。
- [ ] AC-003：头部保留按钮（大纲、关闭等）渲染与点击行为不变。
- [ ] AC-004：消息逐条 checkbox 选择、摘选托盘复制功能不回归。
- [ ] AC-005：相关测试删除或更新后通过，现有测试套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试：AC-001/003/004 组件测试断言；AC-002 由 TS 类型检查 + grep 断言；AC-005 跑测试套件。

## 上下文区

- 来源：用户需求（2026-08-16 截图审查：「去掉那个全选可见和清空选择聚焦面板三个按钮」；功能处置经用户拍板为彻底删除）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `SessionPane`/`WorkspaceView` 测试：删除聚焦、全选、清空相关用例；新增断言三按钮不存在、保留按钮可点。
- grep 断言：`focused_index` / `select_all_in_column` / `clear_selection_in_column` 无残留引用。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：聚焦逻辑牵连 `WorkspaceView`/`SessionShell` 多处条件渲染，漏删会留死代码或类型错误——实现期以类型检查 + grep 清零兜底。
- 回退：git 还原即可，无数据迁移。

### 依赖与约束

- 与 t407/t408/t410 同触 `SessionPane.tsx`，与 t405 同触 `SessionPane`（footer 区域不重叠），顺序由 task-schedule 排。

### Finalization 时更新的 blueprint

- `docs/specs/session_window_design_migration.md`：删去「面板聚焦」交互表述（若该 spec 含此条目）。
