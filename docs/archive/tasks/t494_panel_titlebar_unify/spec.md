# Task spec

## 背景

五个面板共用 `PanelTitleBar`，但各调用点的行为不一致，用户审核时发现「每个面板的 titlebar 好像有点不一样」。逐条核实（2026-09-17）：

1. `SettingsView.tsx:396,407`（加载中/错误两个分支）传 `panel="Settings"` 但**未传 `onNavigate`** → 那两个状态下五个面板切换按钮点击无效（正常态 `:429` 有传）。
2. `SettingsView.tsx:431` 传了 `onRefresh`，但组件内 `panel !== "Settings"` 把刷新按钮**主动屏蔽**（`PanelTitleBar.tsx:181`）→ 唯一没有刷新按钮的面板，且传的是死 prop。
3. `SessionShell.tsx:158-166` 把 `PanelTitleBar` 塞进外层 `<header>`（外层已带 `border-b` + `bg-surface-window`），组件自身也带 `border-b` + 同底色 → 结构冗余（边框/背景重复声明）。
4. 特例分散：Usage popup 的 floating 形态只渲染「隐藏到托盘」并带 `no_drag` + `title_extra` 时间戳（`PopupView.tsx:700-721`）；Agent 有 `center` 插槽（筛选器，`TokenStatsView.tsx:846-851`）；其余面板两者皆无。

结论：需要一次「标题栏统一」，把可见性与顺序收敛为同一条规则，特例只保留有产品理由的部分。

## 契约区

### 范围

- Settings 三个分支（加载中/错误/正常）都渲染**可用的**面板切换与刷新按钮（loading/error 分支补 `onNavigate`，刷新按可执行动作决定是否可点）。
- 去掉 `panel !== "Settings"` 的刷新屏蔽：五个面板标题栏右侧的按钮集合与顺序统一为「[刷新] → [五面板切换] → [窗口控制（macOS 隐藏 / 浮动形态仅隐藏到托盘）]」。
- Session 标题栏不再由外层 header 重复提供边框与背景（结构收敛，视觉不变）。
- 保留的产品性特例仅限：Usage popup 的 `no_drag`（macOS 托盘锚定）与浮动形态的「隐藏到托盘」；Usage 的时间戳、Agent 的 filter 插槽保留但其在标题栏内的位置/顺序纳入统一样式。

### 非范围

- 菜单/窗口 chrome（macOS 原生交通灯、⌘W 等）——见 t493。
- 面板功能内容（筛选器逻辑、时间戳语义、面板切换路由）。
- web 端「面板入口用 `<a href>`、桌面端用 Button」的既有差异（t311 有意为之）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [x] AC-001：Settings 加载中与错误状态下，标题栏的面板切换入口可用（点击后切换到目标面板）。
- [x] AC-002：五个面板标题栏都渲染刷新入口（Settings 不再被屏蔽），且刷新触发的动作与该面板既有语义一致。
- [x] AC-003：五个面板标题栏右侧的按钮集合与顺序遵循同一规则（刷新 → 面板切换 → 窗口控制），唯一例外是 Usage popup 的浮动形态只显示「隐藏到托盘」。
- [x] AC-004：Session 面板标题栏的边框与背景只声明一次（不再由外层 header 与组件重复提供），视觉与现版一致。
- [x] AC-005：web 构建的标题栏行为不变（面板入口仍为链接、无窗口控制）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 / AC-002：渲染层单测（`SettingsView` 三个分支：断言按钮存在且点击触发 navigate/refresh 回调）。
- AC-003：`PanelTitleBar` 单测断言按钮顺序与可见性；Usage 浮动形态单独一例。
- AC-004：`SessionShell` 渲染断言（标题栏元素不重复声明边框/背景——以结构断言或快照实现）。
- AC-005：web 页面单测（既有 web 标题栏断言更新）。

## 上下文区

- 来源：用户审核（2026-09-17）；代码证据见背景各条行号；无 pNNN。

### 有意不测

- 真机鼠标悬停/焦点态的视觉细节：归 t493 的 deploy 验证一并看。

### 测试策略

- 单测：`tests/unit/renderer/components/PanelTitleBar.test.tsx`、`tests/unit/renderer/views/settings_view_general.test.tsx` 及 Session/Usage 相关渲染用例。
- 黑盒：web e2e（标题栏入口）与打包版肉眼（需用户许可）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：给 Settings 的 loading/error 补按钮后，用户在配置未就绪时点击刷新产生无效调用；Session 结构收敛时改变高度/边框视觉。
- 回退：改动集中在三个组件文件与其单测，可单独 revert。

### 依赖与约束

- 依赖 t493（同改 `PanelTitleBar.tsx`）：t494 depends_on t493，必须串行。

### Finalization 时更新的 blueprint

- `DESIGN.md`：`panel-titlebar` 条目——统一后的按钮顺序与可见性规则。
- `docs/specs/ui-views-desktop.md`：各面板标题栏一致性说明（如有相关描述）。
