# Task review t380（reviewer_focus: 测试）

- task：`t380_renderer_titlebar_unify`
- spec：`docs/tasks/t380_renderer_titlebar_unify/spec.md`
- diff_anchor：`e3eb137add1a677f5787a6cd10ce78d32cebf243`
- target：`git diff e3eb137add1a677f5787a6cd10ce78d32cebf243`
- round：1
- reviewed_at：2026-08-15 03:42 UTC+8

## Findings

### t380_test_f001 - popup 标题栏 DOM 契约迁移未同步 web e2e，5 个 spec 多例破坏

- 严重度：important
- 锚点：AC-001（导航/结构统一）+ 有意不测区「真实窗口系统行为依赖现有 e2e 门控」；refactor 型 task 删除覆盖未在更高层补回
- 位置：
  - `tests/e2e/web/app_lifecycle.spec.ts:17`（`getByTitle("设置")`）、`:35`（`clickSettings()`）
  - `tests/e2e/web/popup_platform_behavior.spec.ts:23`（`[data-testid="popup-titlebar"]`）
  - `tests/e2e/web/panel_navigation.spec.ts:59-64`（`[data-testid=popup-titlebar]` + 链接「用量面板/设置/代理面板/会话历史」）
  - `tests/e2e/web/popup_height_debounce.spec.ts:52`（`[data-testid="popup-titlebar"]`）
  - `tests/e2e/web/popup_view.spec.ts:67,79-81,104`（`clickSettings()`、链接「会话历史/设置/代理面板」、点击「会话历史」）
  - `tests/e2e/pages/popup_page.ts:24`（`clickSettings` helper 用 `getByTitle("设置")`）
- 问题：t380 把 `popup-view/TitleBar.tsx` 删掉、迁移到共享 `PanelTitleBar`，DOM 契约两处变化——根节点 `data-testid="popup-titlebar"` 变 `data-panel-titlebar="Usage"`（PanelTitleBar.tsx:157 缺省 `dataPanelTitlebar ?? panel`），互跳 aria-label/title 从「用量面板/设置/代理面板/会话历史」变「Usage面板/Settings面板/Agent面板/Session面板」（PanelTitleBar.tsx:210-225）。单测层已同步（popup_view_height.test.tsx:485 起 selector 改为 `data-panel-titlebar=Usage`；popup_view.test.tsx 标签全部更新），但 e2e web 层 5 个 spec 与 page object helper 未动，全部引用旧契约，执行必挂。锚点旧 `TitleBar.tsx:41,85,123,146` 确认旧契约真实存在，属 t380 引入的破坏而非既有红。
- 建议：本 task 内同步迁移 web e2e——selector 改 `[data-panel-titlebar="Usage"]`（或保留统一 `data-testid`），互跳 name/title 改 `${p}面板` 新命名；`popup_page.ts:clickSettings` 的 `getByTitle("设置")` 改 `getByTitle("Settings面板")`（或改按 aria-label）。逐条跑 `test:e2e:web` 的 popup 相关 spec 确认绿。

### t380_test_f002 - AC-002 非 floating 关闭 → `window.usageboard.window.close()` 无测试锁定

- 严重度：important
- 锚点：AC-002「非 floating 与其余面板关闭触发 `window.usageboard.window.close()`」+ 可测试性声明「窗口控制调用均可用 vitest + mock `window.usageboard` 断言」+ 风险区「hide vs close 语义出错」
- 位置：`src/renderer/components/ui/PanelTitleBar.tsx:95-109`（非 floating close 默认 `window.close` 分支）；测试侧缺失
- 问题：AC-002 两半，只锁了 half（floating hide → `main_panel.hide()`，popup_view.test.tsx:234-243 + PanelTitleBar.test.tsx:198-206），close 侧（非 floating 用量面板 close + 其余面板缺省 close → `window.usageboard.window.close()`）全库无任何断言——grep 整个 tests/ 无 `window.usageboard.window.close` 触发断言，electron e2e `main_panel_window_modes.spec.ts` 只覆盖 floating 隐藏。且该行为发生变更：锚点 popup 非 floating close 走 `onHidePanel`（`main_panel.hide()`，锚点 `TitleBar.tsx:203-211`），t380 改为 `window.close()` 销毁窗口——正是 spec 风险区点名要防的「关闭按钮回归为销毁窗口」方向，却无测试锁定新语义。
- 建议：补一条用例（PanelTitleBar 或 popup_view）：非 floating 下点「关闭」断言 `window.usageboard.window.close` 被调；floating 下断言 `main_panel.hide` 被调（已有）。最小改动即可闭环 AC-002 与风险回退声明。

