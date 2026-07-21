# 已知待修问题

## e2e badge 展开按钮 timeout

- 现象：`account_error_badge.spec.ts` `getByRole("button", {name:"展开"})` within Kimi card timeout (10s)。Page snapshot 显示 Kimi card 有 `button "展开"` accessible name。
- 猜测：`filter({hasText:"Kimi"})` 匹配多个 cards、或展开按钮 accessible name 非 "展开"（aria-label 覆盖）。
- 根因未确认：需调试 Kimi card accessible name + 展开按钮 visibility/strict mode。
- 关联：T027 error badge e2e 完整通过依赖此修复。

## T029 connector 脚本 per-account error 改进

- 现状：`observation_to_metric_record` 已映射 `last_error → MetricRecord.error`（T028）。refresh-service 已记 stale observation `last_error`（L284）。但 connector 脚本多用 `throw`（整体 failed），不调 `ctx.report_failed_account(...)` per-account。
- 需改：connector 脚本 per-account catch → `ctx.report_failed_account(provider, account_id, account_label, error)` + continue（不 throw）。
- 工作量：中等，分 connector 迁移（CPA/KIMI 等）。
- 关联：T028 per-account error 数据源。当前只有 stale observation 有 last_error（整体失败后残留）；改进后实时 failed account 也有 error。
