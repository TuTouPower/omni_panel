# Task spec

## 背景

t274（commit afd34807「clean legacy css」）把 `Icon.tsx` 从手绘 SVG 集收口到 lucide-react，无提示替换面板切换按钮 icon：`chat_square` 由手绘聊天气泡（带尾巴）换为 lucide `MessageSquare`，用量面板按钮用 `dashboard`（LayoutDashboard）。用户反馈：设置面板右上角用量面板按钮显示非预期图标（期望时钟快进），会话面板切换按钮图标非「之前设置的会话 icon」（t274 前手绘聊天气泡），并要求移除设置面板左上角返回按钮。登记 p131。

## 契约区

### 范围

- `Icon.tsx` 的 `chat_square` 恢复 t274 前手绘聊天气泡样式（引回 `assets/ui/message-chat-square.svg` 或内联等价 path）
- `PanelTitleBar.tsx` 的 Usage 切换按钮 icon 由 `dashboard` 改 `clock_forward`（时钟快进，lucide ClockArrowUp）
- `SettingsView.tsx` 移除左上角返回按钮（`aria-label="返回"` 的 ghost Button 及 `goBack` 关联导航；确认无其它调用方残留）
- 补测试：PanelTitleBar Usage 按钮 icon 断言、chat_square 手绘样式断言、SettingsView 无返回按钮断言

### 非范围

- t274 手绘→lucide 收口决策整体回退（仅 `chat_square` 例外恢复手绘；Agent `chart` / Settings `gear` 等保持 lucide）
- 其它组件 icon 调整

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

- [ ] AC-001：PanelTitleBar 渲染的四面板切换按钮中，「用量面板」按钮使用 `clock_forward`（lucide ClockArrowUp）icon，不再使用 `dashboard`
- [ ] AC-002：`Icon name="chat_square"` 渲染 t274 前手绘聊天气泡 SVG（含原 `message-chat-square.svg` 特征 path），非 lucide MessageSquare；popup 主界面会话按钮、托盘会话入口同步生效
- [ ] AC-003：SettingsView 渲染结果不含 `aria-label="返回"` 按钮；返回导航（goBack）不再可达
- [ ] AC-004：`icon.test.tsx` / `ui.test.tsx` 既有用例全绿，全量 `pnpm test` 通过

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：渲染断言（PanelTitleBar 按钮 icon、chat_square SVG 内容、SettingsView 无返回按钮）+ 全量测试。

## 上下文区

- 来源：p131（2026-08-11 核实：t274 afd34807 收口 icon 至 lucide）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `icon.test.tsx`：补 `chat_square` 渲染手绘 SVG 断言（含特征 path 或数据）
- `ui.test.tsx` 或 PanelTitleBar 测试：断言 Usage 切换按钮 icon 为 clock_forward
- `settings_view_general.test.tsx` 或 SettingsView 测试：断言无返回按钮
- 回归：既有 icon/PanelTitleBar/SettingsView 用例全绿 + 全量测试

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：chat_square 恢复手绘逆 t274 收口决策，与「统一 lucide」架构目标冲突；改动限于 icon 视觉，可观察风险低
- 回退：改动可整段回退，回归测试守护

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
