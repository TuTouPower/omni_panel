---
tid: "t176"
slug: "migration_test_import_prod"
title: "migration 测试改 import 生产迁移入口"
status: "done"
branch: "t176_migration_test_import_prod"
worktree: ""
review_level: "full"
diff_anchor: "242343ad8f46152746d490e46d6412b6b8c916fa"
depends_on: ""
conflicts_with: ""
note: "p003"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无（testing.md 声明本仓无独立 doctor_cmd）。
- 抽取 `migrate_observation_schema(db, log)` 导出函数（observation-store.ts:67-84），内含 label 三列 + last_error 幂等迁移；`create_observation_store` 调之（原 :119-133 内联逻辑移至导出函数）。
- migration 测试改 import 生产入口：删除手写 `NEW_COLUMN_SQL` 与内联 `PRAGMA/ALTER`，改调 `migrate_observation_schema`；两用例（旧 schema 加 last_error、新 schema 幂等）保留，断言不变。
- 验证：`tests/unit/observation_store_migration.test.ts` + `tests/integration/observation/observation-store.test.ts`（含 label 迁移经 create_observation_store 触达）全绿；`pnpm test` 185 files / 1962 passed（首次 1 flaky 失败为 Windows 已知瞬态，二次全绿）。
- 环境：worktree 需 `pnpm install` + `pnpm rebuild better-sqlite3` + `tsx scripts/gen-build-info.ts`（见 findings d006）。

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t000_code_f001 | minor    | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor    | 遗留   | 一句话    | pNNN    |

### Round 1 (2026-08-01 10:30 UTC+8)

| finding_id     | severity | status | rationale                                                                             | fix_ref                                           |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------- |
| t176_code_f001 | minor    | 已修   | AC2 措辞与实现对齐：测试 has_column 仅作断言辅助，不再承担迁移决策（spec 非范围补注） | spec.md 契约区 AC2                                |
| t176_test_f001 | minor    | 已修   | 新 schema fixture 补 display_label 等列，断言迁移幂等覆盖 label 分支                  | tests/unit/observation_store_migration.test.ts:76 |
| t176_test_f002 | minor    | 已修   | 用例 1 补 label 三列补列断言（旧 schema 触发 ADD COLUMN 后列存在）                    | tests/unit/observation_store_migration.test.ts:46 |

### Round 2 (2026-08-01 10:45 UTC+8)

| finding_id     | severity | status | rationale                                                                              | fix_ref                                           |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------- | ------------------------------------------------- |
| t176_code_f002 | minor    | 已修   | 用例 1 注释改准确（OLD_SCHEMA 已有 raw/normalized_label，仅缺 display_label）          | tests/unit/observation_store_migration.test.ts:39 |
| t176_code_f003 | minor    | 已修   | 幂等用例 fixture 移除生产无的 cycleDurationMs/source_instance_id_dup 列，对齐 INIT_SQL | tests/unit/observation_store_migration.test.ts:81 |

### Round 3 (2026-08-01 10:55 UTC+8)

| finding_id     | severity | status | rationale                                                                    | fix_ref                                           |
| -------------- | -------- | ------ | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| t176_code_f004 | minor    | 已修   | 幂等用例 INSERT 补 window 列（fixture 对齐生产 INIT_SQL 全 20 列，约束一致） | tests/unit/observation_store_migration.test.ts:81 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：`migrate_observation_schema(db, log)` 独立导出（observation-store.ts:70），`create_observation_store` 在 INIT_SQL 后调用（:132）；抽取逻辑与旧内联块逐行一致，执行时机/顺序未变。
    - AC2：`observation_store_migration.test.ts` 删除手写 `NEW_COLUMN_SQL` 与内联 PRAGMA/ALTER 决策，改调生产函数；has_column 仅作断言辅助。
    - AC3：迁移测试 2/2、observation-store 集成 18/18 通过；`pnpm test` 185 files / 1962 passed；`tsc --noEmit` 零错。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（1 minor：f001 已修）
- Round 1 test：PASS（2 minor：f001/f002 已修）
- Round 2 code：PASS（2 minor：f002/f003 已修）
- Round 2 test：PASS
- Round 3 code：PASS（1 minor：f004 已修）
- Round 3 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

迁移逻辑抽取为导出 `migrate_observation_schema`，测试改 import 生产入口消除手写 SQL 漂移；p003 闭环。
