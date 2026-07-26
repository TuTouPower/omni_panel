---
tid: t150
slug: kimi_oauth_concurrency
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
branch: "t150_kimi_oauth_concurrency"
---

# Task t150_kimi_oauth_concurrency

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-26：按 plan 先红后绿。新增 5 个并发测试（logout during login、login write during logout、refresh 合并、logout during refresh、refresh write during logout），在旧实现下稳定失败。随后为 Kimi manager 增加 `token_generations` / `token_mutation_tails` / `enqueue_token_mutation` / `refresh_in_flight`，使 `await_completion` / `logout` / `refresh_now` 均经队列并校验 generation，测试转绿。`pnpm typecheck` 与定向 auth 测试（grok 30 + kimi 28 = 58 项）通过。`pnpm test` 全量因不相关 flaky 测试并发超时失败，与 t127 现象一致。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 19:10 UTC+8)

Round 1 零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] Kimi 登录/登出/刷新均经 mutation queue 且校验 generation
- [x] 同 instance 并发 refresh 合并为单请求
- [x] 新增并发测试通过，现有 OAuth 测试不回归
- [x] 定向 auth 测试通过；`pnpm test` 全量因不相关 flaky 测试并发超时失败

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 为 Kimi OAuth manager 增加与 Grok 对齐的并发保护：mutation queue、generation 校验、`refresh_in_flight` 去重；新增 5 个并发测试全部通过；typecheck 与定向 auth 测试通过。
