---
tid: "t184"
slug: "tokenstats_24h_summary_axes_aggregate"
title: "代理面板 24h 汇总与非时间轴消除 records LIMIT 偏差"
status: "done"
branch: "t184_tokenstats_24h_summary_axes_aggregate"
worktree: ""
review_level: "single"
diff_anchor: "1e4ee9824ce843d5ca548f3bfae8fe8c0f5bce1f"
depends_on: "t183"
conflicts_with: ""
note: ""
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

### Round 1 (2026-08-01 22:30 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                | fix_ref                                                    |
| ------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| t184_gen_f001 | important | 已修   | 补高密度 store 测试：插入 >50000 条 current+previous 记录，断言 rollup 覆盖完整窗口                      | tests/unit/main/core/token-stats/token-stats-store.test.ts |
| t184_gen_f002 | minor     | 已修   | rollup 统一半开 `[start,end)`，current/previous 边界不双计；end=Date.now() 下与 records 闭区间无可见偏差 | src/main/core/token-stats/token-stats-store.ts             |
| t184_gen_f003 | minor     | 已修   | title 改选最新 timestamp 对应值，对齐 records 版取首条语义                                               | src/main/core/token-stats/token-stats-store.ts             |
| t184_gen_f004 | minor     | 已修   | prevComp rollup 分支改 `[]`，消除冗余 composition 计算                                                   | src/renderer/views/TokenStatsView.tsx                      |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：store 高密度测试插入 6000 条 current + 6000 条 previous（>DEFAULT_RECORDS_LIMIT 5000），断言 rollup 单组 calls=6000；query_records 在该规模会截断到 5000，rollup 无 LIMIT。
    - AC2/AC3：`modelSegmentsFromRollup` / `agentSegmentsFromRollup` / `compositionSegmentsFromRollup` / `prepareBarDataFromRollup` chart-data 单测覆盖 top5+其他、目录/模型别名合并、session 轴多模型合并。
    - AC4：store `filters by agent and env` + renderer `passes agent and env filters to the rollup fetch`。
    - AC5：rollup 无 LIMIT，行数随 (source, model, directory, session_id) 分组数增长；records 仍按原 50k LIMIT 拉取，未移除或提高。
    - AC6：renderer `skips the rollup fetch outside 24h` + `does not feed BarChart rollup rows outside 24h`；7d/30d/hour 路径未改。
    - 黑盒：typecheck / lint / build / vitest（1987） / web e2e（48）全绿。

### Reviewer verdict

`single`：

- Round 1 general：FAIL（4 finding：f001 important 高密度测试缺失；f002/f003/f004 minor）
- Round 2 general：PASS（f001-f004 全部已修确认）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

24h preset 的 KPI / donut / 项目 / 会话轴改走 `query_range_rollup` 有界 SQL 聚合，消除 records LIMIT 截断；p020 剩余部分闭环（p020 整条移入 archive）。标题子查询窗口偏差登记 p024。
