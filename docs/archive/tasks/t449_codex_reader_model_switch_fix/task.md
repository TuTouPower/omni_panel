---
tid: "t449"
slug: "codex_reader_model_switch_fix"
title: "codex reader model 切换双计修复"
status: "done"
branch: "t449_codex_reader_model_switch_fix"
worktree: ""
review_level: "full"
diff_anchor: "6afd035dc7e500a85d313f012d3faaafd17382ec"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- attempt=1 execution_id=374dcec87c1049cea99e7f6de76343f2；diff_anchor=6afd035d。
- 根因：turn_context model 切换把差分基准 segment_prev_total/cache 置 null → 下个 token_count 按全量计入；codex total 实测文件级连续（116 文件 0 回绕含切换处）。
- 修复：差分基准文件级连续（变量改名 prev_total/prev_cache），model 切换仅更新归因标签 segment_model。
- 黑盒：真实 omni_game gpt-5.6-sol 文件 reader 输出 196196593（0.196B，vs 目标 196124034 差 0.04%），缓存率 98%。
- 全量 pnpm test 3489 passed；typecheck 0 err；lint 1 pre-existing（p215 store:899 非本 task）。
- review Round 1：code PASS（0 finding）+ test PASS（0 finding）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

### Round 1 (2026-09-04 20:55 UTC+8)

code review PASS（0 finding）；test review PASS（0 finding）。

### Round 2 (2026-09-04 20:56 UTC+8)

无 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 双 model fixture 断言 2000（旧实现 3000）；AC-002 真实文件黑盒 196196593；AC-003 既有 t445/t448 用例全绿。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- p216 codex reader model 切换双计修复：差分基准文件级连续；真实文件 392M→196M，缓存率 98%；review Round 1 双 PASS。
