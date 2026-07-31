---
tid: "t125"
slug: "split_accounts_section"
title: "拆分 accounts_section.tsx 抽 AccountsList"
status: "done"
branch: "t125_split_accounts_section"
worktree: ""
review_level: "full"
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t125_split_accounts_section

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 将 `AccountsList` 从 `accounts_section.tsx` 拆出到 `accounts_list.tsx`，props 与行为不变；`accounts_section.tsx` 行数降至 208。
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

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t125_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t125` 查，不在此记。

### 验收标准勾选

- [x] `accounts_section.tsx` 行数 < 400。
- [x] `AccountsList` 位于 `accounts_list.tsx`，props 与行为不变。
- [x] 共用 interface 无重复定义、无循环依赖。
- [x] typecheck 通过。
- [x] `pnpm test` 全绿。
- [x] 行为零变化。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 已将 `AccountsList` 拆分为独立文件 `accounts_list.tsx`，`accounts_section.tsx` 行数从 436 降至 208，行为与测试均零变化。
