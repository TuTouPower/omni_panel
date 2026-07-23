---
tid: t053
slug: fix_mimo_balance_threshold
diff_anchor: "b2969af6990a7e420423a77ec967d9497167d0fd"
branch: t053_fix_mimo_balance_threshold
---

# Task t053_fix_mimo_balance_threshold

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- review_20260723_opus C2：`connectors/mimo/connector.ts:160` 余额 status 方向反，需用 `status_for_balance`（反向）。

## Review 处置

### Round 1 (2026-07-23 17:00 UTC+8)

| finding_id     | severity  | status | rationale                                  | fix_ref            |
| -------------- | --------- | ------ | ------------------------------------------ | ------------------ |
| t053_test_f001 | important | 撤回   | mimo parse_limit 兜底 100，limit<=0 不可达 | connector.ts:41-44 |
| t053_test_f002 | important | 已修   | 边界 0.1/0.2 <= 语义未锁                   | test balance 10/20 |
| t053_test_f003 | minor     | 已修   | 余额 0.01 场景未覆盖                       | test balance 0.01  |

### Round 2 (2026-07-23 17:10 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t053` 查，不在此记。

### 验收标准勾选

- [x] balance/limit ≤0.1 critical / ≤0.2 warning / 否则 normal（limit<=0 防御分支，mimo parse_limit 兜底不可达）。
- [x] 0.01 / 充足 / 边界 0.1/0.2 断言正确（8 用例）。
- [x] 现有 mimo 测试全绿 + 新增阈值边界测试通过。
- [x] 不引入 usage items status 回归（status_for_usage 未动）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：N/A（R1 已 PASS）
- Round 2 test：PASS

### 遗留

- 无。

### 结果摘要

- mimo balance status 改用 status_for_balance（反向），修复 C2 阈值方向 bug。
