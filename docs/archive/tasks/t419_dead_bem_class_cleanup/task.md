---
tid: "t419"
slug: "dead_bem_class_cleanup"
title: "清理无定义 BEM 风死类名"
status: "done"
branch: "t419_dead_bem_class_cleanup"
worktree: ""
review_level: "single"
diff_anchor: "78f9c4c3c84a012423617049d4f8be7b288f427c"
depends_on: ""
conflicts_with: "t403,t404,t405,t406,t407,t408,t409,t410,t411,t413,t415,t420,t421,t422,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- preflight PASS；globals.css / index.html 无 `conversation-`/`session-`/`library-`/`selection-`/`preview-` 选择器定义
- 策略：className 中死 BEM token 剥离；测试正向挂钩同名迁 `data-testid`；拖拽态 `conversation-pane-dragging` / `drop-target` 改 `data-dragging` / `data-drop-target`（视觉仍靠 Tailwind `opacity-45` / `ring-*`）
- 空槽 `session-slot session-slot-empty` → `data-testid="session-slot-empty"`；占用槽 `data-testid="session-slot"`；清空按钮 `selection-tray-clear`
- 生产 `use-workspace-columns` scrollIntoView：`.session-cell[data-loc-key]` → `[data-testid="session-cell"][data-loc-key]`
- 有意保留（有定义或非 className 死挂钩）：无本前缀 CSS 定义类；`data-testid`/`session-section-*`/`session-login-*` 等既有 testid；裸状态类 `collapsed`/`expanded`/`selected`/`on`/`picked`/`active`（非五前缀）
- 仅缺席断言保留 `.conversation-foot` 等 class selector（查 null）
- 验证：`pnpm test` 3333 passed；相关 web e2e 30 passed；`pnpm typecheck` 绿；本 diff 路径 eslint 绿
- AC-004 [deploy] 预期零视觉差异，未做人工部署抽查

## Review 处置

### Round 1 (2026-08-16 05:53 UTC+8)

Round 1 零 finding，未进处置表。

### Round 2 (2026-08-16 05:55 UTC+8)

Round 2 零 finding（仅 specs 收尾致 scope 刷新），未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep t419` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-004 为 [deploy] 预期零视觉差，agent 无法自证，标 deploy）
- 证据：见 `handoff.json` `ac_evidence`

### Reviewer verdict

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

### 结果摘要

会话窗口 BEM 风死类名清零，测试/e2e 挂钩迁 data-testid；单测与相关 e2e 通过。
