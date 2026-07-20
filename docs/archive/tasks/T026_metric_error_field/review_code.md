# Task review T026

- task：`T026_metric_error_field`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 22:50 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T026_code_f001 — spec 要求 export usageItemSchema 但未导出

- 严重度：low
- 位置：`src/shared/schemas/plugin-output.ts:31`
- 问题：spec 写明"export usageItemSchema（单测用）"，但实际未 export。当前单测 `metric_record_error.test.ts` 通过 `pluginResultSchema.parse()` 间接验证，功能正确。若后续需要独立测 usageItemSchema（不带 pluginSuccessOutput 外层），将缺少直接入口。
- 建议：按 spec 加 `export` 前缀。或在 spec 中注明通过 pluginResultSchema 间接覆盖即可，保持现状。

## 结论

透传链完整无断裂：`MetricRecord.error`（schema optional string）→ `to_period.error`（ProviderUsagePeriod）→ `buildAccountErrors`（首个 period.error → Map）→ `PopupView.accountErrors`（useMemo）→ `ProviderAccountList.accountErrors`（props）→ `ProviderAccountRow.error`（解构 `error: _error` + `void _error`，不改 UI）。

buildAccountErrors 逻辑正确：遍历 groups→accounts→periods，首个 error 即 break，合理（单 account 多 period 时取主要 error）。AccountError 类型字段完整（provider, accountLabel, error）。

非范围项全部守住：ProviderAccountRow UI 不变、observation_status 不变、connector scripts 不变。

7 个单测覆盖关键路径（schema parse 2 + buildAccountErrors 5）。typecheck 和 vitest 全绿。

仅 1 个 low severity finding（spec 要求 export 未完全遵循，功能无影响）。总体判断：**通过**。
