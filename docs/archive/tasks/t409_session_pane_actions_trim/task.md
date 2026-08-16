---
tid: "t409"
slug: "session_pane_actions_trim"
title: "删除会话面板全选/清空/聚焦三按钮及功能"
status: "done"
branch: "t409_session_pane_actions_trim"
worktree: ""
review_level: "single"
diff_anchor: "e9b953f2563378b97cd90781a953c121c23b9746"
depends_on: ""
conflicts_with: "t403,t405,t406,t407,t410,t411,t415,t419,t420,t422,t424"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

doctor：无。

删除 SessionPane 头部三按钮（全选可见/清空选择/聚焦此面板）及 props；WorkspaceView 删除 focused_index、select_all_in_column/clear_selection_in_column、1-8/[ ] 聚焦快捷键；Esc 仅关大纲。

测试：删聚焦相关用例；全选/清空改走 checkbox；补 AC-001 三按钮不存在、AC-003 关闭面板点击、1-8/[ ] 不触发聚焦。

Round 1 review FAIL：f001 补关闭面板点击用例；f002 改 SessionPane 旧 AC5 标题。

## Review 处置

### Round 1 (2026-08-16 04:01 UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t409_gen_f001|important|已修|补点击「关闭面板」移除槽位/退订用例|WorkspaceView.test.tsx AC-003|
|t409_gen_f002|minor|已修|旧 AC5 标题改为描述性文本，去掉混杂编号|SessionPane.test.tsx|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/003 组件测试断言三按钮不在且关闭可点；AC-002 typecheck + grep 清零；AC-004 checkbox/托盘用例；AC-005 全量测试绿。详见 `handoff.json`。

### Reviewer verdict

`single`：

- Round 1 general：FAIL
- Round 2 general：PASS

### 结果摘要

- 会话面板头部全选/清空/聚焦三按钮及聚焦状态/快捷键彻底删除；大纲/关闭与逐条 checkbox 摘选保留。
