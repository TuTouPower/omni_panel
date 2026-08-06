---
tid: "t232"
slug: "split_workspace_view_files"
title: "拆分会话历史窗口超行数文件（工作台+会话库）"
status: "done"
branch: "t232_split_workspace_view_files"
worktree: ""
review_level: "single"
diff_anchor: "fa87837b03ec8f70e7d4dc72b662fefd755e6044"
depends_on: ""
conflicts_with: "t233,t234,t235,t237,t239"
schedule_status: "scheduled"
note: "merged from t241"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- 按功能拆分 `session-library.css` → 4 个子文件，`workspace.css` → 4 个子文件；修正 `session-library.css` 首行误输入的冒号与 `workspace-base.css` 结尾被截断的 `.session-rail` 块。
- `SessionLibrary.tsx` 拆出 `SessionCard.tsx`、`SessionRow.tsx`、`SessionList.tsx`、`SessionPreview.tsx`、`SelectionDock.tsx`、`AgentFilterChips.tsx` 与 `session-library-utils.ts`，主文件降至 400 行。
- `WorkspaceView.tsx` 拆出 `workspace-view-helpers.ts` 与 `use-workspace-columns.ts` 自定义 hook，主文件降至 398 行；保留选择/焦点/渲染逻辑在视图层。
- 验证：`pnpm lint`、`pnpm typecheck`、`pnpm test` 全绿；`NO_PROXY=127.0.0.1,localhost HTTP_PROXY= HTTPS_PROXY= MOCK_FIXTURE=synthetic pnpm test:e2e:web` 53 用例通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-06 18:15 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1 `wc -l` 全部 ≤ 400；AC2/AC3 由 `pnpm test`、`pnpm test:e2e:web`（53 passed）与人工抽查覆盖。

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

拆分完成，测试与 e2e 全绿。
