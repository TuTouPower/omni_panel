# 已知待修问题

## T029 connector 脚本 per-account error 改进

- 现状：`observation_to_metric_record` 已映射 `last_error`（T028）。refresh-service 已记 stale `last_error`。但 connector 脚本多用 `throw`（整体 failed），不调 `ctx.report_failed_account(...)` per-account。
- 需改：connector 脚本 per-account catch → `ctx.report_failed_account(provider, account_id, account_label, error)` + continue。
- 工作量：中等，分 connector 迁移。
- 关联 task：t084（connector per-account error 迁移）。
- t059 已对 cpa/mimo/minimax 空响应加 report_failed_account；本条扩展到 per-account catch（多账号 connector 如 CPA 逐 auth_file）。
