# Task spec

## 背景

会话面板（`src/renderer/components/workspace/SessionPane.tsx`）底部 footer 展示「槽位 N · 用户 X · Agent Y」计数条。用户要求去掉。

## 契约区

### 范围

- `SessionPane.tsx` 移除 `<footer className="conversation-foot …">`（槽位号 + user/assistant 消息计数）。
- 连带清理：`counts` / `message_counts`（仅 footer 使用）、`slot_index` prop（仅 footer 使用）。
- `WorkspaceView.tsx` 移除传参 `slot_index={index}`。
- 删除 `SessionPane.test.tsx` 中「脚部显示槽位号与 user/assistant 消息计数」用例（footer 功能整体删除，语义失效）。
- `session_typography.test.tsx` 的 `PANE_PROPS` 移除 `slot_index` 键（沿用渲染 props 完整性）。

### 非范围

- 面板头部 / 大纲 / 其它 UI 元素不动。
- `message_counts` 纯函数本体（`pane.ts`）与其单测保留——供未来或其它调用点使用。
- 槽位模型 / 布局逻辑不动。

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

- [ ] AC-001：会话面板渲染 DOM 不再包含 `.conversation-foot` 元素。
- [ ] AC-002：面板内不再出现「槽位」「用户 N」「Agent N」文本节点（footer 专属文案）。
- [ ] AC-003：`SessionPane` 渲染无需 `slot_index` prop；`WorkspaceView` 不再传该 prop（类型检查通过）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试：AC-001~002 组件测试断言 footer 不存在；AC-003 由 TS 类型检查 + 现有渲染测试通过保证。

## 上下文区

- 来源：用户需求（2026-08-16 口头要求去掉会话面板 footer 计数条）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `SessionPane.test.tsx`：删除失效用例；剩余用例移除 `slot_index` prop 占位，断言沿用现有渲染风格。
- 新增断言：`document.querySelector(".conversation-foot")` 为 null；`screen.queryByText(/槽位|用户 \d|Agent \d/)` 为 null。
- `session_typography.test.tsx`：仅移除 props 键，不新增断言。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：footer 删除后 `slot_index` prop 移除，若其它调用点仍传会类型错误——已确认仅 WorkspaceView 一处传参。
- 回退：恢复 footer 与 prop 即可，无数据迁移。

### 依赖与约束

- `message_counts` 保留：若未来想恢复计数展示，可复用。
- 无其它 task 依赖本改动（t401-403 不触及 SessionPane footer）。

### Finalization 时更新的 blueprint

- 无
