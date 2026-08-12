# Task spec

## 背景

用户要求右上角按钮恒定（刷新、设置、用量、代理、会话），当前面板不隐藏，仅设置面板去刷新。t330 只让 Session/Settings 达标（PanelTitleBar 面板形态四面板恒定）；网页版 **Agent 面板缺「Agent」自身按钮、Usage 面板缺「用量」自身按钮**（Agent 用 PanelTitleBar 通用形态 header_actions 手写互跳漏自身，Usage 用独立 TitleBar 组件无用量按钮）。p147 登记，playwright 实测 4 面板按钮清单确认。

## 契约区

### 范围

- `src/renderer/views/TokenStatsView.tsx`（Agent 面板）：header_actions 互跳区补「Agent」自身按钮（对齐 PanelTitleBar 恒定语义），顺序 Settings/Usage/Agent/Session。
- `src/renderer/views/popup-view/TitleBar.tsx`（Usage 面板）：标题栏补「用量」自身按钮（当前面板）。
- 补两处测试：断言 Agent/Usage 标题栏含全部四面板按钮（含当前面板自身），设置面板无刷新。

### 非范围

- 不改 PanelTitleBar（Session/Settings 已达标，t330 完成）。
- 不改按钮顺序（t313 固定序）。
- 不改点击行为（web 互跳 href、桌面 navigate，沿用现有模式）。

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

- [ ] AC-001：Agent 面板标题栏渲染「Settings面板/Usage面板/Agent面板/Session面板」四按钮（含 Agent 自身，不再缺）。
- [ ] AC-002：Usage 面板标题栏渲染「用量」自身按钮（当前面板不隐藏），连同刷新/设置/代理/会话。
- [ ] AC-003：网页版各面板（usage/agent/session/setting）标题栏按钮恒定：四面板切换 + 当前面板自身，仅设置面板无刷新按钮（与 p147 现象清单一致）。
- [ ] AC-004：补测两处标题栏按钮断言，既有 PanelTitleBar/panel_navigation 测试不回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002 组件测试断言按钮；AC-003 web e2e（panel_navigation 或新 spec）断言四面板按钮；AC-004 既有测试回归。

## 上下文区

- 来源：p147（2026-08-13 task-bug 分析；playwright 实测各面板按钮：usage 缺用量、agent 缺 Agent、session/setting 已达标）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `tests/unit/renderer/components/token_stats_header.test.tsx` 或 TokenStatsView 测试：断言 header_actions 含 Agent 自身按钮。
- popup TitleBar 测试：断言含用量自身按钮。
- web e2e panel_navigation 或新 spec：断言四面板按钮恒定。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：加自身按钮后点击自身面板行为（web 同 hash 赋值 no-op、桌面 navigate 自身聚焦）——沿用现有互跳模式，无新风险。
- 回退：撤销 TokenStatsView/TitleBar 改动。

### 依赖与约束

- t330（PanelTitleBar 面板形态四面板恒定）已合入 main。

### Finalization 时更新的 blueprint

- 无
