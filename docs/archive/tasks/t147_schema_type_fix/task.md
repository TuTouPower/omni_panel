---
tid: "t147"
slug: "schema_type_fix"
title: "observation schema 类型修正 + token reader helper 提取"
status: "done"
branch: "t147_schema_type_fix"
worktree: ""
review_level: "full"
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t147_schema_type_fix

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 按 spec 完成 observation-mapping 返回类型收窄、cycleDurationMs schema 加 nonnegative、reader helper 提取。
- Round 1 双审均 PASS；test reviewer 无 finding，code reviewer 指出 observation_mapping_error.test.ts 中因返回类型收窄导致的冗余可选链 lint 失败，已修复。

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

- [x] mapping 返回类型与实现一致，无残留 null 分支。
- [x] 负 cycleDurationMs 被 schema 拒绝，测试通过。
- [x] 三 reader 共用同一 calendar_date_of/num，token-stats 测试不回归。
- [x] `pnpm test` 通过。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无
- 或：`{finding_id}`：原因；后续计划

### 结果摘要

- 完成 review_20260726_054747 采纳项 12/14/19：`observation_to_metric_record` 返回类型收窄、`cycleDurationMs` schema 拒绝负值、三 token reader 共用 `reader-utils.ts`。
