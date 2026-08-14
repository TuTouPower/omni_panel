# Task review t380（reviewer_focus: 代码）

- task：`t380_renderer_titlebar_unify`
- spec：`docs/tasks/t380_renderer_titlebar_unify/spec.md`
- diff_anchor：`e3eb137add1a677f5787a6cd10ce78d32cebf243`
- target：`git diff e3eb137add1a677f5787a6cd10ce78d32cebf243`
- round：1
- reviewed_at：2026-08-15 03:44 UTC+8

## Findings

### t380_code_f001 - 删 `data-testid="popup-titlebar"` + 导航 aria-label 改名未迁移 e2e，破坏既有验证契约

- 严重度：important
- 锚点：AC-005 之外的行为契约（DOM testid / 可访问名）被静默变更；无 AC 要求改名，属迁移共享组件的连带副作用未收敛
- 位置：`src/renderer/views/PopupView.tsx:699-725`（`panel="Usage"` 替换旧自绘 TitleBar）；`src/renderer/components/ui/PanelTitleBar.tsx:196-234`（nav `aria-label={p}面板`）
- 问题：旧 popup 标题栏 `data-testid="popup-titlebar"` 随 TitleBar.tsx 删除而消失，导航可访问名由「设置 / 用量面板 / 代理面板 / 会话历史」改为「Settings面板 / Usage面板 / Agent面板 / Session面板」、`title="设置"` 改 `title="Settings面板"`。本 diff 只更新了 5 个单测文件，未迁移任何 e2e，以下既有 e2e 将失败：
  - `tests/e2e/web/popup_view.spec.ts:79-82,104`（`link name="会话历史"/"设置"/"代理面板"` 点击）
  - `tests/e2e/web/panel_navigation.spec.ts:57-63`（`[data-testid=popup-titlebar]` + 旧 label）
  - `tests/e2e/web/popup_height_debounce.spec.ts:52`（`[data-testid="popup-titlebar"]`）
  - `tests/e2e/web/popup_platform_behavior.spec.ts:23`（`[data-testid="popup-titlebar"]`）
  - `tests/e2e/web/app_lifecycle.spec.ts:17`、`tests/e2e/web/popup_demo_alignment.spec.ts:17`（`getByTitle("设置")`）
  - `tests/e2e/pages/popup_page.ts:24` `clickSettings()`（`getByTitle("设置")`，被多个 spec 复用）
  spec 的可测试性声明与「有意不测」均依赖 e2e 门控真实窗口行为，破坏它等于削弱验收。TS 与 80 个受影响单测均绿，恰好掩盖了这一缺口。
- 建议：本 task 内同步迁移上述 e2e 到新契约（`[data-panel-titlebar="Usage"]` + `${p}面板` label）；或保留 `data-testid="popup-titlebar"` 别名与旧可访问名。二者择一并跑通 e2e。

### t380_code_f002 - 非 floating popup 关闭语义反转：`window.close()` 替代旧 `main_panel.hide()`

- 严重度：minor
- 锚点：行为回归（window 控制语义）；实现字面匹配 AC-002，非 spec 违约，但逆转 t252 决策，需用户确认意图
- 位置：`src/renderer/views/PopupView.tsx:718-724`；`src/renderer/components/ui/PanelTitleBar.tsx:101-106`
- 问题：旧 popup 非 floating 关闭按钮走 `onHidePanel` → `window.usageboard.main_panel.hide()`（旧 TitleBar.tsx 注释明确 t252 AC3「用量面板关闭=隐藏到托盘（保留渲染进程与数据，非销毁窗口）」）。现 `onClose` 在非 floating 传 `undefined` → `WindowControls` 默认 `window.usageboard.window.close()`（销毁窗口）。主进程 `main-panel-controller` 靠常驻窗口复用消除冷启动（t194 注释「下次打开直接 show，消除冷启动重建」），`window.close()` 会破坏该复用，下次开面板重建渲染进程。实现与 AC-002 字面一致，故本 finding 不判 spec 违约——但语义较 t252 明确逆转，属「标题栏统一」之外的连带行为变更，需用户确认是否为有意取舍。测试层未锁定非 floating close 调用（review_test f002 已记）。
- 建议：确认 AC-002 意图；若 popup 模式关闭应保留「隐藏到托盘」，则 AC-002 措辞需修订、实现改回 `main_panel.hide()`；若确为有意，补充单测锁定非 floating → `window.close()`。

### t380_code_f003 - PopupView JSX 内联调用 `use_panel_navigation()`（非 hook，`use_` 命名误导 + 每次渲染新建闭包）

