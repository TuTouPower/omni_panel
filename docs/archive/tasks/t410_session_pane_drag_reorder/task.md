---
tid: "t410"
slug: "session_pane_drag_reorder"
title: "会话面板按住 agent icon 拖拽换槽位"
status: "done"
branch: "t410_session_pane_drag_reorder"
worktree: ""
review_level: "full"
diff_anchor: "e33ed3a3616559238e039a124252ca0a2f6e72da"
depends_on: ""
conflicts_with: "t403,t405,t406,t407,t409,t411,t415,t419,t420,t422,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- 复用侧栏 HTML5 DnD 模式：`WorkspaceView` 持 `pane_drag_from` / `pane_drop_over`，落点调用既有 `move_slot_ui` → `move_slot`；`SessionPane` badge `draggable`，不改 `SessionRail`。
- 与侧栏 state 独立；不共享 MIME，避免改 rail 行为。
- jsdom 无完整 `dataTransfer`，生产路径对齐 rail（仅 `preventDefault` + 组件 state），不写 `effectAllowed`/`setData`。
- 清洁度：print/TODO 0。

## Review 处置

### Round 1 场景说明

- Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-006 `[deploy]` 人工）
- 证据：AC-001~005/007 单测；AC-006 手感人工

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

面板 agent icon HTML5 拖拽换槽，语义与侧栏 `move_slot_ui` 一致，含拖中/落点视觉与持久化。
