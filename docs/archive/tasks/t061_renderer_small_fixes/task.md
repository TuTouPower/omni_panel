---
tid: t061
slug: renderer_small_fixes
diff_anchor: "cac13374793b0b2a3f0c5a5a7f69ac9e9fb7e4e3"
branch: t061_renderer_small_fixes
---

# Task t061_renderer_small_fixes

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：I12(AccountRow unknown) / I13(SettingsForm 未 catch)

## Review 处置

### Round 1 (2026-07-23 20:10 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t061` 查，不在此记。

### 验收标准勾选

- [x] AccountRow unknown 显示「未连接」（非「正常」）。
- [x] SettingsForm onSave 链补 .catch，错误显示（role=alert）。
- [x] 单测覆盖 AccountRow unknown + SettingsForm onSave reject。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无（ad-error CSS class 未定义，功能不受影响，spec 未要求样式）。

### 结果摘要

- AccountRow unknown -> 未连接；SettingsForm onSave catch + 错误显示。
