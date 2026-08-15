---
tid: "t406"
slug: "surface_token_unify"
title: "全窗口背景色回归 DESIGN 两级体系"
status: "done"
branch: "t406_surface_token_unify"
worktree: ""
review_level: "single"
diff_anchor: "e65b6ae7bc0c567fd047578a4d41602591a8d45f"
depends_on: ""
conflicts_with: "t403,t405,t407,t409,t410,t411,t412,t413,t415,t419,t420,t422,t423,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- 红：更新 SessionPane/Rail/Shell/Workspace/Library/Settings 断言至 surface-card/window；先失败再改实现。
- 绿：六处生产类名（SessionPane、SessionRail、SessionShell×2、Settings 侧栏、SessionCard 去 raised、SessionRow）。
- AC-003：`color-mix(window 70%, surface 8%)` 零残留；toast/dock 半透明与交互态 raised 保留。
- 黑盒：`pnpm test` 3273 passed；`pnpm typecheck` 通过；`MOCK_FIXTURE=synthetic pnpm test:e2e:web` 90 passed / 2 failed（p188/p189，与本 token 改无关）；t406 surface e2e 通过。
- review_level=single Round 1 PASS。

## Review 处置

### Round 1

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-005 标 [deploy] 人工目检）
- 证据：handoff `ac_evidence` 闭合 AC-001～006

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

会话/设置面板级底色回归 window/card 两级；raised 仅交互态；登记存量 e2e p188/p189。
