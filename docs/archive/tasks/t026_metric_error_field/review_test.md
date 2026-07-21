# Task review T026

- task：`T026_metric_error_field`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 22:50 UTC+8

## Findings

### T026_test_f001 — test name "captures first error per account only" does not test multi-period scenario

- 严重度：medium
- 位置：`tests/unit/provider_usage_account_error.test.ts:154`
- 问题：用例名为"captures first error per account only"，暗示验证一个 account 有多个 period 时只取首个 error。但测试数据每个 account 仅含一个 period（acc1 一个 error period，acc2 一个 error period），实际测的是"多个 account 各有 error"，并非"同一 account 多 period 取首个"。`buildAccountErrors` 内 `break`（provider-usage.ts:326）在单 period 场景无实际效果，该 break 分支行为未被覆盖。
- 建议：新增一个用例：同一 accountId 有两个 period（第一个带 error，第二个不带；或两个都带 error），验证只取第一个 period 的 error 且 `break` 生效。需扩展 `make_group` 辅助函数支持多 period per account。

### T026_test_f002 — 未测试 account 有多 period、首 period 无 error 而次 period 有 error

- 严重度：medium
- 位置：`src/renderer/lib/provider-usage.ts:319-326`
- 问题：`buildAccountErrors` 遍历 `account.periods` 并在首个命中 error 后 break。若 account 有 3 个 period（five_hour 正常、seven_day 正常、monthly error），当前实现会跳过前两个正常 period，正确捕获第三个 error。但无测试验证此路径。若 future refactor 改为只检查 `periods[0]`，该场景会静默丢失 error 而无测试回归。
- 建议：补充用例覆盖"首 period 无 error、后续 period 有 error"场景。

## 结论

**Spec 验收核对**：

| #   | 验收标准                                              | 结论                                                                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | MetricRecord 含可选 `error` 字段（schema parse 通过） | 通过。`plugin-output.ts:69` 定义 `error: z.string().optional()`；`metric_record_error` 2 用例验证有/无 error 均 parse 成功，断言 schema 行为正确。                                                                                                                            |
| 2   | PopupView accountErrors 从 MetricRecord.error 构建    | 通过。`PopupView.tsx:314` 调用 `buildAccountErrors(providerGroups)`，函数从 `account.periods[].error` 提取。5 用例覆盖提取、空、跨 group、空 groups。                                                                                                                         |
| 3   | ProviderAccountList 收到 accountErrors                | 通过。`PopupView.tsx:798` 传 `accountErrors={accountErrors}`；`ProviderAccountList.tsx:76,111` 传 `error={accountErrors?.get(account.id)?.error}` 给 ProviderAccountRow；`ProviderAccountRow.tsx:30` 接收 `error?: string`，`line:47-49` `void _error`（T027 后置，不渲染）。 |
| 4   | `pnpm test` 全绿                                      | 通过。7/7 tests passed（2 metric_record_error + 5 provider_usage_account_error）。                                                                                                                                                                                            |
| 5   | `pnpm typecheck` 过                                   | 通过（task owner 已验证）。                                                                                                                                                                                                                                                   |

**测试质量评估**：7 用例覆盖了主要 happy path 和边界（空 groups、无 error、跨 provider）。主要缺口在 multi-period per account 的"首个 error"策略验证（见 f001/f002），属于测试覆盖 gap 而非功能 bug。整体判断：**通过，建议补充 f001/f002 用例**。
