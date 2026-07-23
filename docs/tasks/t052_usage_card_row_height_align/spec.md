# Task spec

## 背景

用量面板 overview-grid（`src/renderer/views/PopupView` + 相关 CSS）同行卡片高度不一致：有的卡片内容两行、有的三行或更多，同行卡片顶部对齐但底部参差，空白处露出页面背景而非卡片背景，视觉不齐。用户要求同一行卡片高度按该行最高的那张对齐，多余空白正常填充卡片背景。

## 范围

- 排查 overview-grid 当前 CSS（`ui-views-web.md` 记载 `repeat(auto-fill, minmax(320px, 1fr))`，`@container` 断点切列数）。
- 改造为同行等高：grid 容器 `align-items: stretch`（默认应已是 stretch，需确认被覆盖点），卡片根元素 `height: 100%`（或 `display:flex; flex-direction:column`），内部内容区 `flex:1` 撑满，使卡片背景填满同行最高高度。
- 涉及组件：`ProviderOverview`/`ProviderCard`/`AccountUsageRow`/`CollapsibleCard` 中作为 grid item 的卡片根。
- 桌面端（PopupView）与 web（out/web）两路均验证。

## 非范围

- 不改卡片内容布局（信息行数本身不变）。
- 不改移动端 `<640px` 单列布局。
- 不改设置窗 / TokenStats 窗布局。

## 验收标准

- [ ] 同行卡片（不同内容行数）底部对齐，高度 = 同行最高卡片。
- [ ] 多余空白填充卡片背景色，不露页面背景。
- [ ] 暗色/亮色主题下表现一致。
- [ ] 桌面端（`artifacts/win-unpacked/OmniUsage.exe` 或 `pnpm start:test`）与 web（build:web）均验证。
- [ ] `<640px` 单列、640-1023px 两列、≥1024px auto-fill 三种断点无回归。

## 依赖与约束

- 需先定位 grid item 卡片根的现有类名与是否已有 height/align 规则，避免重复或冲突。
- web 构建需单独 `pnpm build:web`（electron-vite build 不含）。
