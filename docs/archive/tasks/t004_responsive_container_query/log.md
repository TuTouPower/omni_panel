# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

- 2026-07-20：T004 实施。改动：`window-manager.ts` `maxWidth` 780→1400；`globals.css` `.scroll-inner` 加 `container-type: inline-size` + `.popup-mirror .scroll-inner { container-type: normal }` 隔离 + 新增 `.overview-grid`（含 `align-items: start`）+ `@container` 1024px/640–1023px 断点；`ProviderOverview.tsx` 外层 `<>` fragment 改 `<div className="overview-grid">`；`drag-reorder.ts` `DragMidpoint` 加可选 `pointer_x/rect_left/rect_width`、`compute_drag_reorder` 加 `axis: "x"|"y"` 参数（默认 "y" 向后兼容）；`ProviderCard.tsx`/`ProviderOverview.tsx` `onDragStart/onDragOver` prop 签名加 `rect`/`clientX`；`PopupView.tsx` 加 `drag_rect` state、`handle_drag_over` 加 clientX + same_row axis 判定。
- 红/绿：`drag-reorder.test.ts` 加 4 用例（x-axis 水平 guard + 默认 y-axis 向后兼容）；`globals_css.test.ts` 加 5 用例（container-type/隔离/overview-grid/@container 断点/双列强制 + 1024 多列）。全量 `pnpm test` 1347 过；typecheck + lint 过。
- review：两 sub agent 并行（文档+代码 PASS / 测试 FAIL high）。adoption：采纳当场修 2 项（`.overview-grid` 加 `align-items: start`、AC-2 断言补全 1024 多列 `minmax(320px,1fr)` + 默认 `1fr` + align-items）；遗留 6 项。
- 偏离 plan：plan step 5 承诺的四档宽度视觉快照未补——`test:visual` 需 Playwright `resize` BrowserWindow + 跨平台基线生成，本 task 环境无法跑；adoption 标遗留，CSS 文本断言 + drag 单测覆盖规则与语义，真实布局靠 `test:packaged` 兜底（testing.md 允许此模式）。
- 后置 task 修订：T005 spec/plan 已写「按 T004 三层拓扑 `.overview-row` 外层包装」，T004 实施了 `.overview-grid` 网格化与 container 基础设施，`.overview-row` 外层留给 T005，T005 spec/plan 无需修订。
