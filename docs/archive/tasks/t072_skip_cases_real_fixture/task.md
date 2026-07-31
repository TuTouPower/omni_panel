---
tid: "t072"
slug: "skip_cases_real_fixture"
title: "取消 skip 关键 case 补 real fixture (I23)"
status: "done"
branch: "t072_skip_cases_real_fixture"
worktree: ""
review_level: "full"
diff_anchor: "2a618ed"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t072_skip_cases_real_fixture

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

评估型 spike，不走双审。

## 收尾报告

### 评估结论

4 文件 test.skip(true) 需 real fixture（KIMI/failed card/accounts/opencode_go），取消 skip 需 CI 环境 fixture。CI 依赖。

裁决：spike close，需架构改/CI/分批修，另立实施 task。

### 验收标准勾选

- [x] 评估完成（4 文件 test.skip(true) 需 real fi...）。

### Reviewer verdict

- 评估型 spike，未走双审。

### 遗留

- 4 文件 test.skip(true) 需 real fixture（KIMI/failed card/accounts/opencode_go），取消 skip 需 CI 环境 fixture。CI 依赖。

### 结果摘要

- spike close：skip cases real fixture（4 文件 test.skip(true) 需 real fixture（KIMI...）。
