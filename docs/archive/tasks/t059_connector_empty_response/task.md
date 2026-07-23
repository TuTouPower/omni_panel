---
tid: t059
slug: connector_empty_response
diff_anchor: "00e1f2167815e1e9b844bcf98582f34ba2715502"
branch: t059_connector_empty_response
---

# Task t059_connector_empty_response

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：P1 / I5(cpa) + mimo/minimax 空响应

## Review 处置

### Round 1 (2026-07-23 19:10 UTC+8)

| finding_id     | severity  | status | rationale                                            | fix_ref                       |
| -------------- | --------- | ------ | ---------------------------------------------------- | ----------------------------- |
| t059_test_f001 | important | 已修   | cpa 空响应无测试（post_json 500 -> failed_accounts） | cpa-connector.test.ts:100-109 |

### Round 2 (2026-07-23 19:25 UTC+8)

| finding_id     | severity | status | rationale                                  | fix_ref                   |
| -------------- | -------- | ------ | ------------------------------------------ | ------------------------- |
| t059_test_f002 | minor    | 已修   | `length > 0` 弱，改 toHaveLength(1) 精确锁 | cpa-connector.test.ts:107 |

code R1 PASS，test R1 f001 修 + R2 f002 修后 PASS。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t059` 查，不在此记。

### 验收标准勾选

- [x] cpa 上游非 2xx / 空 body -> report_failed_account（keys.length===0）。
- [x] mimo 空 usage items + 无 balance -> report_failed_account。
- [x] minimax model_remains 空/非数组 -> report_failed_account。
- [x] 合法零用量不误报（balance=0/models 非空全零不触发）。
- [x] 单测覆盖 cpa/mimo/minimax 空响应（failed_accounts 断言）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：N/A（R1 已 PASS）
- Round 2 test：PASS（f002 修后）

### 遗留

- 无。

### 结果摘要

- cpa/mimo/minimax 空响应改 report_failed_account（非静默 return []），测试守护。
