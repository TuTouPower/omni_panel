---
tid: "t187"
slug: "custom_short_window_hour_bar_aggregate"
title: "自定义 ≤25h 范围小时柱改走 hour 聚合"
status: "done"
branch: "t187_custom_short_window_hour_bar_aggregate"
worktree: ""
review_level: "single"
diff_anchor: "12fb72c38dab2b9c9ea216648226b7c733f6eb04"
depends_on: ""
conflicts_with: ""
note: "p023"
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

| finding_id    | severity | status | rationale                                                          | fix_ref                                             |
| ------------- | -------- | ------ | ------------------------------------------------------------------ | --------------------------------------------------- |
| t187_gen_f001 | minor    | 已修   | 加 `records.length < 7` 断言，显式区分 hour buckets 与截断 records | tests/unit/renderer/views/token_stats_view.test.tsx |
| t187_gen_f002 | minor    | 已修   | 给 60_000 容差加注释，说明是 Date.now() 漂移上限                   | tests/unit/renderer/views/token_stats_view.test.tsx |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`feeds BarChart hour buckets on a <=25h custom range at hour granularity` 断言 custom ≤25h + 小时粒度下 BarChart 接收完整 7 行 hour buckets，且 records（截断 2 条）严格少于 7。
    - AC2：断言 getHourBuckets 收到完整自定义窗口 [start, end]（窗口宽 ≥ 12h - 60s 容差）。
    - AC3：24h preset / 7d / 30d / day 粒度回归用例（t183/t164 既有测试）全过；view 测试 21 passed。
    - 黑盒：typecheck / lint 零警告；全量 vitest 1993 passed；web e2e 48 passed。

### Reviewer verdict

`single`：

- Round 1 general：PASS（2 finding：t187_gen_f001/t187_gen_f002 均 minor，测试断言/注释强化）
- Round 2 general：PASS（f001/f002 已修确认，无新发现）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

≤25h 自定义范围时间轴小时柱改走 query_hour_buckets 聚合（与 24h preset / ≥7d 同源），消除 records LIMIT 截断（p023）；hour_fetch 条件简化为 `gran !== "hour" || !time_axis"`。
