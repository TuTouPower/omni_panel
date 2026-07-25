# Task spec

## 背景

用量面板概览页的「即将重置」区域目前是一个独立的横幅/侧边栏（`UpcomingResetBanner` / `UpcomingResetRail`），与 provider 卡片（`ProviderCard`）视觉和交互风格不一致。用户希望把它做成一张和其他用量卡片同类的卡片，可拖动、可折叠展开，并统一排列在卡片网格中。

## 范围

1. 将「即将重置」内容渲染为一张 `CollapsibleCard` 样式的卡片，纳入概览页的卡片网格（`.overview-grid`），与 provider 卡片统一排列行列。
2. 卡片支持折叠/展开，状态以保留键 `__upcoming_reset__` 持久化到 `expandedProviders`；折叠后显示标题和计数，展开后显示重置条目列表。
3. 卡片支持拖动重排，顺序以同一保留键持久化到 `providerOrder`，与 provider 卡片共用同一拖拽交互。
4. 移除或替换原 `UpcomingResetBanner` 在概览页顶部的独立横幅形态；`UpcomingResetRail` 侧边栏在 ≥1024px 时保留或移除，根据卡片化后的布局决定（默认移除，卡片已承载展示职责）。
5. 保留现有「即将重置」数据收集逻辑（`collect_upcoming_resets`）、阈值过滤、watched metric 过滤、点击跳转 provider tab 等行为。
6. 补单元测试覆盖卡片渲染、折叠展开、拖拽交互、空态显示。

## 非范围

- 不改 `collect_upcoming_resets` 数据收集逻辑。
- 不改 `upcomingResetThresholdPercent` 阈值配置或设置页 UI。
- 不改 provider 卡片内部结构或用量条样式。
- 不改 CPA / 直连账号的 watched metric 持久化 schema。
- 不改 `UpcomingResetRow` 单条重置项的展示内容。

## 验收标准

- [ ] 概览页出现一张「即将重置」卡片，与其他 provider 卡片同处 `.overview-grid`，行列排列一致。
- [ ] 卡片可折叠/展开，状态持久化，重启后保持。
- [ ] 卡片可拖动重排，顺序持久化到 `providerOrder`，与其他卡片共用拖拽交互。
- [ ] 原 `UpcomingResetBanner` 独立横幅不再出现；`UpcomingResetRail` 按布局决策移除或保留。
- [ ] 空态（无重置项）时卡片显示「未来 7 天内暂无重置」或等效文案。
- [ ] 重置条目点击仍跳转到对应 provider tab。
- [ ] renderer 单测覆盖新卡片组件及 PopupView 集成路径。
- [ ] `pnpm test` 全量通过。

## 依赖与约束

- 复用 `CollapsibleCard`、`DragGrip`、`UpcomingResetRow` 组件。
- 复用 `use_dnd_handlers` 或在其基础上扩展以支持非 provider 卡片。
- 卡片顺序使用现有 `providerOrder`；配置 schema 已允许任意 string，因此以保留键 `__upcoming_reset__` 表示此卡片，并在 provider tab 顺序派生时自然过滤。
- 折叠状态使用现有 `expandedProviders` 的同一保留键；状态裁剪逻辑保留该键，避免 provider 数据刷新后丢失。
