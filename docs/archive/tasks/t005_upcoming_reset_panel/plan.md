# Task plan

## 步骤与验证

1. 红测：`tests/` 下为 `collect_upcoming_resets` 写单元测试，覆盖：空输入、`resetAt=null` 跳过、`resetAt>now+horizon` 过滤、**`resetAt=now` 跳过（已重置）**、**`resetAt=now+horizon` 收（闭区间右端）**、**`resetAt<now` 跳过**、按 `resetAt` 升序、同账号多 metric 全收、`ratio` 型 percent 归一。 → 验证：`pnpm test` 该用例红。
2. `provider-usage.ts` 实现 `collect_upcoming_resets(groups, horizonMs = 7*24*3600*1000, now)`；`now` 作入参（默认 `Date.now()`，测试注入）；percent 口径见 spec 范围。 → 验证：单测转绿。
3. 新增 `UpcomingResetRail.tsx`：sticky 右栏，props = `{ items, onSelectProvider }`；行复用 `VendorMark` + `.dot` 状态点 + **`format_reset_time`**（**禁用 `relative_time`**，其未来时间返回「刚刚」）。 → 验证：组件单测渲染快照。
4. 新增 `UpcomingResetBanner.tsx`：基于 `CollapsibleCard`，展开/收起 chevron 旋转，props 同上。 → 验证：组件单测展开态/收起态。
5. `PopupView.tsx` 装配：从 **`providerGroups`**（PopupView 内 `useMemo` 派生自 `plugins`，`PopupView.tsx:251`，**不是** `use_plugins` 直接返回）算 `upcomingItems`；按 T004 三层拓扑，`@container ≥1024` 时**包 `.overview-row` 外层**并在第二列渲染 rail、`<1024` 时在 `.overview-grid` 上方渲染 banner；行 `onClick` 调 `setActiveTab(provider)`。 → 验证：472/1024 两档宽度形态切换正确。
6. 黑盒：`pnpm test`（含 `test:visual`）四档宽度预警形态；web 版 `pnpm build:web` 验证。 → 验证：全绿。

## 风险与回退

- 风险：`collect_upcoming_resets` 在多账号/多 metric 下数据量膨胀，rail 撑高超过视口。
    - 回退：rail 内部 `max-height: calc(100vh - …)` + 独立滚动；行数 >20 时仅显示前 20 +「查看全部」折叠。
- 风险：横屏右栏挤占 overview 网格宽度，导致卡片降到 1 列。
    - 回退：`.overview-row` 用 `minmax(0,1fr) 264px`，rail 固定 264px 第二列，overview 占 `1fr`；若 <1024 容器宽不够则切 banner。
- 风险：脱敏态下账号 label 隐藏后行可读性差。
    - 回退：脱敏时 label 用「账号 1/账号 2」序号占位，与 `ProviderAccountRow` 现有脱敏策略对齐。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：数据流段落补「reset 聚合消费支路」+ `.overview-row` 拓扑落地说明。
- `docs/blueprint/domain.md`：补「即将重置」术语定义与 horizon 约定。
- `docs/specs/<upcoming-slug>.md`：累积实现与验收（本 task 黑盒通过后）。
