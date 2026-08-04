---
tid: "t202"
slug: "tokenstats_incremental_test_gaps"
title: "t192 增量聚合测试缺口补强"
status: "done"
branch: "t202_tokenstats_incremental_test_gaps"
worktree: ""
review_level: "full"
diff_anchor: "89c91d5cf679a534be326fe6ea7f7f0f1993e834"
depends_on: ""
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

### Round 1 (2026-08-04 14:00 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                 | fix_ref                                                         |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t202_code_f001 | minor    | 已修   | AC5 EXPLAIN 断言改 `includes("token_stats_hour_rollup")` + 保留 `!SCAN records`，SEARCH/SCAN 两种计划形状均稳健，注释同步 | tests/unit/main/core/token-stats/token-stats-store.test.ts:1946 |
| t202_code_f002 | minor    | 已修   | AC3 竞态测试 `updated_listener` 触发与 `first_pending.resolve` 均包裹进 act，消除 act 未包裹警告                          | tests/unit/renderer/views/token_stats_view.test.tsx:591         |
| t202_code_f003 | minor    | 已修   | spec.md:73 onUpdated 行号引用改为文件级 `src/preload/token-stats-events.ts`                                               | docs/tasks/t202_tokenstats_incremental_test_gaps/spec.md:73     |

### Round 2 (2026-08-04 14:30 UTC+8)

Round 2 code 与 test 均 PASS，零新 finding；三条 minor 修复验证通过（EXPLAIN 断言稳健化、act 包裹、行号引用更新）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：store 测试「AC1 (p032)」——两 session 入库 → 增量 upsert 仅触碰其一 → read_rollup == oracle_rollup，未受影响 session 聚合不变。
    - AC2：store 测试「AC2 (p033)」——NOT NULL 非法 record 抛错后 get_data_version 与 query_records 行数均不变（整批事务回滚）。
    - AC3：view 测试「AC3 (p034)」——in-flight 时触发更新事件 → 晚到 stale 响应不落地（request_id guard 判别力）。
    - AC4：preload 测试 token_stats_events.test.ts——create_on_updated_subscriber 版本 7→8 不错位、非 number 归 0、unsubscribe 移除监听。
    - AC5：store 测试「AC5 (p036)」——EXPLAIN 断言命中 token_stats_hour_rollup 且不 SCAN token_stats_records。
    - AC6：store 测试「AC6 (p037)」——backfill 置 ready → close → reopen → ready 仍 true、增量 upsert 后 read_rollup == oracle_rollup。
    - AC7：全量 pnpm test 206 文件 2152 passed / 1 skipped。
- 黑盒：pnpm typecheck / lint / format:check / build 全绿。

### Reviewer verdict

`full`：

- Round 1 code：PASS（3 minor 已修）
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

t192 六条增量聚合测试缺口（p032-p037）全部补齐：多 session 增量隔离、失败批次版本回滚、事件路径竞态、版本转发粘合、EXPLAIN 读取规模、重启持久化；2 轮 review 闭环。

### 结果摘要

- 一句话；无额外说明可写「见上」