### t380_test_f003 - PanelTitleBar 插槽用例名不副实（断言弱于用例名）

- 严重度：minor
- 锚点：AC-003/AC-004 的「筛选器/页签入中间插槽」结构迁移（行为已有视图层断言补位）
- 位置：`tests/unit/renderer/components/PanelTitleBar.test.tsx:165-180`
- 问题：`center 插槽渲染于标题与动作区之间` 只断言 `getByTestId("center-slot")` 存在；`title_extra 渲染于品牌标题后` 只断言存在。若 center 渲染在 actions 之后或 title_extra 渲染在标题之外，测试仍 PASS——用例名声明的「之间/之后」位置未被验证，属存在即通过的弱形式。非危险级：slot 渲染接线本身被验证，且 Agent 筛选器/tab 入 titlebar 的行为级断言由视图层（token_stats_header.test.tsx:171-173、SessionShell.test.tsx:179-193）补位，故 minor。
- 建议：把用例名改到与断言一致（如「center 插槽可渲染」），或补位置断言（`titlebar.contains` / DOM 前后序）。最低成本选前者。

## 结论

- 前轮 finding 复核（Round 1）：无前轮。
- 改测方向复核：无迁就实现。逐条核对了全部既有测试修改——popup_view.test.tsx:340 顺序预期改为「刷新 设置 用量 代理 会话」+ `${p}面板` 命名，是 spec 契约（AC-001 顺序 + 迁移共享组件）要求，非迁就当前实现；popup_view_height selector 迁移是对新 DOM 契约的正确同步；SessionShell 两条 AC-004 重写（页签入 center、rail-toggle 独立行）均保留原行为断言（tab 切换由未改动用例覆盖；折叠/展开 collapsed class 断言原样保留），断言结构随 spec 化迁移，未删减行为覆盖。
- 本轮新发现：3 条（f001 important / f002 important / f003 minor）。
- 未进表的提示：
  - mutation 敏感性：`panels` 数组打乱会令 f001 关联的 popup_view.test.tsx:351-357 与 token_stats_header.test.tsx:188-194 两条新顺序断言失败（刷新置首、四面板恒显、当前面板不置首均被锁定）；floating 用例（PanelTitleBar.test.tsx:198-206）对 `floating` 分支真敏感——去掉 floating 分支即 `getByRole("隐藏用量面板")` 抛错、min/max 复现即 queryByRole 命中。implementer 自述「顺序打乱 2 failed」方向成立（本 diff 新增的顺序敏感断言恰为 2 条），另既有 PanelTitleBar 顺序用例亦会命中，数量非唯一判据。
  - 80 个受影响单测全部通过（5 个文件，vitest 实测绿）。
  - AC-003 状态（updatedAgo / sourceIssues / error）标题栏渲染仅有「刷新中」被断言（token_stats_header.test.tsx:197-214），为锚点遗留、t380 未减少覆盖，不属本 task 引入，可选扩展。
  - SessionShell.test.tsx:190 `expect(tab_nav).toBeTruthy()` 与上一行 `getByRole` 冗余，无害。
- 总体判断：单测层新增/改写断言可信且 mutation 敏感，但 popup 契约迁移破坏了 5 个 web e2e spec（未迁移）且 AC-002 close 侧无锁定，两处未解决 important，不能 PASS。
- 系统性 follow-up：无（e2e 迁移应在 t380 内完成；若本 task 不修可另立 slug `e2e_popup_titlebar_contract_sync`）。

verdict: FAIL
reviewed_scope: 240a1d7ae221fb46

---

# Round 2 复核

- round：2
- reviewed_at：2026-08-15 03:52 UTC+8
- target：`git diff e3eb137add1a677f5787a6cd10ce78d32cebf243`（工作区含 f001-f003 修复）

## Findings（Round 2 复核）

### t380_test_f001 - e2e 契约迁移完成，已消除

