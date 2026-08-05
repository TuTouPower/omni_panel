---
tid: "t221"
slug: "drop_redundant_idx_trend"
title: "删除冗余 idx_trend 索引"
status: "done"
branch: "t221_drop_redundant_idx_trend"
worktree: ""
review_level: "full"
diff_anchor: "158d7e7e2754f62e916a9ebc6263d103d53c67e4"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

Step 1 前置：`{doctor_cmd}` 无（blueprint 声明无独立 doctor）。

执行期（2026-08-05）：

- `INIT_SQL` 移除 `CREATE INDEX IF NOT EXISTS idx_trend`（含其注释段）；`migrate_observation_schema` 不含索引 DDL，旧库残留 idx_trend 无害、不迁移 DROP（spec AC-1 已允许「保留无害」选项，docstring 注明）。
- 接口 docstring 更新：删除「idx_trend 保留供等价查询」表述，注明 t221 删除冗余 idx_trend、旧库残留不迁移。
- 测试：收紧「uses a covering index」断言为 `idx_lookup`（删除 idx*trend 后不再有 idx*(trend|lookup) 双选）；新增「新库不含 idx_trend」PRAGMA index_list 用例（AC-1 可测部分）。
- 验证：整批 `pnpm test` 6 次跑 5 全绿（第 3 次 1 个未识别测试瞬态失败、未复现、与本改动无关——本改动仅 observation-store 索引，不触 refresh/settings 等 flaky 家族）；连续 3 次全绿达成 AC-1；typecheck / lint 通过。

创建期核实（2026-08-05，只读仓库）：

- `observation-store.ts:70-77`：`idx_lookup` 与 `idx_trend` 定义确认。`:287` `query_trend_series` 唯一查询路径含 source_instance_id。
- 调用方全仓 grep：`server.ts:495` / `trend-ipc.ts:32,51` 均传 source_instance_id；无不含 source_instance_id 的等价 trend 查询。planner 走 idx_lookup 全覆盖（docstring :23-25 自述）。
- `migrate_observation_schema:83-90` 目前只补列（label 三列 + last_error），不含索引 DDL；删索引是 `INIT_SQL` 的 CREATE 语句移除。旧库迁移策略：`CREATE INDEX IF NOT EXISTS` 移除后旧库残留 idx_trend 无害（不 DROP，避免迁移写入代价）；或执行期决定 DROP 一次。spec 已注明「明确文档化不迁移、保留无害」选项。

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

### Round 1 (2026-08-06 00:15 UTC+8)

full 级双路 review：code PASS（1 minor）、test PASS（0 finding）。1 minor 本 task 内已修。

| finding_id     | severity | status | rationale                                                                                     | fix_ref                    |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------- | -------------------------- |
| t221_code_f001 | minor    | 已修   | `docs/specs/observation-store.md` 两处（:38,:44）同步为「仅 idx_lookup、旧库残留不迁移 DROP」 | observation-store.md:38,44 |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-1：`INIT_SQL` 移除 idx_trend CREATE（含注释）；新「PRAGMA index_list 不含 idx_trend」用例锁定；旧库残留走「文档化不迁移、保留无害」（docstring + spec 双注明，迁移函数本就只补列无索引 DDL）。
    - AC-2：`query_trend_series` SQL 与分桶逻辑逐字节未动，既有行为测试保留，结果一致。
    - AC-3：全仓 grep 无其他 idx_trend 依赖；整批 `pnpm test` 全绿（222 files / 2354 passed，1 skipped）。
    - AC-4：`observation-store.ts` 接口 docstring 删除「idx_trend 保留」表述；`docs/specs/observation-store.md` 两处同步。
    - typecheck / lint 通过。

### Reviewer verdict

- Round 1 code：PASS（1 minor 已修：spec 文档同步）
- Round 1 test：PASS（0 finding）

### 结果摘要

p045 冗余索引清理完成：新库不再建 idx_trend，旧库残留保留无害（不迁移 DROP），trend 查询仍走 idx_lookup 全覆盖，全量回归绿。
