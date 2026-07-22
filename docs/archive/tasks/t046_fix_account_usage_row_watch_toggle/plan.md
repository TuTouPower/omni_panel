# Task plan

## 步骤与验证

1. 红：`AccountUsageRow` 组件测（或扩 usage_rows.test）——传 `on_toggle_watched`+`watched_labels` 渲染 bell、点击触发回调；不传则无 bell。 → 验证：失败。
2. 绿：`AccountUsageRow` props 加 `on_toggle_watched`/`watched_labels`，透传给 `UsageBarRow`（per `period.raw_label`）。 → 验证：组件测通过。
3. 绿：`ProviderCard.render_account_detail` 给 `AccountUsageRow` 传 watched/toggle；ProviderCard 从 PopupView 拿 watchedMetrics + on_toggle（对齐 UsageBarList 路径口径，按 account.id + provider）。 → 验证：typecheck。
4. 黑盒：`pnpm test` + typecheck/lint + Playwright 验证主面板 account 行 bell 渲染 + 点击持久化。 → 验证：通过。
5. 双审 + 收尾。

## 风险与回退

- 风险：ProviderCard 拿 watchedMetrics/toggle 的 props 链需补（PopupView → ProviderCard 现有 props 可能未传 watched）——读 ProviderCard props + PopupView 渲染补齐。
- 风险：两条 account period 路径（ProviderAccountList vs ProviderCard.AccountUsageRow）watched 维度不一致 → 统一按 accountKey + raw_label。
- 回退：revert AccountUsageRow/ProviderCard 改动。

## Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：主面板 account 数据标签行 bell（t043 补齐 ProviderCard 路径）。
