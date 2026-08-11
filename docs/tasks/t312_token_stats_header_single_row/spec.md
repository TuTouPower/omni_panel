# Task spec

## 背景

代理面板（TokenStatsView）当前标题区两行：第一行 `PanelTitleBar`（logo + "Omni Panel - Agent" + 刷新/面板切换/窗口控制），第二行 `<header>`（代理面板标题 + 刷新时间 + 工具筛选 segment + 平台筛选 segment + 模型下拉 + 时间范围 segment + 自定义按钮）。用户要求合并成一行，且工具/平台/时间范围筛选从 segment 改为下拉，时间范围下拉含「自定义」项。

## 契约区

### 范围

- 代理面板标题区从两行合并为一行，一行内容从左到右：logo + "Omni Panel - Agent" + 刷新时间（updatedAgo/刷新中/刷新失败）+ Coding agent 下拉 + 平台下拉 + 模型下拉 + 时间范围下拉（24小时/7天/1月/自定义）+ 刷新按钮 + 设置按钮 + 用量面板按钮 + 会话历史按钮。
- 工具筛选（AGENT_OPTIONS：全部工具/Claude Code/OpenCode/Kimi Code/Grok）、平台筛选（PLATFORM_OPTIONS：全平台/Win/WSL）从 Segmented 改为 Select 下拉。
- 时间范围（RANGE_OPTIONS：24小时/7天/1月）从 Segmented 改为 Select 下拉，下拉含「自定义」项；选中「自定义」弹出现有 RangePicker 面板。
- 保留 agent/platform/model/preset/custom 状态的持久化（save_prefs）与查询行为不变。

### 非范围

- 不改 TokenStatsView 数据查询逻辑与图表渲染。
- 不改其他面板（Usage/Session/Settings）的标题栏布局。
- 不改 RangePicker 组件本身（仅改为由时间范围下拉触发）。

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

- [ ] AC-001：代理面板标题区为单行，包含 logo、「Omni Panel - Agent」、刷新时间、工具/平台/模型/时间范围四个下拉、刷新/设置/用量面板/会话历史按钮。
- [ ] AC-002：工具下拉选择「Claude Code」等过滤生效（查询结果对应变化）；平台下拉选择「WSL」等过滤生效。
- [ ] AC-003：时间范围下拉选择「24小时/7天/1月」生效；选择「自定义」弹出时间范围面板，应用后按自定义范围查询。
- [ ] AC-004：刷新按钮触发刷新；设置/用量面板/会话历史按钮导航到对应面板（与改造前行为一致）。
- [ ] AC-005：代理面板既有测试全绿（含改造后新增的标题栏/筛选断言）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：组件/单测断言筛选 onChange 调用与渲染结构；web e2e 断言标题栏一行含全部元素。

## 上下文区

- 来源：用户直接需求（2026-08-11 提供参考图 PixPin_2026-08-11_13-19-08.png，两行改一行 + segment 改下拉）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 像素级对齐与视觉一致性：人工对照参考图，不写自动断言。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：渲染 TokenStatsView 标题栏，断言工具/平台/时间范围用 Select（非 Segmented）、时间范围下拉含「自定义」、点击自定义弹出 RangePicker。
- web e2e：断言标题栏一行含 logo/标题/四个下拉/四个按钮。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：合并一行后窄屏溢出（筛选控件多）；`PanelTitleBar` 是四面板共用组件，改动可能影响其他面板。
- 回退：改回两行 + segment；样式级改动可逐项回退。

### 依赖与约束

- `PanelTitleBar`（ui 组件）为四面板共用；本 task 只改 TokenStatsView 对它的使用方式，不改 PanelTitleBar 通用形态。

### Finalization 时更新的 blueprint

- 无
