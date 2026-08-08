# Task review t270（reviewer_focus: 通用）

- task：`t270_usage_tray_design_migration`
- spec：`docs/tasks/t270_usage_tray_design_migration/spec.md`
- diff_anchor：`4c55468b0791cc6d6a39d0dc67bbbdb09802885d`
- target：`git diff 4c55468b0791cc6d6a39d0dc67bbbdb09802885d`
- round：1
- reviewed_at：2026-08-09 06:18 UTC+8

## Findings

### t270_gen_f001 - AC5 未完全满足：迁移后残留多个本窗口专属手写 CSS 死选择器（grep 可证）

- 严重度：important
- 锚点：AC5「本窗口专属手写 CSS 类已删除且无残留引用（grep 可证）」
- 位置：`src/renderer/styles/globals.css:3663`、`globals.css:1244`、`globals.css:1062/1074/1078`
- 问题：迁移后以下选择器已无任何 DOM 匹配，但仍在 globals.css 中：
    - `.tray-window .ctx-item`（3663）：TrayMenu 迁移到 `ui/MenuItem` 后无元素再持有 `.ctx-item`，`grep -n "ctx-item" src/` 仍命中此处。
    - `.net-banner .nb-action`（1244）：NetBanner 迁移到语义类后不再渲染 `.nb-action`；SettingsView 仅用 `.net-banner`（`SettingsView.tsx:399`），不用 `.nb-action`。
    - `.skel` / `.skel.lbl` / 旧 `@keyframes shimmer`（1062/1074/1078）：SkeletonCard 与 provider_card_content 迁移到 `ui/Skeleton` 后无组件再渲染 `.skel`（`animation: shimmer` 仅被 `.skel` 引用）。
    - 与 AC5「grep 可证」不符；task.md 自述「btn-primary/ctx-item/ctx-sep/ci-ic CSS 定义已删除（迁移后无引用）」「net-banner 保留」不完整——`nb-action`/`skel`/旧 shimmer 未列入处置。
- 建议：删除上述死选择器与旧 keyframes（`.net-banner`/`skeleton-bars`/`skel-row` 因 SettingsView 与迁移组件仍用，应保留）。

### t270_gen_f002 - e2e 页面助手 errorBanner() 定位器失效，hasError() 恒 false

- 严重度：minor
- 锚点：spec 测试策略「迁移失效的样式断言按新语义类名改写」
- 位置：`tests/e2e/pages/popup_page.ts:35`
- 问题：`errorBanner()` 用 `.live.locator(".net-banner")`，而 `NetBanner.tsx:11` 迁移后不再渲染 `net-banner` 类，定位器（作用域 `[data-popup="live"]`）永不匹配，`hasError()` 将永远返回 false。当前无 e2e spec 调用该方法，故无红灯，但属迁移遗漏的样式断言，且为静默失效陷阱。
- 建议：改为语义类定位或加 data-testid，并确认无 spec 依赖该行为。

### t270_gen_f003 - TitleBar 迁移为 ui/Button 后仍保留 `.icon-btn` className，icon 变体 token 被旧 CSS 覆盖

- 严重度：minor
- 锚点：范围「TitleBar（icon-btn→ui/Button）」
- 位置：`src/renderer/views/popup-view/TitleBar.tsx:48-143`
- 问题：7 个按钮 className 均含 `icon-btn`。globals.css `.icon-btn`（407-428）为非层叠规则，层叠优先级高于 Tailwind 工具类层，`variant="icon"` 的 `text-[var(--color-on-surface-variant)]` 与 hover 背景被旧 `--iconbtn`/`--iconbtn-hov` 覆盖，按钮实际仍渲染旧外观，设计 token 化未落地。仅刷新按钮需 `.icon-btn`（`.icon-btn.spinning svg` 动画与 `popup_view_height.test.tsx` 的 `.icon-btn[title="刷新全部"].spinning` 断言）。
- 建议：非刷新按钮移除 `icon-btn` className；刷新按钮保留以维持 spinning，或在 Button 组件内支持 spin。

### t270_gen_f004 - 骨架屏 grid 首列溢出 + flex-1 no-op

