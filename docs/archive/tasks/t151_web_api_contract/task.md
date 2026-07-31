---
tid: "t151"
slug: "web_api_contract"
title: "web UsageboardApi 契约补齐 + session stub 返回类型"
status: "done"
branch: "t151_web_api_contract"
worktree: ""
review_level: "full"
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t151_web_api_contract

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 按 spec 补齐 web `UsageboardApi` 契约成员，移除双重强转，新增契约测试。
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

- [x] web session stub 返回 `{ saved: false }`。
- [x] api 无双重强转，编译期可发现成员缺失。
- [x] web API 契约测试通过；`pnpm test` 通过。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无
- 或：`{finding_id}`：原因；后续计划

### 结果摘要

- 完成 review_20260726_054747 采纳项 17/18：web `session.login/refresh` 返回契约修正、`UsageboardApi` 补齐缺失成员与类型、新增 web API 契约测试。
