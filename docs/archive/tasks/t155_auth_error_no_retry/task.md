---
tid: "t155"
slug: "auth_error_no_retry"
title: "401/403 认证错误不重试，避免刷出服务端 IP 封禁"
status: "done"
branch: "t155_auth_error_no_retry"
worktree: ""
review_level: "full"
diff_anchor: "73785a2838839268d8283e05ff56130ce825ba9d"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t155_auth_error_no_retry

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-26：建 backlog，未开干。动机：CPA 实例 key 填错返回 401，调度层每次刷新照样重试 3 次，高频刷 401 被服务端封 IP（403 "IP banned due to too many failed attempts"，约 30 分钟解封）。`diff_anchor` 开干时写实值。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-27 03:19 UTC+8)

| finding_id     | severity  | status | rationale                                                               | fix_ref                                              |
| -------------- | --------- | ------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| t155_code_f001 | important | 已修   | `invalid`+`key` 子串过宽，改为 `\binvalid\b.*\bkey\b` 词边界匹配        | src/main/core/scheduler/refresh-service.ts           |
| t155_code_f002 | minor     | 已修   | 删除 `is_auth_error` 前多余空行                                         | src/main/core/scheduler/refresh-service.ts           |
| t155_test_f001 | important | 已修   | 补 mock `execute_connector` 的 unit test，直接断言 auth error 调用 1 次 | tests/unit/scheduler/refresh-service.test.ts（新增） |
| t155_test_f002 | minor     | 已修   | 补 `HTTP 500` 与 `ECONNRESET` 各 3 次重试单测                           | tests/integration/scheduler/refresh-service.test.ts  |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t155` 查，不在此记。

### Round 2 (2026-07-27 03:32 UTC+8)

Round 2 零 finding，未进处置表。

### 验收标准勾选

- [x] key 类认证错误（401/403/invalid key）单次刷新只发 1 次请求即判 failed，不再重试
- [x] 网络错误、5xx 错误仍按现有语义重试 3 次
- [x] session 连接器 auto re-login 仍触发，重登录成功后的重试不受影响
- [x] `is_auth_error` 覆盖 403 及常见 key 无效响应变体，有对应单测

### Reviewer verdict

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- 实现：扩展 `is_auth_error` 覆盖 403/forbidden/invalid key/IP ban；重试循环对 auth error 立即 `break`（session 连接器首次仍触发 re-login，成功后继续）。
- 测试：新增 `tests/unit/scheduler/refresh-service.test.ts` 直接 mock `execute_connector` 断言调用次数；更新 `error-classification.test.ts`；保留并验证 integration 用例。
- 验证：`pnpm test` 1828 全绿，`pnpm typecheck`/`pnpm lint` 通过。
