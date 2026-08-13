# p150 renderer 组件层未统一：四面板标题栏 + 会话面板背景色层级 + 薄包装兼容壳残留

- 现象：四个面板的标题栏实现不一致，未统一为同一形态「左上 icon + `Omni Panel - <panel_name>`、右上 `刷新 设置 用量 代理 会话`、中间各面板自己的按钮/状态、字号颜色背景一致」：
    - **Usage（用量，主点）**：`popup-view/TitleBar.tsx` 完全自绘，未复用共享组件；面板导航顺序错位为 `刷新 → 用量 → 设置 → 代理 → 会话`（自身按钮置首），其余面板为 `刷新 → 设置 → 用量 → 代理 → 会话`。
    - **Agent（代理）**：`TokenStatsView.tsx:652-876` 用 `PanelTitleBar` 的**通用形态**（`title` + `actions`）手工复制了 panel 形态——`header_title` 手写 logo+标题+updatedAgo/sourceIssues/refreshing/error，`header_actions` 手写筛选器（工具/平台/模型/指标/粒度/时间范围）+刷新+四面板导航+WindowControls。
    - **Session（会话）**：`SessionShell.tsx:47-119` 用 panel 形态但 rail-toggle 按钮独占标题栏左侧 220px 挤占空间，`session-tabs` 中间页签用绝对定位自绘，未走共享插槽。
    - **Settings（设置）**：`SettingsView.tsx:424` 已用 panel 形态，作为统一基准。
- 影响：标题栏结构、按钮顺序、字号/颜色/背景、扩展能力跨面板不一致，后续每加一个面板按钮或状态都要在多个文件手改，易再次漂移。统一范围：
    - `src/renderer/components/ui/PanelTitleBar.tsx`（共享壳，需增强插槽与参数）
    - `src/renderer/views/popup-view/TitleBar.tsx` + `src/renderer/views/PopupView.tsx:698`（主点迁移）
    - `src/renderer/views/TokenStatsView.tsx:652-876`（迁移到 panel 形态）
    - `src/renderer/components/session-shell/SessionShell.tsx:47-119`（rail-toggle 下移一行、tabs 走中间插槽）
    - `src/renderer/views/SettingsView.tsx`（基准，仅核对，无需改）
- 根因：t252/t269 引入统一 `PanelTitleBar` panel 形态后，popup 因「浮动/隐藏到托盘、no_drag 平台差异、刷新全部语义」等特殊需求保留了旧自绘标题栏；Agent 面板在 t311 web 化改造时用通用形态手写复制了 panel 形态；Session 面板 rail-toggle 与中间页签未接入插槽。四面板各自演化，未收敛到单一权威标题栏。分类：产品缺陷（UI 一致性）+ 架构重复。
- 已确认同类位点（同一机制「标题栏未统一」，合并为一个修复范围，不拆多条）：
    - 主点：`popup-view/TitleBar.tsx`
    - `TokenStatsView.tsx` header_title/header_actions
    - `SessionShell.tsx` rail-toggle + session-tabs
    - 已扫无其它：TrayMenu（托盘菜单非面板标题栏，丢弃）、EmptyState（单链接非导航组，丢弃）。
- 统一方案要点（需 PanelTitleBar 增强）：
    - 中间插槽（面板自己的按钮/状态/页签）：Session `session-tabs`、Agent 筛选器移入。
    - 标题后扩展区：Agent 的 updatedAgo/sourceIssues/refreshing/error 状态。
    - 刷新语义参数化：Usage=刷新全部（`onRefreshAll` + title「刷新全部」），其余=刷新当前面板。
    - Popup 特有窗口控制：floating 时「隐藏到托盘」替代最小化/最大化/关闭；footerTime 显示；no_drag 平台差异（darwin 不可拖）。
- 测试缺口：
    - `tests/unit/renderer/views/popup_view.test.tsx:340-352` 把错误顺序当正确语义钉死（测试名声称「与 PanelTitleBar 语义一致」但从未对比），假绿遮住主点。
    - `tests/unit/renderer/components/PanelTitleBar.test.tsx` 无中间插槽/刷新语义/窗口控制插槽的统一测试。
    - `tests/unit/renderer/views/token_stats_header.test.tsx` 只测标题/刷新动画位置，无面板导航顺序与标题栏结构断言。
    - `tests/unit/renderer/components/session_shell/SessionShell.test.tsx` 无标题栏统一断言。
    - 补测：PanelTitleBar 增补中间插槽/刷新语义/窗口控制插槽单测；四面板各补一条「标题栏结构与面板导航顺序与 panel 形态一致」断言；popup 顺序断言改正确顺序（`刷新 设置 用量 代理 会话`）。
- 线索：`.scratch/titlebar_order_repro.mjs`（静态对比四面板导航按钮顺序，复现 popup 顺序差异）

## 追加二：会话面板背景色层级不统一（侧边栏/槽位卡片错误 token）

