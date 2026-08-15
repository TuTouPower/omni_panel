---
tid: "t415"
slug: "elevation_layering_unify"
title: "阴影与浮层层级回归 token 体系"
status: "done"
branch: "t415_elevation_layering_unify"
worktree: ""
review_level: "single"
diff_anchor: "105c26aa2c26c0e7b23187005c13ec7512398519"
depends_on: ""
conflicts_with: "t403,t404,t405,t406,t407,t409,t410,t412,t419,t420,t421,t422,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无
- 实现：`.dark` 翻转 `--shadow-window`/`--shadow-card`；`@utility logo-drop-shadow`；组件清零 `dark:shadow-` / 裸 z-10·20 / `shadow-[…]`·sm·lg；SelectionDock 实底去 blur；状态点光晕改 ring（避 elevation 字面量）。
- SessionPreview scrim 去 `backdrop-blur-[2px]`（AC-004 仅菜单/对话框）。
- 大纲抽屉原侧向 rgba 阴影改 `shadow-menu`（token 归位，观感 AC-005 目检）。
- 黑盒：`pnpm test` 3319 passed；typecheck 绿；designmd:check 绿。全仓 lint 存量 error 见 p190（本 diff 路径干净）。

## Review 处置

### Round 1 (2026-08-16 05:21 UTC+8)

Round 1 零 finding，未进处置表。

### Round 2 (2026-08-16 05:25 UTC+8)

Round 2 零 finding，未进处置表（收尾 spec 文档触发 scope 重审）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 源码扫描单测 + 变量翻转断言；AC-005 [deploy]；AC-006 全套绿。详见 handoff.json。

### Reviewer verdict

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

### 结果摘要

- 阴影/z/毛玻璃归位 token 体系；logo 投影沉淀 `@utility logo-drop-shadow`。
