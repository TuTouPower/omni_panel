---
tid: "t405"
slug: "session_pane_footer_remove"
title: "移除会话面板 footer 槽位/消息计数条"
status: "done"
branch: "t405_session_pane_footer_remove"
worktree: ""
review_level: "single"
diff_anchor: "e88b63ea225045df4c70bea36351bca5aa3f4423"
depends_on: ""
conflicts_with: "t403,t406,t407,t409,t410,t411,t415,t419,t420,t422,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

doctor：无。

- 移除 `SessionPane` footer（`.conversation-foot`）、`counts`/`message_counts` 调用与 `slot_index` prop；`WorkspaceView` 不再传 `slot_index`。
- 旧脚部正例改为 AC-001/002 不存在断言；`session_typography` 仅去 `slot_index` 键。
- `message_counts`（`pane.ts`）保留，符合非范围。
- worktree 缺 `src/generated/build-info.ts`，`mkdir` 后 `npx tsx scripts/gen-build-info.ts`（gitignore，不入库）。
- 验证：`pnpm test` 3272 passed；`pnpm typecheck` 通过。

## Review 处置

Round 1 零 finding，未进处置表。

Round 2 零 finding，未进处置表（收尾文档触发 scope 重审，代码未变）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 由 `SessionPane.test.tsx` 断言 footer 不存在；AC-003 去 `slot_index` + `pnpm typecheck`；见 `handoff.json` `ac_evidence`

### Reviewer verdict

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

### 结果摘要

- SessionPane 去掉 footer 与 `slot_index`；WorkspaceView 不再传参；相关单测与 workspace spec 已同步
