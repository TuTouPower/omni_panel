---
tid: "t407"
slug: "session_pane_head_cwd_time"
title: "会话面板头部完整展示 cwd 与紧凑时间"
status: "done"
branch: "t407_session_pane_head_cwd_time"
worktree: ""
review_level: "single"
diff_anchor: "ede5702d78abe1f578334eeffebea12dd4125f4e"
depends_on: ""
conflicts_with: "t403,t405,t406,t408,t409,t410,t413,t415,t419,t420,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor_cmd：无
- 实现：`format_compact_datetime(ts, now?)`；SessionPane cwd 直渲 + shrink-0；时间用紧凑格式；session id/标题保留 truncate
- 会话库 SessionCard 仍用 last_dir_segment + format_precise_datetime（非范围）
- Round 1 FAIL：组件测试依赖真实年份；`pin_system_year_2026` + afterEach 还原时钟

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-16 03:40 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t407_gen_f001|important|已修|组件测试 pin_system_year_2026 + afterEach useRealTimers，与真实年份解耦|SessionPane.test.tsx:pin_system_year_2026|
|t407_gen_f002|minor|已修|上游 AC4 改为两行布局真实顺序 + 紧凑时间语义|session-pane-display-adjust.md AC4|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 由 SessionPane 组件测试与 format_compact_datetime 纯函数单测覆盖；AC-005 上游 spec AC2/AC4 已改写；AC-006 全量 pnpm test 绿。详见 handoff.json ac_evidence。

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS

### 结果摘要

- SessionPane 头部 cwd 完整展示 + 紧凑时间（MMDD/YYMMDD HH:mm）；截断优先级 id/标题先于 cwd/时间；上游 session-pane-display-adjust AC2/AC4 同步修订。
