---
tid: "t186"
slug: "obs_store_prune_tiebreaker_account_row_test"
title: "observation-store prune tie-breaker 对齐 + AccountUsageRow observedAt 测试"
status: "done"
branch: "t186_obs_store_prune_tiebreaker_account_row_test"
worktree: ""
review_level: "single"
diff_anchor: "0801ff59ee86cda719899c60d60c01605c9ae70f"
depends_on: ""
conflicts_with: ""
note: "p016+p017"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-02)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`prune keeps the stale copy when original and copy share observed_at` 断言同 ts 下 prune 后 count=1 且保留 stale 副本（最新 timestamp 的 title/last_error）。
    - AC2：`AccountUsageRow observedAt relative-time path` 三分支（observedAt 非空取它、updatedAt 回退、两者皆空显示空），fake timers 锁定「30 分钟前」。
    - AC3：`same-key same-ts rows do not accumulate` 断言 count_observations()===2；实施时临时注释 delete_stale_dup 调用确认变红（4 行）后恢复。
    - 黑盒：typecheck / lint 零警告；全量 vitest 1992 passed。

### Reviewer verdict

`single`：

- Round 1 general：PASS（零 finding）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

observation-store prune_stmt 改 ROW_NUMBER 选每键最新行（observed_at DESC, stale DESC），与 latest 查询 tie-breaker 一致，消除同 ts 行不收敛；补 AccountUsageRow observedAt 测试 + count_observations 行数断言；p016/p017 闭环。