- 现象：会话面板（SessionShell 工作台视图）内「面板背景、槽位卡片、侧边栏」三者的背景色层级与其他面板不一致，视觉上糊成一片、无卡片间隔：
    - **侧边栏**（`SessionRail.tsx:32`）用 `bg-[var(--color-surface)]`（桌面衬底最深色 #0c0e13），而统一基准 Settings 侧边栏（`SettingsView.tsx:435`）用 `bg-[color-mix(in_srgb,var(--color-surface-window)_70%,var(--color-surface)_8%)]` 浅混色。会话侧边栏因此比面板背景深太多，且不是统一侧边栏色。
    - **槽位卡片**（`SessionRail.tsx:63`）用 `bg-[var(--color-surface-window)]`（#181b22），与主面板背景（`WorkspaceView.tsx:309` 同为 window #181b22）**完全同色**，导致「会话卡片」与「面板背景」连成一片、只靠一条 border-r 分隔，没有「浅色卡片突出 + 深色间隙」的层级。
    - **标题栏 rail-toggle 按钮**（`SessionShell.tsx:51`）同样用 `bg-[var(--color-surface)]`，与侧边栏同错。
- 影响：会话面板背景层级违反 DESIGN.md 中性灰阶约定（`DESIGN.md:381`：「暗色下卡片 #1f232c 比窗口略亮」「卡片靠描边与浅投影分层层级」）。会话面板是唯一用 `--color-surface` 做侧边栏/栏目背景、用 `--color-surface-window` 做卡片背景的面板，其余面板（Settings/TokenStats）侧边栏用混色、卡片用 `ui/Card`（surface-card/raised）。影响范围：会话工作台视图视觉一致性与层级清晰度。
- 根因：SessionRail/SessionShell 在 t257/t323 会话面板改造时手写背景色 className，未复用 Settings 侧边栏的混色配方，也未用 `ui/Card` 的 card/raised 语义。分类：产品缺陷（视觉层级）+ 未遵守设计 token。
- 已确认同类位点（同一机制「背景色 token 错用」，合并为本条）：
    - `SessionRail.tsx:32` 侧边栏 `bg-surface`（应改混色/window）
    - `SessionShell.tsx:51` rail-toggle `bg-surface`（同侧边栏）
    - `SessionRail.tsx:63` 槽位卡片 `bg-surface-window`（应改 card/raised）
    - 已扫：grep `bg-[var(--color-surface)]` 全仓仅上述 3 处（另 `SessionShell` rail-toggle 已含）；Settings 侧边栏混色是正确基准；其余面板卡片均走 `ui/Card`。SessionPane 大纲抽屉 `bg-surface-window`（`SessionPane.tsx:321`）是覆盖在 raised 面板上的浮层，用 window 合理，不属本问题。
- 修复方向：侧边栏与 rail-toggle 改用 Settings 同款混色（`color-mix(window 70%, surface 8%)`）；槽位卡片改用 `--color-surface-card`（或 `raised`，与 SessionCard/SessionPane 卡片一致），形成「侧边栏略暗 + 卡片亮 + 面板 window 中间层」的三层结构。空槽位保持 `bg-transparent` + dashed 边框。
- 测试缺口：
    - 现有 `tests/unit/renderer/styles/session_typography.test.tsx` 只断言字号 token（title/meta 字号），无背景色/层级断言。
    - `tests/unit/renderer/components/workspace/SessionRail.test.tsx` 只测功能与 provider 徽标/空槽位，无背景色 className 断言。
    - 补测：SessionRail/SessionShell 各补一条「侧边栏 className 含正确背景 token（混色/window，而非 surface）」「槽位卡片 className 含 card/raised 背景」的 DOM className 断言；或参照 `session_typography.test.tsx` 的渲染输出断言范式。

## 追加：薄包装兼容层残留（已统一到 `ui/`，留旧 API 适配壳）

- 现象：底层组件已统一到 `components/ui/`，但仍保留三处旧 API 薄包装壳，调用方未迁到 `ui/` 直用：
    - `components/SecretInput.tsx`：内部 delegate `ui/SecretInput`，仅把 `onChange(value)` 转 `onChange(event)`。6 处调用方仍在用旧 API（`CpaAddDialog`/`CpaConnectorSettings`/`SettingsForm`/`CpaMgmtForm`/`ExaServiceKeyForm`/`ApiKeyForm`）。
    - `components/settings/Select.tsx`：delegate `ui/Select`，把 `options: string[]` 转原生 option。2 处引用（`general_section.tsx`/`data_section.tsx`）。
    - `components/settings/Toggle.tsx`：delegate `ui/Switch`，把 `on/onClick` 转 `checked/onChange`。
- 影响：双 API 并存造成选择困惑；`ui/` 已有能力，旧壳属迁移残留，非「没统一」。清理后调用方直用 `ui/`，减少一层间接与维护面。
- 根因：t269/t271 统一 ui 组件库时，为减小迁移 diff 保留了旧 API 适配壳，后续未做调用方迁移收尾。分类：架构残留（薄包装）。
- 同类位点：以上三处（同一机制「已 delegate 到 ui/ 的旧 API 壳」）；已扫无其它（`settings/Toggle` 全仓仅此一处旧包装，其余设置项已直用 `ui/Switch`）。
- 测试缺口：现有测试（`ui.test.tsx` 等）只测 `ui/` 本体与部分旧壳，无「旧壳行为与 ui/ 本体一致」的契约测试；迁移后补/删对应旧壳单测。
- 修复方向：调用方迁移到 `ui/SecretInput`/`ui/Select`/`ui/Switch` 后删除三个旧壳文件及对应旧 API 测试；保留 `settings/Select` 的 `options: string[]` 便捷性可在调用点内联，不做新抽象。
- 处理：已开（t380 / t381 / t382）