- 严重度：minor
- 锚点：代码质量（命名/死分配），非行为缺陷
- 位置：`src/renderer/views/PopupView.tsx:716`
- 问题：`onNavigate={use_panel_navigation()}` 在 `render_body` 内联调用。`use_panel_navigation` 是纯工厂（无 useState/useEffect，非真 hook），此处调用不违反 rules-of-hooks，但 `use_` 前缀误导读者以为在组件顶层调用 hook；且 `render_body` 每次渲染为 live + mirror 各调一次，PopupView 因 footerTime tick / 高度上报频繁重渲染，每次新建闭包，纯属浪费。TokenStatsView/SessionShell 均在组件顶层取值（`TokenStatsView.tsx:199`），此处风格不一致。
- 建议：在组件顶层 `const navigate = use_panel_navigation();` 后传给 `render_body` 使用（与 mirror 共用同一引用）。

### t380_code_f004 - Session 页签迁 center 插槽后 `h-full` 失效，页签高度收缩、下划线不贴标题栏底边

- 严重度：minor
- 锚点：行为缺陷（视觉回归），AC-004 页签切换/高亮仍满足
- 位置：`src/renderer/components/session-shell/SessionShell.tsx:71`（`nav ... h-full`）；`src/renderer/components/ui/PanelTitleBar.tsx:172-176`（center 插槽 wrapper）
- 问题：旧页签 `nav absolute h-full`（相对 44px header）撑满整高，active 下划线贴标题栏底边。新页签放入 center 插槽 `flex min-w-0 flex-1 justify-center`（父行 `items-center`，子项高度随内容自适应），`nav` 的 `h-full` 对自动高度父级退化为 auto，页签仅 ~文本高度，active `border-b-2` 下划线不再对齐标题栏底边。功能（切换/高亮）正常，纯视觉差。
- 建议：去掉 `h-full`（当前语义无效）；如需整高下划线，让 center 插槽 `self-stretch` 或对 `session-tab` 用 `h-11`/`self-stretch`。

## 结论

- 前轮 finding 复核（Round 1）：无前轮。
- 本轮新发现：4 条（f001 important / f002 minor / f003 minor / f004 minor）。
- 未进表的提示：
  - 文件过大（>800 实现行阈值）：`src/renderer/views/PopupView.tsx` 948 行（本 task 净 +12，任务前已超阈值）；`src/renderer/views/TokenStatsView.tsx` 966 行（本 task 净 -108，趋势向好）。未引发可观测缺陷，不进 finding 表。
  - 圈复杂度：无函数新达 ≥10；刷新按钮三元/`??` 未抬升复杂度。
  - 全量 `tests/unit/renderer`（111 文件 1197 用例）实测：一次运行 `token_stats_header.test.tsx`「AC-004: fresh 缓存下点刷新不重复请求」超时 flake（独立运行与后续两轮全量均绿），该用例为 t312 遗留、事件重取缓存路径与标题栏无关，非 t380 引入。
  - `tsc --noEmit`（`exactOptionalPropertyTypes`/`noUnusedLocals` 开启）exit 0；eslint 改动文件 `--max-warnings=0` exit 0。
  - popup 的 `title_extra`（footerTime）现位于品牌区拖拽区内：win/linux 下从 footerTime 起始的拖拽会拖动窗口（旧代码其在 no-drag 动作区）。次要交互变化。
  - Session header `relative` class 因页签不再绝对定位而成为残余，无害。
  - 删除的 `popup-view/TitleBar.tsx` 在 src 无残留引用；`goToSettings` 仍被 EmptyState 使用，无死代码。
- 总体判断：AC-001/003/004/005 与 AC-002 的 floating 分支实现正确、单测覆盖且全绿；但 popup DOM 契约变更未迁移 e2e（f001 important 未解决），破坏既有 e2e 验证面，不能 PASS。
- 系统性 follow-up：无（e2e 迁移应在本 task 内完成；若本 task 不修可另立 slug `e2e_popup_titlebar_contract_sync`）。

verdict: FAIL
reviewed_scope: 240a1d7ae221fb46

---

# Task review t380（reviewer_focus: 代码）— Round 2

- task：`t380_renderer_titlebar_unify`
- spec：`docs/tasks/t380_renderer_titlebar_unify/spec.md`
- diff_anchor：`e3eb137add1a677f5787a6cd10ce78d32cebf243`
- target：`git diff e3eb137add1a677f5787a6cd10ce78d32cebf243`（工作区已含 f001-f004 修复）
- round：2
- reviewed_at：2026-08-15 03:55 UTC+8

## Findings（Round 2）

### t380_code_f004 - center 插槽 items-stretch 修复不彻底：页签仍未整高贴底（Round 2 复核，原 f004 仍存在）

