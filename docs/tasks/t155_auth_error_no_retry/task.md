---
tid: t155
slug: auth_error_no_retry
diff_anchor: "<SHA>"
branch: t155_auth_error_no_retry
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

（未进双审。）

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t155` 查，不在此记。

### 验收标准勾选

- [ ] key 类认证错误（401/403/invalid key）单次刷新只发 1 次请求即判 failed，不再重试
- [ ] 网络错误、5xx 错误仍按现有语义重试 3 次
- [ ] session 连接器 auto re-login 仍触发，重登录成功后的重试不受影响
- [ ] `is_auth_error` 覆盖 403 及常见 key 无效响应变体，有对应单测

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- backlog 已建，未执行。
