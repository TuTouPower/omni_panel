---
tid: "t476"
slug: "session_history_query_shared"
title: "查询逻辑下沉共享层：会话历史 + token-stats/trend/dashboard 对齐"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: ""
note: "合并原 t477（token-stats/trend/dashboard 查询对齐）"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 固定每类查询的参数契约（必填/默认/整数上下界/非法值错误/排序分页过滤），逐参数正反用例；不再允许「同为接受或拒绝皆可」。依据本仓现状：`session-history-ipc.ts:78-82,243-248`（[1,10000] `INVALID_LIMIT`）、`server.ts:348-377`（query 必填 id/source/env，limit `min:1`）、`server.ts:420-462`（searchContent 逐字段校验）、`server.ts:540-551`（summaries 跳过畸形 loc）、`token-stats-ipc.ts:32-43`（[1,10000]）、`server.ts:1510-1516`（`min:0` 无上界）、`token-stats-store.ts:39,1532,1606`（默认 100/5000）、`trend-ipc.ts:31` 与 `server.ts:1549-1563`（days 回退 7）。
- `sources_status`：确认来源为 `collector.ts:944` 写入 → `token-stats-store.ts:1953-1958` 读取 → IPC `token-stats-ipc.ts:185-188`；LocalAPI `/v1/dashboard` 现状缺该字段（`server.ts:1304-1307`），本 task 补齐。原 `UNVERIFIED-BLOCKING` 两项已由仓内调查解除。
- summaries 畸形项统一策略定为「逐条跳过无效项、保留有效项」（对齐 LocalAPI 现状）。
- 新增 AC-009（逐参数边界正反对用例）；原 AC-001..008 编号保持不动。
- 分界：本 task 负责共享业务层契约；Web bridge 接线归 t480。

调查路径：读 `session-history-ipc.ts`、`server.ts`（session history + token-stats + trend + dashboard）、`token-stats-ipc.ts`、`trend-ipc.ts`、`token-stats-store.ts`、`collector.ts`、`search_content_range.ts`、d058。

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