- 严重度：minor
- 锚点：AC2「用量条…形态保留」邻接的加载态视觉；AC6 人工对照
- 位置：`src/renderer/views/popup-view/SkeletonCard.tsx:6-16`、`src/renderer/components/provider_card_content.tsx:30-38`
- 问题：`.skel-row` 为 `grid-template-columns: 42px 1fr`；首列 `<Skeleton className="h-3 w-16" />` 宽度 64px 超出 42px 轨道，向第二列溢出可能重叠；第二列 `flex-1` 在 grid 上下文无效（no-op，靠 justify-self stretch 填充）；骨架高度 12px（h-3）较旧 `.skel` 6px 明显增粗，加载态视觉与迁移前差异明显。
- 建议：首列用 `w-[42px]` 或调整 grid 列；去掉无用的 `flex-1`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮 round 1）
- 本轮新发现：4 条
- 未进表的提示：
    - 托盘菜单存在双层毛玻璃（外层 `.tray-window` 保留 `blur(28px) saturate(170%)`，内层 Menu `glass-menu` 另加 `blur(12px)`），视觉上有两层叠加；属统一菜单配方设计意图，未判 finding。
    - `ui/Skeleton` 同时挂 `shimmer`（shimmer-move）与 `animate-pulse` 两个 animation，级联只生效一个；属 t269 组件非本 diff 改动。
- 总体判断：功能行为回归经单测验证通过（tray_menu/popup_view/popup_view_height 共 34 tests passed），typecheck 与 lint 通过；唯 AC5 未完全满足——残留 5 处本窗口专属手写 CSS 死选择器（含 `.tray-window .ctx-item` 直接命中已迁移类名），task.md 自述「无引用」不成立，需清除后复验。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-09)

逐条复核结果（对照当前工作区代码 + `git diff 4c55468b`）：

- **t270_gen_f001 — 已修**。globals.css diff 移除 `.skel`/`.skel.lbl`/旧 `@keyframes shimmer` 整块（1059-1083 区）、`.net-banner .nb-action`（现仅留注释）、`.tray-window .ctx-item`、`.ctx-item`/`.ctx-sep`/`.ci-*`/`btn-primary` 全部删除；grep 全 src 无 `ctx-item`/`nb-action`/`.skel` 残留，仅保留 SettingsView 仍用的 `.net-banner` 与迁移组件仍用的 `.skeleton-bars`/`.skel-row`。
- **t270_gen_f002 — 已修**。`tests/e2e/pages/popup_page.ts:35` errorBanner() 改为 `this.live.getByText("网络连接异常，部分数据可能不是最新")`，与 `NetBanner.tsx:13` 渲染文案精确匹配，作用域仍限 `[data-popup="live"]`。
- **t270_gen_f003 — 已修**。`TitleBar.tsx` 7 个按钮中仅刷新保留 `className={"icon-btn" + (refreshing ? " spinning" : "")}`，其余 6 个（设置/代理面板/会话历史/隐藏/最小化/最大化/关闭）纯 `variant="icon" size="sm"` 无 className；`.icon-btn.spinning svg` 动画（globals.css:426）与 `popup_view_height.test.tsx` 的 `.icon-btn[title="刷新全部"].spinning` 断言仍可命中。
- **t270_gen_f004 — 已修**。`SkeletonCard.tsx` 与 `provider_card_content.tsx` 首列 `w-16`→`w-10`（40px < 42px 轨道不溢出），第二列去掉 `flex-1` 改 `w-full`（grid `1fr` 列内有效填充）。

Round 2 新增 finding：无（未达 finding 阈值）。

未进表的提示：

- `globals.css:3585/3590` 的 `.ctx-overlay`/`.ctx-menu` 仍为死选择器（grep 无引用），但 anchor 提交 `4c55468b` 亦无引用——非本 task 迁移产生的残留，属迁移前已存在的旧 context-menu 死代码，不在 f001 处置清单内；可随后续清理，不阻断本 task。

回归验证：

- 单测：`pnpm test` 2746 passed（252 files，2 skipped）。
- build：`pnpm build` 全段通过（electron + web）。
- e2e：`E2E_HEADLESS=1` 全量 electron 57 passed / 5 skipped / 0 failed；tray_menu_actions 4 全过；popup_token_panel 初查 3 failed 系渲染端未注入 `VITE_ENABLE_TOKEN_PANEL=1` 的 env 失配（非回归），重建含 flag 后 3 passed。

verdict: PASS
