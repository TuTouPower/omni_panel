---
tid: "t346"
slug: "collector_unbounded"
title: "collector 内存/IO 无界"
status: "done"
branch: "t346_collector_unbounded"
worktree: ""
review_level: "single"
diff_anchor: "9145fcbd87600de80b34a62fcca9e51fafd10b75"
depends_on: ""
conflicts_with: ""
note: "review_intensive: emitted_record_keys/scan-state"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

实现要点：
- AC-001：emitted_record_keys Set → Map<key, added_ts>，EMITTED_WINDOW_MS=30d，prune_emitted 每轮裁剪（内存有界）。
- AC-002：save_state 仅在有变化时调用（has_changes = 数据/截断非空；reviewer 指出 status!=="ok" 分支使永久不可用 source 每轮触发保存，已删）。
- review 2 轮：f001/f002 important（窗口权衡、unavailable 过触发）修复；f003/f004 minor（prune 时序、AC-001 定量测试）遗留/部分修。

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

### Round 1 (2026-08-13 20:40 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t346_gen_f001 | important | 已修 | 窗口延长到 30 天（活跃会话重发概率压到罕见场景，spec 已接受裁剪权衡），登记 p166 说明 | collector.ts |
| t346_gen_f002 | important | 已修 | 删 has_changes 的 status!=="ok" 分支——失败/不可用不改 state map，永久不可用 source 不再每轮触发保存（违背 AC-002） | collector.ts |
| t346_gen_f003 | minor | 遗留 | prune 时序（去重循环后执行，边界 key 延迟一轮），登记 p167 | p167 |
| t346_gen_f004 | minor | 已修 | 补 AC-002 unavailable 不触发保存测试 | collector.test.ts |

### Round 2 (2026-08-13 20:45 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t346_gen_f005 | minor | 已修 | spec 风险段同步 30 天窗口 + 残余风险说明（p166） | spec.md:87 |

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

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：FAIL（f001/f002 important 已修、f003 minor 遗留、f004 minor 已修）
- Round 2 general：PASS（f005 minor 已修）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- collector 两处无界增长修复：emitted_record_keys 改时间戳 Map + 30 天窗口裁剪（AC-001）、scan-state 无变化跳过保存（AC-002）。Round 2 general PASS。顺手发现 p166/p167（活跃会话重发权衡、prune 时序）登记 pending。