- 逐文件核对 diff：
  - `panel_navigation.spec.ts`：selector `[data-testid=popup-titlebar]` → `[data-panel-titlebar=Usage]`；链接「用量面板/设置/代理面板/会话历史」→「Usage面板/Settings面板/Agent面板/Session面板」，与 PanelTitleBar web 分支（PanelTitleBar.tsx:210-215 `${p}面板` + `#usage/#setting/#agent/#session`）逐一对齐。✓
  - `popup_platform_behavior.spec.ts:23`、`popup_height_debounce.spec.ts:52`：`[data-testid="popup-titlebar"]` → `[data-panel-titlebar="Usage"]`。✓
  - `panel_window_controls.spec.ts:81`：fallback `[data-testid="popup-titlebar"]` → `[data-panel-titlebar="Usage"]`。✓
  - `popup_view.spec.ts:79-81,104`：链接「会话历史/设置/代理面板」→「Session面板/Settings面板/Agent面板」；点击目标同步。✓
  - `app_lifecycle.spec.ts:17` + `popup_page.ts:24`：`getByTitle("设置")` → `getByTitle("Settings面板")`（web/桌面 title 两态一致，helper 跨态定位语义保持）。✓
- 残留扫描：全 e2e 树 grep `popup-titlebar`、`getByTitle("设置")`、`getByRole("link", { name: "用量面板/设置/代理面板/会话历史" })` 零命中。修复完整。
- 改测方向：selector/name 迁移是对新 DOM 契约的正确同步，未删断言、未反转、未 skip/only，无迁就实现痕迹。

### t380_test_f002 - 非 floating close → window.close 已锁定，已消除

- 新用例 `popup_view.test.tsx:245-259`「t380 AC-002: 非 floating 关闭按钮触发 window.close（销毁窗口）」：`vi.spyOn(window.usageboard.window, "close")`，渲染 PopupView（默认 popup 模式），`getByRole("button", { name: "关闭" })` 点击，断言 `window_close` 被调 1 次，且 `main_panel_hide` **不被**调用，末尾 `mockRestore`。
- 可信与敏感度：spy 于系统边界（preload 暴露桥 API）属合法 mock；hide 否定断言显式区分 hide vs close 两语义，正是 spec 风险区点名的回归方向——若实现把非 floating close 改回 `main_panel.hide()`，该断言即红。实测通过（popup_view 28→29 例）。AC-002 两半（floating hide / 非 floating close）现均被锁定。
- 说明：非 floating 下「其余面板」的关闭走共享 `PanelTitleBar` 同一默认分支（PanelTitleBar.tsx:95-109 `onClose ?? window.close`），本用例已触达该分支生产实现，无需逐面板重复。

### t380_test_f003 - 维持，接受

- implementer 选择不改 PanelTitleBar.test.tsx 存在性断言，理由是视图层行为断言已补位。复核确认：
  - Agent center（筛选器）在 titlebar 内：token_stats_header.test.tsx:171-173 逐元素断言 `closest("[data-panel-titlebar]") === titlebar`。✓
  - Session center（页签）在 titlebar 内：SessionShell.test.tsx:190-192 `titlebar.contains(tab_nav)`。✓
  - Usage title_extra（footerTime）渲染于标题栏：popup_view.test.tsx:41-49（popup-time 渲染 + statusbar 为 null）+ 顺序用例以 `[data-panel-titlebar="Usage"]` 容器内取按钮。✓
- 位置「标题与动作区之间 / 品牌标题后」非 AC 要求（AC-003/004 仅要求入标题栏可用），维持合理。minor 不阻断。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除（7 处 e2e 迁移 + 残留扫描 0）；f002 已消除（新用例锁定 close 侧，mutation 敏感）；f003 维持接受（minor，视图层补位成立）。
- 改测方向复核：本轮新增/修改均为契约迁移与缺失补测，无迁就实现。
- 本轮新发现：0 条。
- 未进表的提示：f002 用例若中途失败 `mockRestore` 不执行，但 `install_popup_usageboard` beforeEach 每次重设 `window.usageboard`，spy 不跨用例泄漏，无害。范围外。
- 总体判断：两条 important 均已按建议修复且经复核与实测（受影响单测 72 例全绿）；f003 minor 维持不阻断。未解决 critical/important 为 0，可 PASS。
- 系统性 follow-up：无。

verdict: PASS
reviewed_scope: fe8c136eddb5f967

## Round 3（指纹同步）

- f004（Session 页签整高）为纯视觉 code 修复，test 轴无新行为断言需求；reviewed_scope 随 code 变更同步为 7cb2e323b6a83f2c。

verdict: PASS
reviewed_scope: 7cb2e323b6a83f2c
