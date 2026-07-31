---
tid: "t149"
slug: "docs_token_stats_spec_cleanup"
title: "token-stats spec 清理 aggregator.ts 旧计划"
status: "done"
branch: "t149_docs_token_stats_spec_cleanup"
worktree: ""
review_level: "full"
diff_anchor: "f8c7610cbefe1113f9a8b0bac1a8e4773de1299c"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t149_docs_token_stats_spec_cleanup

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 清理 `docs/specs/ai-cli-token-stats-api.md` §11 Phase 4 Task 4.1，将「创建独立 `aggregator.ts`」改为「聚合逻辑已按 §4 内联 collector.ts，不创建 aggregator.ts」。
- `pnpm typecheck` 通过，确认无类型破坏。
- Round 1 双审均 PASS，零 finding。

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

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] §11 不再要求创建独立 aggregator.ts，与 §4 一致。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无
- 或：`{finding_id}`：原因；后续计划

### 结果摘要

- 已按 review_20260726_054747 采纳项 6 清理 `ai-cli-token-stats-api.md` §11 Phase 4 Task 4.1，消除与 §4「聚合内联 collector.ts」的矛盾，并同步后续前置依赖。
