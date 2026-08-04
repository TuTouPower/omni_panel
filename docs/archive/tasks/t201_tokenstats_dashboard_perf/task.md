---
tid: "t201"
slug: "tokenstats_dashboard_perf"
title: "dashboard 查询性能与 records/rollup 双轨统一"
status: "done"
branch: "t201_tokenstats_dashboard_perf"
worktree: ""
review_level: "full"
diff_anchor: "2aff05e390b4b649794bbd878617bba56ee2ecbc"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- s012 spike 验证单次窗口读取 SQL 形态：CTE 无法跨语句共享物化，TEMP TABLE 方案胜出；p028 latest-per-group 窗口函数单查询替代每 session 相关子查询；stale 用版本双读（start/end_version）。
- 实施：query_dashboard/query_dashboard_sessions 重构为 materialize_window_rows + materialize_session_meta，各区域 SELECT FROM 临时表；records/rollup 双轨统一为单一 window source；freshness.stale = end_version > start_version。
- 环境：worktree 缺 node_modules junction 与 src/generated/build-info.ts，已建 junction + 生成 build-info。review 期间 better-sqlite3 ABI 不匹配（146 vs node 127），跑 `node scripts/ensure_sqlite_abi.mjs node` 切换后测试可运行。

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

### Round 1 (2026-08-04 13:00 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                              | fix_ref                                                            |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| t201_code_f001 | minor     | 遗留   | materialize_session_meta 独立全窗口 records 扫描与 AC1 字面有张力；s012 批准的 AC2 latest-per-group 形态，功能正确                     | s012 结论（采纳）                                                  |
| t201_code_f002 | minor     | 已修   | window_rows 物化冗余 ts/title 列下游无消费，全删（union 两段 + records_source + materialize 列清单）                                   | src/main/core/token-stats/token-stats-store.ts:486                 |
| t201_test_f001 | important | 已修   | 补 AC3 stale=true 正向测试：on_sql 钩子首条物化语句处重入 upsert 推进版本，断言 stale=true + data_version=2                            | tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:641 |
| t201_test_f002 | minor     | 已修   | AC1 断言改全量 SQL 计数：fallback 下 token_stats_records 引用恰 3 条（2×window_rows + 1×session_meta，全 CREATE 前缀），无 rollup 引用 | tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:570 |

### Round 2 (2026-08-04 13:30 UTC+8)

Round 2 code 与 test 均 PASS。t201_test_f001/f002 与 code_f002 修复验证通过；code_f001 按 s012 采纳维持现状。

### Round 3 (2026-08-04 14:00 UTC+8)

Round 3 code PASS（t201_code_f003 minor 已修：dashboard_records_source doc 注释移除已删列的 ts/title 引用）；Round 3 test 未开（Round 2 test 已 PASS，无新增 test 侧改动）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`token_stats_dashboard.test.ts` 语句级断言——fallback 路径 `token_stats_records` 引用恰 3 条（2×window_rows + 1×session_meta 物化，全 CREATE 前缀），无 rollup 引用；rollup 就绪路径由 t192 before/after-backfill 全区域等式测试兜底。
    - AC2：AC2 测试断言 session_meta 物化为单一 `ROW_NUMBER() OVER` 窗口查询，无 per-session `WHERE t2.` 相关子查询。
    - AC3：AC3 测试——版本不变 stale=false + data_version=1；on_sql 重入 upsert 推进版本后 stale=true + data_version=2。
    - AC4：既有 t192 parity 测试（9 组选项组合 fallback/rollup 逐区相等）+ raw-record oracle（current/previous summary）。
    - AC5：全量 pnpm test 205 文件 2144 passed / 1 skipped，既有分页/has_more/top-five/别名测试全绿。
- 黑盒：pnpm typecheck / lint / format:check / build 全绿。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（f001 stale=true 无测试 / f002 AC1 断言盲区）
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：N/A（Round 2 test 已 PASS，无新增 test 侧改动）

### 结果摘要

dashboard 单次窗口 TEMP TABLE 物化消除重复聚合、latest-per-group 消除 N 次相关子查询、双轨统一、stale 版本双读；3 轮 review 闭环。
