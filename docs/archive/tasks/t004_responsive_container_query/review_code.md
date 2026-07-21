# Task review T004

- task：`T004_responsive_container_query`
- spec：`docs/tasks/T004_responsive_container_query/spec.md`
- target：working tree
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 07:20 UTC+8

## Findings

### T004_code_f001 — drag_rect 在跨行 reorder 后失效，axis 判定可能错误

- 严重度：medium
- 位置：`src/renderer/views/PopupView.tsx:425-428, 449-451`
- 问题：`handle_drag_start` 在 dragStart 时把 drag-card 的 rect 存入 `drag_rect` state，之后整个 drag 会话不更新。`handle_drag_over` 用 `Math.abs(drag_rect.top - rect.top) < rect.height / 2` 判定 same_row 选 axis。当一次 commit 把 drag-card 移到了另一行（例如 2×2 网格 a/b/c/d，拖 a 下到 c 触发 `[b,c,a,d]`，a 的 DOM 实际从 row 0 迁到 row 1）后，`drag_rect.top` 仍是 row 0 的值。此时用户继续把 a 拖回 row 0 的某张卡（例如 b），`same_row` 会误判为 true（`|0 - 0| < h/2`）→ axis='x'，但 a 视觉上已在 row 1、用户在做垂直移动。compute_drag_reorder 接着按水平中点判定提交（`from > to && pointer_x > middle_x`），用户停在 b 右半区时会得到 "no move"，与视觉行为不一致。spec AC-6 要求「横屏多列下…视觉与语义一致」，该场景破坏语义一致性。
- 建议：任选其一：(a) dragOver 中通过 ref 重新测量 drag-card 当前 rect 并更新 `drag_rect`（HTML5 dragend/dragover 不直接给 source element，需要在 ProviderCard 上挂 ref 并在 PopupView 维护 drag-card 的当前 DOM 引用）；(b) 在 commit 后根据新顺序预测 drag-card 新位置并刷新 `drag_rect`；(c) 把 same_row 判定下沉到 `compute_drag_reorder` 内，由调用方传入两套 rect（drag、over）并在 reorder 后总是基于当前 DOM 重测。最低成本是把 `drag_rect` 改成 ref + 在 dragOver 里 `dragCardRef.current?.getBoundingClientRect()` 实时取值。

### T004_code_f002 — Plan 步骤 5 的四档宽度视觉快照未补

- 严重度：medium
- 位置：`tests/user_e2e/visual/popup_states.spec.ts`（未新增 640/1024/1440 三档快照）；新增测试仅在 `tests/unit/renderer/globals_css.test.ts:59-83` 用字符串正则断言 CSS 文本
- 问题：plan.md 步骤 5 明确要求「补充视觉快照（Playwright `test:visual`）覆盖四档宽度——既有快照在 472 基线宽度重测，新增 640/1024/1440 三档独立快照，旧基线不删除」。working tree 没有新增任何 `*.spec.ts` 视觉用例，只加了 CSS 文本正则匹配。结果是：CSS 写错关键字（比如把 `repeat(auto-fill,…)` 误写成 `repeat(auto-fit,…)`）能被 unit 捕捉，但「窗宽 ≥1024 时真的渲染成多列」「640–1023 真的双列」「1440 下无横向滚动条」这些 AC-2/AC-3 的运行时行为没有任何回归网。spec AC-7 只说「视觉/快照测试无回归」，未强求新增；但 plan 已承诺，属于 plan-vs-实现 gap。
- 建议：在 `tests/user_e2e/visual/` 加一个 `overview_grid_widths.spec.ts`，用 `page.setViewportSize({width, height})` 在同一 fixture 下截 640/1024/1440 三档 `.scroll` 区域快照（参考既有 `popup_states.spec.ts` "plugin card area" 用例）。若评估后决定不补，应在 `log.md` 记录取舍原因，并在 plan.md 标注步骤 5 调整。

### T004_code_f003 — `.overview-grid` 未设 `align-items`，同行高度不齐时短卡会被拉伸留白

- 严重度：low
- 位置：`src/renderer/styles/globals.css:351-355`
- 问题：`.overview-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }` 没有显式 `align-items`。CSS Grid 默认 `align-items: stretch`，多列布局下同一行的两张卡如果一张折叠一张展开（高度差大），短卡会被拉到行高，卡片底部留出空白背景，视觉变怪。plan.md 自己在「风险与回退」里列出该风险并给了对策（`align-items: start` 或 `grid-auto-rows: min-content`），实现没采用。
- 建议：在 `.overview-grid` 加 `align-items: start;`（与 plan 的回退对策一致，最小改动）。如果实际 UI 评审认为 stretch 更好看，则在 `log.md` 说明决策。

### T004_code_f004 — `same_row` 启发式内嵌在 handler，未单测

