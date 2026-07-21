# Task review T005

- task：`T005_upcoming_reset_panel`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 23:30 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T005_test_f001 — 行点击「滚动回顶」行为未被任何测试覆盖

- 严重度：medium
- 位置：`src/renderer/views/PopupView.tsx:273-278`（`select_provider_from_upcoming`）；`tests/unit/renderer/components/upcoming_reset_rail.test.tsx:41-53` / `upcoming_reset_banner.test.tsx:60-74`
- 问题：spec 验收 #4「行点击切到对应 provider tab，滚动回顶」由两段实现组成——(a) `onSelectProvider(item.provider)` 由 Rail/Banner 组件层单测覆盖（已断言 `toHaveBeenCalledWith("kimi"/"deepseek")`）；(b) `document.querySelector(".scroll")?.scrollTo({ top: 0, behavior: "smooth" })` 在 PopupView 的 `select_provider_from_upcoming` 回调中，**整段实现零断言**。若滚动逻辑被误删或 selector 写错，pnpm test 仍全绿。
- 建议：补一个轻量 view 级测试（在现有 `popup_view.test.tsx` 加一例即可）：渲染 PopupView → 点击 `.ur-row` → 断言 `setActiveTab` 被触发（可通过 `vi.spyOn(document.querySelector(".scroll"), "scrollTo")` 验证滚动调用）。若 jsdom 下 `scrollTo` 未实现，可 `Element.prototype.scrollTo = vi.fn()` 注入。

### T005_test_f002 — PopupView 装配「overview-row + Banner/Rail」无回归保护

- 严重度：medium
- 位置：`src/renderer/views/PopupView.tsx:722-770`；`tests/unit/renderer/views/popup_view.test.tsx`（25 用例均未触及）
- 问题：T005 在 PopupView 中新增了 `<div className="overview-row">` 包装、挂载 `<UpcomingResetBanner />` 与 `<UpcomingResetRail />`、以及 `upcomingItems` 的 `useMemo` 计算。25 个既有 popup_view 用例全过，但**没有任何用例对装配结构作断言**。若装配被破坏（如 `upcomingItems` 忘传、`overview-row` 类名拼错、组件放在错误 tab 分支下），既有单测不会失败。spec 验收 #6「PopupView 视觉快照无回归」也无法替代——视觉快照在 GUI 环境跑（见 f004）。
- 建议：在 `popup_view.test.tsx` 加 1 例：切换到 overview tab + mock providerGroups 含一条未来 resetAt，断言 `.overview-row`、`.upcoming-banner`、`.upcoming-rail` 均在 DOM 中，且 rail 列表含期望行文案。

### T005_test_f003 — Rail 测试 `format_reset_time` 断言过弱

- 严重度：low
- 位置：`tests/unit/renderer/components/upcoming_reset_rail.test.tsx:91-106`
- 问题：用例名为「formats resetAt via format_reset_time (today / MM/DD), not relative_time」，但唯一断言是 `expect(screen.queryByText("刚刚")).not.toBeInTheDocument()`。这是反向断言——即使 `ur-reset` 字段渲染为空字符串或 `format_reset_time` 抛错被吞，测试也会通过。无法验证 spec #2「重置时间（`format_reset_time` 格式）」是否真的输出「今天 HH:MM」或「M/D HH:MM」。
- 建议：加正向断言。resetAt 设为「今天 14:30」时断言 `screen.getByText(/今天\s*14:30/)`；resetAt 设为「明天」跨日时断言 `screen.getByText(/^\d{1,2}\/\d{1,2}\s+14:30/)`。

### T005_test_f004 — PopupView 视觉快照与 packaged smoke 在本环境无法验证