- 严重度：minor
- 锚点：行为缺陷（视觉回归）未消除；AC-004 页签切换/高亮功能仍满足
- 位置：`src/renderer/components/ui/PanelTitleBar.tsx:173`（center 插槽 `items-stretch`）；`src/renderer/components/session-shell/SessionShell.tsx:71`（nav `h-full`）
- 问题：headless chromium 实测当前结构 `center=22 / nav=22 / tab=22px`，页签 active 下划线距标题栏行底 4px，未达成整高 44px 贴底。根因：center 是父行 `items-center` 子项（align-self 默认 auto），高度由内容驱动；nav `h-full`（height:100%）在 auto 高度父级退化；center 内部 `items-stretch` 仅对 cross-size 为 auto 的子项生效，nav 显式 `height:100%` 不触发 stretch。Round 1 提的修复方向未达成。
- 建议：center 插槽改 `self-stretch`（`align-self:stretch`）或 `h-full`。对照组实测二者均使 nav/tab 整高 44px、下划线贴行底（`align-self:stretch` 与 `height:100%` 两种写法均验证通过）。

## 结论（Round 2）

- 前轮 finding 复核（以 diff 为准）：
  - f001（important）：**已消除**。e2e 迁移完成：`tests/e2e/electron/panel_window_controls.spec.ts:81`、`tests/e2e/web/popup_height_debounce.spec.ts:52`、`tests/e2e/web/popup_platform_behavior.spec.ts:23` 迁 `[data-panel-titlebar="Usage"]`；`tests/e2e/web/panel_navigation.spec.ts`、`tests/e2e/web/popup_view.spec.ts`、`tests/e2e/web/app_lifecycle.spec.ts:17`、`tests/e2e/pages/popup_page.ts:24` 迁 `${p}面板` title/label。全库 grep 无残留 `popup-titlebar` / 旧可访问名。
  - f002（minor）：**已消除**。非 floating 关闭按 spec AC-002 走 `window.close()`；新增单测 `tests/unit/renderer/views/popup_view.test.tsx:245-259` 锁定 window_close 被调、main_panel_hide 未被调，mock 前提（`install_popup_usageboard` 默认 `get_mode="popup"`）成立。语义反转经用户确认属有意取舍。
  - f003（minor）：**已消除**。`use_panel_navigation()` 提至组件顶层（`PopupView.tsx:50`），`onNavigate={navigate}` 传入 render_body，与 TokenStatsView/SessionShell 一致。
  - f004（minor）：**修不彻底，仍存在**。`items-stretch` + nav `h-full` 未解决页签高度退化（见上），正确方向为 center `align-self:stretch`。
- 本轮新发现：0 条。
- 未进表的提示：e2e 改动为机械字符串替换，静态核对正确且单测已锁定对应 DOM 契约，但本环境未实际跑 e2e（Electron/web 构建成本），建议合并前过 e2e 门控。文件过大/复杂度结论同 Round 1（PopupView 948 行、TokenStatsView 966 行，t380 净增减不变）。验证实测：`tsc --noEmit`（exactOptionalPropertyTypes/noUnusedLocals）exit 0；eslint 改动文件 `--max-warnings=0` exit 0；`tests/unit/renderer` 全量 111 文件 1198 passed（较 Round 1 +1 = f002 新增单测）。
- 总体判断：f001/f002/f003 已消除，f004 修不彻底但为纯视觉 minor、AC 功能不受影响；无未解决 critical/important，PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: fe8c136eddb5f967

---

# Task review t380（reviewer_focus: 代码）— Round 3

- task：`t380_renderer_titlebar_unify`
- spec：`docs/tasks/t380_renderer_titlebar_unify/spec.md`
- diff_anchor：`e3eb137add1a677f5787a6cd10ce78d32cebf243`
- target：`git diff e3eb137add1a677f5787a6cd10ce78d32cebf243`（工作区已含 f001-f004 最终修复）
- round：3
- reviewed_at：2026-08-15 03:56 UTC+8

## Findings（Round 3）

本轮无新 finding。

## 结论（Round 3）

- 前轮 finding 复核（以 diff 为准）：
  - f001（important）：已消除（Round 2 确认，本轮未回退）。
  - f002（minor）：已消除（Round 2 确认，本轮未回退）。
  - f003（minor）：已消除（Round 2 确认，本轮未回退）。
  - f004（minor）：**已消除**。center 插槽容器由 `flex min-w-0 flex-1 items-stretch` 改为 `flex h-full min-w-0 flex-1 items-stretch justify-center`（`PanelTitleBar.tsx:173`）。headless chromium 实测当前结构（bar `h-11 items-center` 44px + center `h-full` + nav `h-full` + tab `items-stretch`）：center/nav/tab 均 43px ≈ bar content 43px（44px 含 1px border），页签整高贴底、active 下划线贴标题栏底边。`h-full` 撑满 cross 轴后，内部 nav `h-full` 不再退化，`items-stretch` 无冲突。
- 本轮新发现：0 条。
- 未进表的提示：验证实测——受影响 4 个单测文件 72 用例通过；`tsc --noEmit` exit 0；eslint `PanelTitleBar.tsx --max-warnings=0` exit 0。e2e 门控仍未在本环境实跑（Electron/web 构建成本），合并前保留提醒。
- 总体判断：f001-f004 全部消除，无新问题；AC-001~005 全部满足，PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: 7cb2e323b6a83f2c
