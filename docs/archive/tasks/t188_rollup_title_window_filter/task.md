---
tid: "t188"
slug: "rollup_title_window_filter"
title: "query_range_rollup title 子查询补窗口过滤"
status: "done"
branch: "t188_rollup_title_window_filter"
worktree: ""
review_level: "single"
diff_anchor: "6d6345616bfc83d933a9f2b675aaac30d129fb98"
depends_on: ""
conflicts_with: ""
note: "p024"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-02)

| finding_id    | severity | status | rationale                              | fix_ref                                            |
| ------------- | -------- | ------ | -------------------------------------- | -------------------------------------------------- |
| t188_gen_f001 | minor    | 已修   | 注释元引用 `(p024)` 删除（元引用禁令） | src/main/core/token-stats/token-stats-store.ts:619 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`title subquery honors the window start` 构造 s1 窗口内 title=A2（T1）、窗口外 title=B（T2+10s），断言 `query_range_rollup({start, end})` 返回 A2。
    - AC2：`title subquery without start picks full-table latest` 不带 start 返回 B（全表最新）。
    - AC3：外层 WHERE 保证窗口内无记录的 session 不入结果（既有用例覆盖）。
    - 黑盒：typecheck / lint 零警告；全量 vitest 1995 passed。

### Reviewer verdict

`single`：

- Round 1 general：PASS（1 finding：t188_gen_f001 minor，注释元引用）
- Round 2 general：PASS（f001 已修确认，无新发现）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

query_range_rollup 的 title 子查询补 `t2.timestamp >= @start AND t2.timestamp < @end` 窗口条件（start/end 始终绑定默认值使子查询无条件引用），返回窗口内最新 title 对齐 records rs[0] 语义；p024 闭环。
