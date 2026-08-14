---
tid: "t343"
slug: "observation_retention"
title: "observation 留存策略接入 prune + cacheMaxMb"
status: "done"
branch: "t343_observation_retention"
worktree: ""
review_level: "full"
diff_anchor: "26c2a611ec87d7dbddfdb567e2abe46717a9080b"
depends_on: ""
conflicts_with: ""
note: "review_intensive: 表无界增长"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实现要点：

- observation-retention.ts：retention_params（90d 日期阈值 + cacheMaxMb 折算行数预算）、run_retention_prune（prune + 超预算按天收紧）、create_retention_scheduler（启动即清 + 24h 定时，可注入）。
- main/index.ts：orchestrator.startAll 后接入 create_retention_scheduler，get_cache_max_mb 读 currentConfigSnapshot（config 保存后更新）；before-quit stop。
- reviewer 指出读 currentConfig 快照（运行时改设置不生效）→ 改读 currentConfigSnapshot。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-13 17:15 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                   | fix_ref                                             |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| t343_code_f001 | important | 已修   | retention 改读 currentConfigSnapshot.cacheMaxMb（config 保存后更新），运行时调设置立即生效                  | index.ts:990-1000                                   |
| t343_code_f002 | minor     | 遗留   | cacheMaxMb=0 schema 矛盾（pre-existing），登记 follow-up                                                    | p158                                                |
| t343_code_f003 | minor     | 遗留   | 收紧循环空窗口 break，登记 follow-up                                                                        | p159                                                |
| t343_test_f001 | important | 已修   | 接线提取 create_retention_scheduler 可注入模块 + 4 例集成测试（start 立即执行/24h 周期/stop 清理/异常吞并） | observation-retention.ts:104-160, retention.test.ts |
| t343_test_f002 | minor     | 遗留   | 收紧循环 break 分支缺测试，登记 follow-up                                                                   | p159                                                |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important 已修、f002/f003 minor 遗留）
- Round 1 test：FAIL（f001 important 已修、f002 minor 遗留）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- observation 留存策略接入：prune 生产调用方（启动 + 每日 24h 定时，create_retention_scheduler 可注入）、cacheMaxMb 动态读取影响预算。Round 2 双路 PASS。顺手发现 p158（cacheMaxMb=0 schema 矛盾）、p159（收紧循环空窗口 break）登记 pending。
