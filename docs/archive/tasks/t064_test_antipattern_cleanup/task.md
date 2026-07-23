---
tid: t064
slug: test_antipattern_cleanup
diff_anchor: "8eaf189268a196a9c4678876668bfe9c955b2679"
branch: t064_test_antipattern_cleanup
---

# Task t064_test_antipattern_cleanup

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review_20260723_opus finding：I18-I23（重实现/重言式/死等/mock 污染/skip）

## Review 处置

### Round 1 (2026-07-23 21:10 UTC+8)

| finding_id      | severity  | status | rationale                                         | fix_ref                         |
| --------------- | --------- | ------ | ------------------------------------------------- | ------------------------------- |
| I18 deep_freeze | important | 已修   | 重实现生产函数 -> 导出 + import 生产              | runtime.ts export + test import |
| I20 tray_menu   | important | 已修   | 本地常量重言式 -> 删（source ?raw 验证已覆盖）    | tray_menu.test 删重言式用例     |
| I19 migration   | important | 遗留   | 手写 PRAGMA+ALTER，需 import 生产迁移入口（重构） | spike                           |
| I21 e2e 死等    | important | 遗留   | 断言刷新请求/spinner（e2e 重构）                  | spike                           |
| I22 setupFiles  | important | 遗留   | 拆 renderer-only（测试架构改）                    | spike                           |
| I23 skip case   | important | 遗留   | 取消 skip 需 real fixture（CI 环境）              | spike                           |

### Round 2 (2026-07-23 21:20 UTC+8)

两轴均 PASS（I18/I20 已修 + I19/I21/I22/I23 遗留裁决）。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t064` 查，不在此记。

### 验收标准勾选

- [x] I18 deep_freeze 测试 import 生产函数（非重实现）。
- [x] I20 tray_menu 删本地常量重言式（source ?raw 验证保留）。
- [x] I19/I21/I22/I23 标遗留（需测试架构改/real fixture/CI，另立 spike）。
- [x] `pnpm test` 全绿（1588 passed）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- I19（migration 测生产入口）/ I21（e2e 断言真实刷新）/ I22（setupFiles 拆分）/ I23（real fixture 取消 skip）需测试架构改 + CI，另立 spike。

### 结果摘要

- I18 deep_freeze export + import；I20 tray_menu 删重言式；4 项遗留另立 spike。
