# Task spec

## 背景

t043 把「监控即将重置」开关改为 metric 级（`upcomingResetWatched`），bell 渲染在数据标签行。但实现只接了 `PopupView → ProviderAccountList → ProviderAccountRow → UsageBarList → UsageBarRow` 一条链（`on_toggle_watched`/`watched` 透传），**漏了 `ProviderCard → AccountUsageRow → UsageBarRow` 这条链**。

主面板总览页的 provider 卡片，account 详情（`render_account_detail`）用 `AccountUsageRow` 渲染 account + period，但 `AccountUsageRow`（`UsageRows.tsx:150`）props 无 `on_toggle_watched`/`watched_labels`，调用 `UsageBarRow` 时也没传 → bell 永不渲染（`UsageBarRow:124 {on_toggle_watched && ...}`）。结果：用户在主面板 account 数据标签行看不到监控 bell。

## 范围

- `AccountUsageRow`（UsageRows.tsx）：
    - props 加 `on_toggle_watched?: (raw_label: string) => void` 与 `watched_labels?: ReadonlySet<string>`（或等价）。
    - 渲染 period 时给 `UsageBarRow` 传 `watched={watched_labels?.has(period.raw_label) ?? false}` 与 `on_toggle_watched={on_toggle_watched ? () => on_toggle_watched(period.raw_label) : undefined}`。
- `ProviderCard.render_account_detail`（ProviderCard.tsx:315-332）：给 `AccountUsageRow` 传 `on_toggle_watched` + `watched_labels`（按 account.id + provider 维度，与 `UsageBarList` 路径同口径）。
- ProviderCard 需从上层拿到 watchedMetrics + toggle 回调（props 透传，对齐 PopupView → ProviderCard 已有的 watched/on_toggle 链或补齐）。

## 非范围

- 不改 `UsageBarList`/`ProviderAccountRow`/`ProviderAccountList` 链（已正确）。
- 不改数据层（config/collect/upcomingResetWatched 已定）。
- 不改 bell 视觉/交互语义。

## 验收标准

- [ ] 主面板 provider 卡片 account 详情，每条数据标签行右侧显示 bell（默认关 opacity 0.35）。
- [ ] 点击 bell 持久化 `upcomingResetWatched`（add/remove_watched_metric + save），刷新后状态保留。
- [ ] account 维度对齐（accountKey/raw_label 与 collect 一致）。
- [ ] AccountUsageRow 单测：传 on_toggle_watched + watched_labels 时渲染 bell，点击触发回调（参考 use_dnd_handlers.test 风格或既有组件测）。
- [ ] `pnpm test` 全绿；typecheck/lint 干净。

## 依赖与约束

- t043 数据层（upcomingResetWatched / add_watched_metric / remove_watched_metric / collect watchedMetrics）已就绪。
- `accountKey()` 维度对齐（UsageBarList 路径已验证）。
