---
tid: "t436"
slug: "filter_session_user_envelopes"
title: "过滤会话 user 文本中的注入信封"
status: "done"
branch: "t436_filter_session_user_envelopes"
worktree: ""
review_level: "full"
diff_anchor: "6f5843180e701266a9accfe363b7a6730932eb7e"
depends_on: ""
conflicts_with: ""
note: "来源 p203：四端提取器把框架信封当作用户气泡；Claude/Kimi 用量标题走同一归一"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 开干：doctor 无；preflight PASS / --require-verified PASS；worktree `../omni_panel_t436` 软链主仓 `node_modules`；identity attempt=1 execution_id=6ac87fa0f1cd41fc9b7f1c8db28ec155。
- 实现：共享 `normalize_user_display_text`；四端 extractor user 路径与 Claude/Kimi reader 标题接入；opencode first_user SQL 改 LIMIT 50 以跳过信封行。
- R1 code finding f001：空 user_query fallthrough 泄漏标签 → 分路径 keep:false；补单测。
- 黑盒：`pnpm typecheck` + `pnpm test` 3381 passed。
- 收尾：domain / session-history-window / kimi-session-history-extractor / d017 / specs_index；p203 归档。

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

### Round 1 (2026-08-23 01:57 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t436_code_f001|important|已修|空 user_query 与「无标签」分路径；有标签且 inner 全空 → keep:false，禁止 fallthrough 泄漏标签|normalize_user_text.ts + normalize_user_text.test.ts|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001～007 均在 `handoff.json` `ac_evidence`；四端 envelopes fixture + title 单测 + 空 user_query 回归

### Reviewer verdict

`full`：

- Round 1 code：FAIL（t436_code_f001）
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- 共享归一过滤四端 user 信封；Claude/Kimi 用量标题同源；p203 已归档。
