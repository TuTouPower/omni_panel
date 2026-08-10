---
tid: "t285"
slug: "cli_import_rollback_guard"
title: "CLI import-config 回滚边界加固与 apt 依赖清单"
status: "done"
branch: "t285_cli_import_rollback_guard"
worktree: ""
review_level: "full"
diff_anchor: "43d55051af9ca47bf541f7e745f52f75886097f2"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: "p094：回滚删 vault 值风险；full（数据面）"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending`「待办」节（普通模板）**，新条目先运行 `scripts/repo_template/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-10 23:30 UTC+8)

| finding_id     | severity  | status | rationale                                                                                 | fix_ref                                       |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| t285_code_f001 | minor     | 已修   | 二轮导入改不同 secret 值，断言可区分 restore 旧值与 no-op                                 | tests/unit/main/cli/import-config.test.ts:242 |
| t285_code_f002 | minor     | 已修   | apt 清单 t64 版本说明修正（Debian 13 / Ubuntu 24.04+ 才用 t64 名；旧发行版去后缀）        | docs/guides/cli-mode.md:27                    |
| t285_test_f001 | important | 已修   | 同 code_f002：apt 清单 t64 事实错误（Debian 12 误标、其余包名一致不成立）已修正为两段清单 | docs/guides/cli-mode.md                       |
| t285_test_f002 | minor     | 已修   | 同 code_f001：二轮不同值断言已改                                                          | tests/unit/main/cli/import-config.test.ts:242 |
| t285_code_f003 | minor     | 已修   | Round 2 新增：`plugins[0]!` 非空断言改 if 守卫（lint no-non-null-assertion）              | tests/unit/main/cli/import-config.test.ts:305 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-001：`tests/unit/main/cli/import-config.test.ts` 新增「重复导入且 save 失败时回滚保留导入前已存在的 vault 值」用例——二轮导入不同 secret 值（sk-second-secret）后 save 失败，断言 vault 恢复首轮旧值（sk-live-secret）且 deleteMock 未被调用（restore 分支真实触达）；原「新建回滚删除」用例保持。
    - AC-002：`docs/guides/cli-mode.md`「Electron GUI 运行时依赖」节——两段 apt 清单（Ubuntu 24.04+/Debian 13+ t64 名；旧发行版去 t64 后缀），包名经 packages.ubuntu.com 逐包核实。
    - AC-003：`pnpm test` 全量 2834 passed、9 skipped；typecheck/eslint 干净。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（2 minor）
- Round 1 test：FAIL（f001 important apt 清单 t64 事实错误 + f002 minor）
- Round 2 code：PASS（1 新增 minor f003 非空断言）
- Round 2 test：PASS（1 新增 minor f003）
- Round 3 code：PASS（f003 处置复核成立，0 新 finding）
- Round 3 test：PASS（f003 处置复核成立，0 新 finding）

`single`：

- 不适用

### 结果摘要

- import-config 回滚边界加固（覆盖恢复 vs 新建删除），apt 依赖清单补齐（t64 事实修正）；4 finding 全闭环，全量 2834 passed 无回归。
