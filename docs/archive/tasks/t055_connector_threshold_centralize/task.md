---
tid: t055
slug: connector_threshold_centralize
diff_anchor: "969afba3f7285832c7d7a6aa0dae49e2237382b9"
branch: t055_connector_threshold_centralize
---

# Task t055_connector_threshold_centralize

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 覆盖 review finding：P5 / I3(claude) / I4(firecrawl) / codex limit=null。
- 裁决：P5 ctx 共享 helper 集中化需架构改（sandbox 单文件 + ConnectorContext 扩展），标遗留另立 spike；本 task 修 3 连接器硬编码 bug（各内联 helper，与 deepseek/mimo/exa/tikhub/cpa 一致）。
- claude（I3）：`status:"normal"` -> `status_for_pct(utilization)`。
- firecrawl（I4）：base `status:"normal"` -> `status_for_ratio(used, limit)`。
- codex：`limit:null` + `status:"normal"` -> `status:"unknown"`。
- cpa to_pct 缺失（I5）归 t059（空响应处置），本 task 不动。

## Review 处置

### Round 1 (2026-07-23 17:30 UTC+8)

| finding_id     | severity  | status | rationale                                    | fix_ref                   |
| -------------- | --------- | ------ | -------------------------------------------- | ------------------------- |
| t055_test_f001 | important | 已修   | 阈值边界未锁（90/75、0.9/0.75 + limit<=0）   | claude/firecrawl 边界用例 |
| t055_test_f002 | important | 撤回   | P5 ctx 集中化标遗留，spec AC1 修订，前提失效 | spec AC1                  |
| t055_test_f003 | important | 撤回   | cpa I5 移 t059，spec AC4 修订，前提失效      | spec AC4                  |

### Round 2 (2026-07-23 17:45 UTC+8)

两轴均 PASS，零 finding，未进处置表。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t055` 查，不在此记。

### 验收标准勾选

- [x] P5 ctx 共享 helper 集中化标遗留（架构改另立 spike）；本 task 各连接器内联 helper。
- [x] claude/firecrawl status 按阈值，边界 90/75、0.9/0.75 闭区间覆盖。
- [x] codex limit=null → unknown。
- [x] cpa utilization 缺失（I5）移 t059。
- [x] 现有连接器测试全绿，无回归（黑盒 1557 passed）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：N/A（R1 已 PASS）
- Round 2 test：PASS

### 遗留

- P5 ctx 共享 helper 集中化（sandbox 单文件 + ConnectorContext 架构扩展）需另立 spike/task。

### 结果摘要

- claude/firecrawl/codex status 硬编码修复（各内联 helper），边界覆盖；P5 集中化遗留。
