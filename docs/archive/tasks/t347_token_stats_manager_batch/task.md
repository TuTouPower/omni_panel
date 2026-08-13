---
tid: "t347"
slug: "token_stats_manager_batch"
title: "token-stats manager 批处理健壮性"
status: "done"
branch: "t347_token_stats_manager_batch"
worktree: ""
review_level: "full"
diff_anchor: "4d73052c2bc07165a3393d872324c4f269e59cd8"
depends_on: ""
conflicts_with: ""
note: "review_intensive: buckets 重建/熔断/批失败"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实现要点：
- AC-001：upsert_sessions 加 rebuild_buckets 参数，manager 分批仅末批 true；reviewer f001 指出末批空数据早退丢重建 → 早退条件加 `&& !rebuild_buckets`。
- AC-002：单批 DB 失败不 return 中断，catch 后统一推进 offset，最后仍 on_update。
- AC-003：update_config child null 时重新 start（清 restart_timer 防旧 config 回退）。
- AC-004：same_config 改 sort_keys 递归序无关。
- review 2 轮：f001/f002 important（末批重建回归、timer 回退）修复；test f001-f003 minor 遗留登记 p168。

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

### Round 1 (2026-08-13 21:25 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t347_code_f001 | important | 已修 | store 早退条件加 `&& !rebuild_buckets`，空数据 + true 仍重建（末批空数据不丢重建） | token-stats-store.ts |
| t347_code_f002 | important | 已修 | update_config else 分支 start 前清 restart_timer（防旧 config 回退） | manager.ts |
| t347_code_f003 | minor | 已修 | 补两场景回归测试：store 空数据+true 重建、manager 非熔断窗口清 timer | 两测试文件 |
| t347_test_f001 | minor | 遗留 | AC-001 多批末批 rebuild_buckets=true 未断言（批次测试已覆盖，末批 true 隐含） | — |
| t347_test_f002 | minor | 遗留 | AC-003 测试 fake timers 缺 try/finally 隔离 | — |
| t347_test_f003 | minor | 遗留 | AC-003「状态可区分」子句不可观察 | — |

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

- Round 1 code：FAIL（f001/f002 important 已修、f003 minor 已修）
- Round 1 test：PASS（f001/f002/f003 minor 遗留）
- Round 2 code：PASS

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- token-stats manager 批处理 4 处修复：buckets 重建推迟到最后一批（AC-001）、单批失败继续（AC-002）、熔断恢复路径（AC-003）、same_config 序无关（AC-004）。Round 2 code + Round 1 test 双 PASS。顺手发现 p168（测试精化）登记 pending。
