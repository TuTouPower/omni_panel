---
tid: "t474"
slug: "launch_at_login_single_source"
title: "主进程状态单一来源：自启与暂停态（tray/CLI/control 同步）"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: ""
note: "合并原 t475（暂停态单一来源）"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 自启改为「以 config 为准、双向应用」：删除原「只补开启、不做反向关闭」的回退矛盾；config 为假时也关闭 OS 登录项（AC-004 重写）。依据 `index.ts:1162-1167` 与 `client.ts:230-240` 现状均不回写 config。
- Linux 本批能力明确不可用（`index.ts:1078` `hasLoginItemApi`、`client.ts:230-240`），不再作为未定产品问题留在未知契约清单。
- orchestrator 暂停态查询：查实**当前无**只读查询 API（`scheduler-orchestrator.ts:41-48` 只公开 `startAll/rebuild/reconcile/suspend/resume/shutdown`，`pauseReasons` 私有），明确为本 task 新增实现，不再标 `UNVERIFIED-BLOCKING`。
- 新增 AC-008（Web 自启由宿主执行、两端一致）、AC-009（无 API 平台返回能力不可用）；原 AC-001..007 编号保持不动，AC-008 由原 `[deploy]` 条目顺延为 AC-010。
- Web/CLI/tray 同一实际调度状态（AC-005/007 保留）。

调查路径：读 `index.ts:700-731,1047-1167`、`scheduler-orchestrator.ts`、`cli/client.ts:230-252`、d058。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 测试：待执行时填写
- 黑盒：待执行时填写
- review：待执行时填写
- AC 证据：见 `handoff.json`

### 结果摘要

- 待执行时填写；遗留只写引用，不复制正文
