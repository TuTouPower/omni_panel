# Task report T026

本报告所在 commit 即 task commit，SHA 由 `git log --grep T026` 查，不在此记录。

## spec 验收标准勾选

- [x] MetricRecord 含可选 `error` 字段（schema parse 通过）。 - usageItemSchema 加 `error: z.string().optional()`；metric_record_error 2 用例绿。
- [x] PopupView accountErrors 从 MetricRecord.error 构建。 - `buildAccountErrors` 纯函数遍历 groups→accounts→periods，首个 period.error → Map account→AccountError。
- [x] ProviderAccountList 收到 accountErrors。 - PopupView `accountErrors={accountErrors}`，ProviderAccountList props 接收，传 ProviderAccountRow `error={accountErrors?.get(account.id)?.error}`。
- [x] `pnpm test` 全绿。 - 1425（1416+7 metric_record_error+provider_usage_account_error+2 metric_record compat+...）passed。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 2 项 / 遗留 0 项 / 无需修改 1 项
- T026_code_f001 — 不采纳：spec export requirement vs 间接覆盖足够，不增加 public API
- T026_test_f001/f002 — 采纳：补 multi-period 用例（首 period ok + 第二 period error → 提取），覆盖 buildAccountErrors break 分支

## 遗留问题

- 无。T026 data model + 透传就位；T027（UI indicator）+ T028（connector script pattern）后置。