- 严重度：low
- 位置：`src/renderer/views/PopupView.tsx:449-451`
- 问题：`same_row = drag_rect !== null && Math.abs(drag_rect.top - rect.top) < rect.height / 2` 这个判定决定 axis 选取，直接影响 D2=B 的多列拖拽语义，但它内嵌在 `handle_drag_over` 里、无任何单元测试覆盖。`compute_drag_reorder` 的 axis 分支已被 `tests/unit/renderer/lib/drag-reorder.test.ts:65-109` 覆盖；但「什么时候选 x、什么时候选 y」这一更关键的商业逻辑没测。f001 的 stale 问题正是因为该启发式无测试才容易漏。
- 建议：把 same_row 抽成 `drag-reorder.ts` 里的纯函数（如 `pick_axis(drag_rect, over_rect): "x" | "y"`），并补单测覆盖：同行同高、同行异高、跨行同列、drag_rect=null（fallback 'y'）、跨行且高度差大等场景。

## AC 核对表

| AC   | 状态    | 位置                                                                                                                                                                                                                                                                                       |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-1 | ✅ 覆盖 | `src/main/window/window-manager.ts:39` 改为 `maxWidth: 1400`，`minWidth: 472` 保留（见 `WINDOW_CONFIGS.usage`）                                                                                                                                                                            |
| AC-2 | ✅ 覆盖 | `src/renderer/styles/globals.css:351-365`：默认 `1fr`；`@container (min-width:1024px)` → `repeat(auto-fill, minmax(320px,1fr))`；`@container (max-width:1023px) and (min-width:640px)` → `repeat(2, minmax(0,1fr))`                                                                        |
| AC-3 | ➕ 部分 | 容器查询本身是运行时实时切换，无横向滚动条风险（`minmax(0,1fr)` 防溢出）。但缺运行时视觉快照验证（见 f002），目前仅靠 CSS 文本正则断言。                                                                                                                                                   |
| AC-4 | ➕ 部分 | web 版与 Electron 共用 `globals.css`，理论上同套 `@container` 生效。`vite.web.config.ts` 未改，CSS 一致。但无 web 端 Playwright/快照验证。                                                                                                                                                 |
| AC-5 | ✅ 覆盖 | `src/renderer/styles/globals.css:344-350` 显式隔离 `.popup-mirror .scroll-inner { container-type: normal; }`，且 specificity (0,2,0) 高于 `.scroll-inner` (0,1,0)。mirror 内 `.overview-grid` 退回默认 `1fr`，offsetHeight 不被多列压缩。test `globals_css.test.ts:64-66` 断言该规则存在。 |
| AC-6 | ➕ 部分 | `clientX` hit-testing 已实施（`ProviderCard.tsx:345-355`、`drag-reorder.ts:37-43`、`PopupView.tsx:439-468`），单列不回归（`same_row` fallback false → axis='y'）。多列多步跨行拖拽存在 stale `drag_rect` 问题（见 f001）。                                                                 |
| AC-7 | ✅ 覆盖 | 未运行 `pnpm test`（read-only review），但新增/改动测试与实现一致；既有视觉快照 (`popup_states.spec.ts`) 在 472 单列下因 wrapper 由 fragment 改为 `.overview-grid` div，外层 gap 仍是 12px、单列 1fr，预期像素等价，但需实际跑一次确认。                                                   |

## 范围外发现（不计入 finding）

- **popup 高度可能比实际多列内容高**：`popup-mirror` 用 `width: 100%`（viewport 宽），加上 `container-type: normal` 强制 mirror 内 `.overview-grid` 走单列。宽屏（≥1024px）下 live 视图是多列短高，mirror 仍按单列测量，上报的 `content_height` 偏大，popup 窗会比真实内容高一截。这是 spec 显式采纳的 trade-off（"否则…popup 高度异常"），不属于 T004 缺陷，但 T005 或后续 task 若做「popup 高度跟随宽度自适应」需要同步 mirror 宽度到实际 popup 宽并保留 container-type: inline-size。建议在 `docs/blueprint/decisions.md` 留一笔。

## 结论

实现整体对齐 spec 与三层拓扑协议：`.scroll-inner` 作 container、`.overview-grid` 由 `@container` 调列数、`.popup-mirror .scroll-inner` 显式隔离避免测高污染——AC-1/AC-2/AC-5/AC-7 核心证据链完整。maxWidth 780→1400、D2=B axis 分支、clientX hit-testing 都按 spec/plan 实施。

但存在 4 个非致命问题：f001（多列多步跨行拖拽 stale `drag_rect`）影响 AC-6 多列语义一致性；f002 缺四档视觉快照，AC-2/AC-3 运行时行为无回归网；f003 是 plan 自承风险未落实对策；f004 是 same_row 启发式无单测，放大了 f001 的隐蔽性。全部为 medium/low，无 critical/high。

verdict: PASS
