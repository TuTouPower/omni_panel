---
tid: "t408"
slug: "session_message_click_expand"
title: "用户消息底色突出与点击消息切换展开"
status: "done"
branch: "t408_session_message_click_expand"
worktree: ""
review_level: "single"
diff_anchor: "9066c819edff2647885bad38de6ee834f89f7974"
depends_on: ""
conflicts_with: "t407,t413,t419,t420,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- `PaneMessageRow`：删展开按钮；`on_body_click` 挂消息本体；`has_text_selection` / `is_interactive_target` / `overflows` 三重门控。
- 底色：`role===user` 铺 `primary-container`；`selected` 仅保留 class，不再单独铺同色（Agent 选中不再误带 user 底）。
- 单测：`PaneMessageRow.test.tsx` 改 t408 AC 组；`pnpm test` 3281 passed。

## Review 处置

### Round 1 (2026-08-16 03:51 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep t408` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001～008 均有单测/文档 diff 证据，见 `handoff.json` `ac_evidence`

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

- 去掉展开按钮，点消息本体切换折叠；用户消息 primary-container 底色；相关 spec/单测同步。
