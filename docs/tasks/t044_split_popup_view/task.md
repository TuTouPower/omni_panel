---
tid: t044
slug: split_popup_view
diff_anchor: "<SHA>"
branch: t044_split_popup_view
---

# Task t044_split_popup_view

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 来源：t043 `t043_code_f001` 遗留（PopupView 954 行超膨胀标准，跨 task 慢性累积）。本 task 纯重构降体量，行为零回归。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格。

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] PopupView.tsx 行数显著下降。
- [ ] 抽出 hook/组件有单测。
- [ ] `pnpm test` 全绿；typecheck/lint 干净。
- [ ] 行为零回归。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- {一句话}
