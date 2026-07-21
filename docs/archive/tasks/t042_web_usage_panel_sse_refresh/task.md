---
tid: t042
slug: web_usage_panel_sse_refresh
diff_anchor: "b7d438b7a37bfa44b3f1dc9c38c3ca87d13a3f70"
branch: t042_web_usage_panel_sse_refresh
---

# Task t042_web_usage_panel_sse_refresh

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 诊断结论（开干前）：web 用量面板不刷新根因 = `usageboard-web.ts` `event.onStateChange` 为 no-op，`use_plugins()` 仅靠该推送更新 connector 快照，web 端无任何刷新机制。桌面端靠 IPC 推送（runtimeStore.subscribe → EVENT_STATE_CHANGE → webContents.send）实时。方案选定：SSE 推送，复用 `connector_deps.runtimeStore.subscribe` 同一事件源，与桌面端语义一致。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-22 20:30 UTC+8)

- code：0 finding（PASS）。
- test：1 finding，进表。

| finding_id     | severity  | status | rationale                                                                                                                          | fix_ref                                    |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| t042_test_f001 | important | 已修   | AC#3「无泄漏」原仅 `not.toThrow`，实现层 `res.destroyed` guard 会吞泄漏致测试恒 PASS；改 spy `subscribe` 断言断开后 unsub 被调一次 | tests/integration/local-api/server.test.ts |

### Round 2 (2026-07-22 21:05 UTC+8)

- code：N/A（round 1 后无 code 实质改动，复用 round 1 PASS）。
- test：0 finding（PASS）—— `t042_test_f001` 已修复并经 round 2 确认。零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] web 端打开用量面板后，触发任意 connector 刷新，面板数据自动更新（无需手动 reload 页面）。—— 实机验证（沙盒实例 :17864 + Playwright chromium）：订阅 `onStateChange` 后点「刷新」，5s 内收到 26 条 SSE 推送（status loading→ready 流转），证明 refreshAll → runtimeStore.updateState → `GET /v1/events` → EventSource → `onStateChange` 全链路实时。
- [x] `GET /v1/events` 返回 `text/event-stream`，连接期间 runtimeStore 状态变化被实时推送为 SSE `data:` 帧。
- [x] SSE 连接关闭时正确 unsub，无订阅/句柄泄漏（spy `subscribe` 断言 `unsub_count >= subscribe_count`；已验证注释 cleanup 后测试失败）。
- [x] 有集成或 e2e 测试证明 web 用量面板数据自动刷新（`tests/integration/local-api/server.test.ts` SSE 用例 + `tests/unit/web/usageboard-web.test.ts` relay 用例）。
- [x] 桌面端用量面板行为不受影响（回归通过：未改 `event-ipc.ts`/`preload`；全量 `pnpm test` 146 files 绿）。
- [x] `pnpm test` 全绿（146/146；typecheck/lint 干净）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL（`t042_test_f001`：AC#3 泄漏验证过弱）
- Round 2 code：N/A（round 1 后无 code 实质改动）
- Round 2 test：PASS（`t042_test_f001` 已修并确认）

### 遗留

- 无。

### 结果摘要

- 根因：web 端 `event.onStateChange` 为 no-op、`use_plugins` 仅靠该推送更新且无轮询 → 用量面板数据冻结。修复：LocalAPI 加 `GET /v1/events` SSE（复用 `connector_deps.runtimeStore.subscribe`，与桌面端 IPC 同源）；`usageboard-web` 的 `onStateChange` 改 `EventSource` 订阅。TDD 红→绿，双审 round 2 PASS，实机 Playwright 验证 SSE 链路（5s 内 26 条推送）。