- 严重度：low
- 位置：`tests/user_e2e/visual/popup_states.spec.ts`（Playwright + Electron GUI）；`tests/user_e2e/packaged/smoke.spec.ts`
- 问题：spec 验收 #6 要求「PopupView 视觉快照无回归」。该断言依赖 `pnpm test:visual`（Playwright visual project），需 Electron firstWindow + GUI 显示。当前 review 环境（headless）无法执行，本 agent 无法亲自验证「无回归」。代码层观察：装配是纯增量（overview-grid 被包进 overview-row，新增 Banner 在左、Rail 在右；既有 ProviderOverview 结构未改），视觉回归风险低。`popup_ready.png` / `popup_scroll_area.png` 快照含 `.scroll` 全页，若测试窗口宽度 ≥1024，会捕获到 rail；<1024 则捕获到 banner，需人工或 CI 确认快照通过。
- 建议：在 GUI / CI 环境运行 `pnpm test:visual`；若快照因新结构产生 diff，按预期更新 `popup_states.spec.ts-snapshots/`（确认非回归后）。

### T005_test_f005 — `@container (min-width:1024px)` 两档形态切换无单测覆盖

- 严重度：suggestion
- 位置：`src/renderer/styles/globals.css:367-401`（`.overview-row` + `@container` 规则）
- 问题：spec 验收 #2（≥1024 rail 显示）/ #3（<1024 banner 显示）的双形态显隐由 CSS 容器查询驱动，jsdom 不支持 `@container` 查询，单测层无法断言。组件本身（Rail/Banner）在 jsdom 中永远都会渲染 DOM 节点——真正的显隐切换只在 CSS 层，需 Playwright 视觉或人工验证。
- 建议：认可该限制（jsdom 天然约束）。补充手段：(a) 在 Playwright visual 用例中以不同 viewport 宽度触发 `@container`，分别快照两形态；(b) 或在 css 测试层（如若项目引入 css 单测）断言 `.overview-row > .upcoming-rail` 在容器查询下的 `display` 切换——目前项目无此基建，f005 仅作记录。

### T005_test_f006 — Rail 测试未显式断言 provider 图标渲染

- 严重度：suggestion
- 位置：`tests/unit/renderer/components/upcoming_reset_rail.test.tsx`（缺）；`src/renderer/components/UpcomingResetRow.tsx:33`（`<VendorMark id={item.provider} size={22} />`）
- 问题：spec #2 明确要求「provider 图标 + 账号/metric label」。Rail 测试只断言 metric label 文案（`screen.getByText("5 小时")`），未验证 `VendorMark` 是否以正确 `id` 渲染。若 VendorMark 接错 prop 或漏渲染，单测不报。
- 建议：补一例，断言 `container.querySelector('svg')` 或 VendorMark 对应 class 存在；或 mock `VendorMark` 后断言被以 `id="claude"` 调用。

## 结论

**通过，附 medium 级补测建议。**

单测层覆盖充分：本批新增 2 文件 10 用例（rail 6 + banner 4），叠加已合入的 `collect_upcoming_resets` 11 用例，共 21 用例全过；`pnpm test` 全 1369 用例全绿，既有 `popup_view`（25）/ `popup_view_height`（7）/ `popup_view_mirror`（2）/ `provider_overview`（1）均无回归。Rail/Banner 的渲染、空态、行点击回调、状态点 → 颜色映射、收起/展开、脱敏账号标签隐藏、`format_reset_time`（反向断言）均有覆盖，且与既有 `collapsible_card.test.tsx` / `provider_overview.test.tsx` 风格一致（`make_item` factory + RTL + userEvent）。

但 spec #4「滚动回顶」与 spec #6「PopupView 视觉快照无回归」两条验收在单测层无保险：`scrollTo` 行为（f001）与 PopupView 装配结构（f002）建议补 2 个轻量集成测试兜底；视觉快照与 `@container` 两档形态受 GUI/jsdom 环境天然限制（f004、f005），本 agent 无法亲自验证，需人工或 CI 上执行 `pnpm test:visual` 收尾。f003、f006 属可选增强。

综上：**单测层验收已达成，集成/视觉层需补测或人工签收后方可全票通过。**
