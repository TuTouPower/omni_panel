# Demo UI Alignment Design

## 背景

当前项目已经部分吸收 `docs/design/omni-usage/project/` 的视觉 token 和设置页样式，但还没有完全对齐 demo。

已接近：

- `src/renderer/styles/globals.css` 基础色、卡片、设置页、弹窗样式接近 demo。
- `src/renderer/views/SettingsView.tsx` 结构基本接近 demo 的 `settings.jsx`。
- `src/renderer/views/PopupView.tsx` 顶栏、tab、状态栏有 demo 雏形。

未对齐重点：

- 主面板卡片交互少很多。
- 总览 / 服务 tab 内容结构不同。
- Token 面板缺失。
- 右键托盘菜单视觉缺失。
- demo 中的卡片折叠、拖拽、更多菜单、关闭/启用状态没有完整实现。
- demo 展示全部服务 tab；项目当前只显示已有或启用 provider。
- 设置页账号管理只按已配置插件显示，不是 demo 那种按 provider 分组的完整账号管理体验。

## 目标

让项目真实前端完全对齐 demo，但保留真实 Electron / IPC / 插件数据流。

约束：

- 不直接移植 demo 假数据。
- 不修改 `docs/design/omni-usage/**`。
- 只修改项目 `src/renderer` 相关代码，必要时补少量测试。
- 缺失后端能力时显示空状态，不伪装完整能力。

## 方案

采用真实功能对齐 demo。

### 主弹窗结构

对齐 demo 的主窗口结构：

- 顶栏：logo、`OmniUsage`、刷新全部按钮、设置按钮。
- tab 区：固定“总览”，并展示 Claude / Codex / Gemini / Antigravity / Kimi / GLM / MiniMax / DeepSeek / Tavily。
- tab 保留滚动、active 状态、分隔线、fade 效果。
- body：
    - 总览显示所有 provider 卡片。
    - 单服务 tab 显示该 provider 下的账号卡片。
    - 空状态、错误 banner、刷新中 skeleton 按 demo。
- 底部：状态点、状态文案、更新时间。

### 卡片行为

补齐 demo 中 `UsageCard` 的行为：

- 拖拽手柄。
- 刷新单卡。
- 更多菜单：编辑、关闭 / 启用、删除。
- 折叠 / 展开。
- 关闭状态：卡片灰化，显示“监控已关闭，不再刷新用量”，提供“启用”。
- 错误状态：网络异常 / 刷新失败，提供重试。
- 认证状态：凭证失效，提供重新登录入口。
- 限制状态：接近限制时红色边框 / danger bar。

实现上用真实 `ConnectorInfo` / `UsageItem` 映射，不使用 demo 假数组。

### 用量展示

当前项目的 `ProviderCard` 只显示 provider 概要，不显示 demo 的两行用量条。

需要改成：

- 每张卡展示名称、最近更新时间、5 小时用量条、一周用量条、reset 时间。
- 没有对应窗口的数据时显示 demo 风格空 / 关闭 / 未知状态。
- 多账号时：总览显示 provider 汇总，单 provider tab 显示账号列表。

### Token 面板

补齐 demo 的 `TokenPanel`：

- 标题：`Total Tokens`。
- 总量数字。
- 时间范围切换：今天、最近一周、最近一月。
- 图表：用现有 `UsageItem` 能提供的数据聚合。
- 如果真实历史数据不足，显示空图或 0 数据，不伪造 demo 假数据。

风险：当前后端是否已有 token 历史数据不确定。如果没有历史趋势，只能视觉对齐，数据能力显示为暂无历史数据。

### 设置页

设置页已经接近，但要补齐：

- 关于页 logo 改成真实 logo，而不是纯图标 badge。
- 版本文案按真实 `package.json`。
- 账号页按 demo 的 provider 分组视觉：每个 provider 一组、添加按钮、总开关、账号行、状态点、账号名、编辑、删除、开关。
- 对真实插件模型做映射：CPA connector 如果能产出多个 provider，应按 provider 分组展示；非 CPA 插件归入对应 provider 或 connector 分组。

### 托盘菜单视觉

demo 有独立 `TrayWindow` / 右键菜单视觉。

项目需要使用自绘托盘右键菜单窗口对齐主要视觉：

- 右键托盘图标打开独立菜单窗口。
- 菜单项：打开主面板、立即刷新全部、暂停 / 恢复自动刷新、开机自启、设置、检查更新、退出 OmniUsage。
- 菜单窗口宽高由菜单内容决定；菜单项变多或变少时窗口尺寸跟随内容变化。
- 不给托盘菜单额外设置固定高度，不用内部滚动条承载正常菜单内容。
- 不复用主面板 Popup / Floating Window 的高度策略；只有屏幕可用区域放不下完整菜单时，才做边界修正。

限制：托盘菜单是独立 BrowserWindow，不是主面板；左键托盘仍只表示打开 / 聚焦主面板。

### 样式对齐

`globals.css` 已接近，但需补齐 demo 缺失类：

- `.tab.pinned`
- `.tabs-fade`
- `.tabs-chevron`
- `.count-badge`
- `.card.dragging`
- `.card.drag-over`
- `.tokens-head .card-grip`
- `.tokens-head .card-collapse`
- `.ctx-menu`
- `.ctx-item`
- `.ctx-sep`
- `.ctx-status`

同时清理当前项目中和 demo 语义冲突的样式。

## 文件范围

主要修改：

- `src/renderer/views/PopupView.tsx`
- `src/renderer/views/SettingsView.tsx`
- `src/renderer/components/ProviderNav.tsx`
- `src/renderer/components/ProviderOverview.tsx`
- `src/renderer/components/ProviderCard.tsx`
- `src/renderer/components/ProviderAccountList.tsx`
- `src/renderer/components/ProviderAccountRow.tsx`
- `src/renderer/lib/provider-usage.ts`
- `src/renderer/styles/globals.css`

可能新增：

- `src/renderer/components/UsageCard.tsx`
- `src/renderer/components/TokenPanel.tsx`
- `src/renderer/components/CardMenu.tsx`
- `src/renderer/components/UsageBarRow.tsx`

禁止修改：

- `docs/design/omni-usage/**`

## 验证标准

必须完成：

- `pnpm test`
- UI 手动验证：
    - 总览。
    - 单服务 tab。
    - 刷新全部。
    - 单卡刷新。
    - 折叠 / 展开。
    - 更多菜单。
    - 关闭 / 启用。
    - 设置页账号管理。
    - 添加 / 编辑弹窗。
    - 明暗主题。
- 打包验证：
    - `pnpm package`
    - 启动 `artifacts/win-unpacked/OmniUsage.exe`
    - 确认窗口加载、托盘出现、主路径可用。

## 风险与未闭环

- Token 历史图可能没有真实数据源；只能视觉对齐，不能假造数据。
- Electron 原生托盘菜单不能完全用 CSS 复刻；如果要像 demo 100% 视觉，需要自绘托盘菜单窗口。
- demo 是静态原型，部分交互是原型级，不一定等价真实产品逻辑。
- “全部 provider 永远显示”与“只显示已有数据 provider”需要选择。为了完全对齐 demo，建议全部显示，没配置的显示空状态。

## 结论

采用真实功能对齐 demo。

实施原则：

1. 以 demo 为视觉和交互标准。
2. 以现有插件数据为唯一真实数据源。
3. 不导入 demo 假数据。
4. 不修改 `docs/design/omni-usage/**`。
5. 缺失后端能力时明确显示空状态，不伪装完整能力。
