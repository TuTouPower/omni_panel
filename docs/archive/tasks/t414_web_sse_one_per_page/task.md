---
tid: "t414"
slug: "web_sse_one_per_page"
title: "web 面板一页一条 SSE，8 槽不再饿死 fetch"
status: "done"
branch: "t414_web_sse_one_per_page"
worktree: ""
review_level: "full"
diff_anchor: "aa683cba50381d2737012dc116deffabdc795ce4"
depends_on: ""
conflicts_with: "t404"
schedule_status: "scheduled"
note: "来源 p187；一页一条 EventSource 多路复用"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor：无（`docs/blueprint/testing.md` 声明无独立 doctor_cmd）。
- preflight PASS；无 UNVERIFIED-SPIKE。
- 方案：web 桥 `page_connection_id = web-conn-${crypto.randomUUID()}` 开一条 `/v1/events?connectionId=`；会话 subscribe 只 POST（带 connection_id + subscriber_id），不再 per-session EventSource；state/config/theme/messagesUpdated 同连接；open/重连重挂仍打开会话。
- 服务端：`sse_connections` 映射 connectionId→res；一连接多 subscriber_id；cleanup 清该 res 上全部 sub；保留 `?subscriberId=` 旧路径。
- connectionId 必须跨 tab 唯一（固定 `web-conn-1` 会互相覆盖映射）→ d042。
- t279 桥层旧「专属 EventSource」单测整段删除并换 t414 用例；服务端 t279 集成保留兼容。
- 测试：`pnpm test` 3312 passed；typecheck 通过；本 task 改动文件 lint 通过（全仓 lint 有存量无关 error）。
- 黑盒：`pnpm test` + typecheck + 相关 eslint；无 e2e 硬性要求。

## Review 处置

### Round 1 (2026-08-16 05:12 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001～007 均有桥层/集成测试引用，见 `handoff.json` `ac_evidence`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

web 面板每页一条共享 SSE（connectionId），8 槽订阅不再占满 HTTP/1.1 连接池；p187 闭环。
