---
tid: t058
slug: fix_chart_tooltip_xss
diff_anchor: "67bdb00fc7c22f950947a1a57feba7ef4e68dbe2"
branch: t058_fix_chart_tooltip_xss
---

# Task t058_fix_chart_tooltip_xss

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：I10(BarChart) / I11(MetricDonut)

## Review 处置

### Round 1 (2026-07-23 18:40 UTC+8)

| finding_id     | severity  | status | rationale                                   | fix_ref                                         |
| -------------- | --------- | ------ | ------------------------------------------- | ----------------------------------------------- |
| t058_test_f001 | important | 已修   | formatter 输出无测试，提取纯函数 + XSS 用例 | build_bar/donut_tooltip_html + tooltip_xss.test |

### Round 2 (2026-07-23 18:55 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t058` 查，不在此记。

### 验收标准勾选

- [x] BarChart/MetricDonut 所有动态字段经 escapeHtml（label/seriesName/otherDetails key/donut name）。
- [x] 单测覆盖 escapeHtml 输入（chart-data.test）+ formatter 输出无未转义 `<`（tooltip_xss.test 6 用例）。
- [x] 提取 build_bar/donut_tooltip_html 纯函数供测。
- [x] 现有图表测试无回归（黑盒 1569 passed）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：N/A（R1 已 PASS）
- Round 2 test：PASS

### 遗留

- 无。

### 结果摘要

- BarChart/MetricDonut tooltip XSS 修复（escapeHtml），提取纯函数 + 6 用例验证。
