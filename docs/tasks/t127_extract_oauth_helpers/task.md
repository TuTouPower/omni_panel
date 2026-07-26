---
tid: t127
slug: extract_oauth_helpers
diff_anchor: "TBD"
branch: ""
---

# Task t127_extract_oauth_helpers

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t127_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t127` 查，不在此记。

### 验收标准勾选

- [ ] `src/main/core/auth/oauth_helpers.ts` 建立，包含上述 7 函数 + 8 类型 + 常量 + 统一 `load_tokens` / `store_tokens` / `compute_expires_at`
- [ ] `grok_oauth_manager.ts` 与 `kimi_oauth_manager.ts` 各减少约 48 行，重复定义全部移除
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全绿（含既有 `tests/unit/auth/grok_oauth_manager.test.ts` / `kimi_oauth_manager.test.ts` 不删改断言语义）
- [ ] grok / kimi OAuth 行为零变化（既有测试全部原样通过即视为证据）

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无
- 或：`{finding_id}`：原因；后续计划

### 结果摘要

- {一句话；无额外说明可写「见上」}
