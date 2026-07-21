# Task log

只记录有追溯价值的进展、踩坑、中途决策、偏离 plan 原因和关键验证结果；不写命令流水账。

## 记录

### 2026-07-20 实现 + 自测

- 前置 T004 已于 2026-07-20 合入（`0b5f27f`），`@container (min-width:1024px)` 拓扑与 `.scroll-inner { container-type: inline-size }` 就位。
- 本批落地：
    - `src/renderer/lib/provider-usage.ts` 的 `collect_upcoming_resets`（在 T004 同 commit 已完成,带 11 单测）。
    - 新组件 `UpcomingResetRow`（`src/renderer/components/UpcomingResetRow.tsx`）+ `UpcomingResetRail` + `UpcomingResetBanner`。
    - `PopupView` 装配：`overview-row` 外层包装,`useMemo` 派生 `upcomingItems`,`select_provider_from_upcoming` 回调切 tab + 回顶。
    - `globals.css` 新增 `.overview-row`、`.upcoming-rail`、`.upcoming-banner` 样式与 `@container (min-width:1024px)` 显隐切换。
    - 单测：`upcoming_reset_rail.test.tsx`（6 例）+ `upcoming_reset_banner.test.tsx`（4 例）。
- 黑盒：`pnpm test` 1369 全绿（既有 `popup_view` / `popup_view_height` / `popup_view_mirror` / `provider_overview` 无回归）。
- review：两 sub agent 各出 6 finding（共 12）,adoption 已处置。
- 偏离 plan：
    1. 把「行」显式抽成独立 `UpcomingResetRow` 组件。plan 步骤 3-4 仅描述 rail/banner 各自渲染行;独立组件避免双份渲染逻辑、便于后续单测定位。
    2. `UpcomingResetBanner` 空态不用 `CollapsibleCard`（直接 `<div className="card upcoming-banner">`）。原因:`CollapsibleCard` 强制 chevron 语义,空态出现误导性 chevron 与 spec 验收 #5「不渲染空容器」精神相悖;空态补 `aria-label="即将重置"` 保留卡片语义。
