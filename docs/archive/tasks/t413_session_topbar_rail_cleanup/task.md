---
tid: "t413"
slug: "session_topbar_rail_cleanup"
title: "删会话窗口顶部空带并恢复侧栏底部添加按钮"
status: "done"
branch: "t413_session_topbar_rail_cleanup"
worktree: ""
review_level: "single"
diff_anchor: "43cde52108cd8c5170a1ff26b7e5d05b09cf551e"
depends_on: ""
conflicts_with: "t406,t407,t408,t419,t420,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor_cmd：无
- 删除 `SessionShell` 的 `session-rail-toggle-row`；`rail_collapsed` 仍由 shell 持有，经 `on_rail_toggle` → `SessionRail.on_toggle_collapse`。
- `SessionRail` 恢复头部行（槽位计数 + «/»）与底部固定 `session-slot-add`（展开「+ 添加会话」/折叠「+」/满槽 disabled）；列表区 `session-rail-scroll` 独立滚动。
- 空槽仍可点选目标 index；底部按钮取首空槽——动作目标不同，保留双入口。
- 修订 `session-pane-display-adjust` AC7；同步 `workspace.md` / `surface_token_unify` / `specs_index`。
- e2e 布局：删 toggle-row 后 `grid.top≈topbar.bottom`；`grid` 与 `.session-rail` 外框同顶，`rail-scroll` 在 header 下。
- 闭环 p189（e2e 顶边差 ~33px 根因即 toggle-row 夹层）。

## Review 处置

### Round 1 场景说明

- Round 1 零 finding，未进处置表。

### Round 2 场景说明

- Round 2 零 finding（仅 e2e/文档补齐后重审），未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep t413` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001～007 见 `handoff.json` 的 `ac_evidence`（DOM 结构、折叠/添加行为、文档修订、测试绿）

### Reviewer verdict

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

### 结果摘要

会话壳删顶部空带、折叠钮入侧栏头部；侧栏底部固定添加会话（折叠为加号）；推翻并修订 AC7；e2e 布局与 p189 同步闭环。
