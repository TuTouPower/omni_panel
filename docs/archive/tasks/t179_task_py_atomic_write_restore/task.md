---
tid: "t179"
slug: "task_py_atomic_write_restore"
title: "write_front_matter/rebuild_indexes 原子写恢复"
status: "done"
branch: "t179_task_py_atomic_write_restore"
worktree: ""
review_level: "full"
diff_anchor: "31745d5b8e602c231f529a6bb10aa13b98f164a9"
depends_on: ""
conflicts_with: ""
note: "p007"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 恢复 `_atomic_write_text`（task.py:386-400）：tmp 文件 + flush + fsync + `os.replace`，replace 失败时清理 tmp 后重抛。
- `write_front_matter`（task.py:403-404）与 `rebuild_index`（task.py:852-855）改走 `_atomic_write_text`，覆盖权威 front matter 与两个派生索引 JSON。
- 测试补在 `tests/repo_template/test_task_save.py`：`test_atomic_write_replace_failure_keeps_target_and_cleans_tmp`（monkeypatch `task.os.replace` 抛错 → 目标保持原样、`.tmp` 被清理）、`test_atomic_write_fsync_failure_keeps_target_and_cleans_tmp`（fsync 抛错 → 目标不半写、`.tmp` 被清理）。
- Round 1 review：code reviewer 标 tmp 清理只覆盖 replace 分支为 minor；test reviewer 实测复现写盘阶段 fsync 失败 tmp 残留，判 important FAIL。修复：`_atomic_write_text` 的 try 块扩至覆盖 write/flush/fsync 全阶段，任何失败都 unlink tmp 后重抛；fsync 失败用例补 tmp 清理断言。
- 验证：repo_template 基线 197 绿，新增 2 用例绿，全量 pytest 199 绿；`task.py list` 冒烟正常。

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

### Round 1 (2026-08-01 13:00 UTC+8)

| finding_id     | severity  | status | rationale                                                        | fix_ref             |
| -------------- | --------- | ------ | ---------------------------------------------------------------- | ------------------- |
| t179_code_f001 | minor     | 已修   | 与 f002 同根因；修复覆盖写盘+replace 全阶段 tmp 清理             | scripts/task.py:388 |
| t179_test_f001 | important | 已修   | try 块扩至写盘阶段，fsync 失败也 unlink tmp；测试补 tmp 清理断言 | scripts/task.py:388 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1/AC2——`_atomic_write_text`（scripts/task.py:386-400）经 tmp 文件 + flush + fsync + `os.replace` 写目标，`write_front_matter` 与 `rebuild_index` 均走该 helper，任写盘/replace 阶段失败都 unlink tmp 后重抛，目标不半写。AC3——`tests/repo_template/test_task_save.py` 新增 replace 失败与 fsync 失败两条路径测试，均断言目标原样 + tmp 清理；repo_template 197 基线 + 2 新用例 = 199 全绿，全量 pytest 199 绿。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- `scripts/task.py` 权威/派生数据写恢复 tmp+fsync+os.replace 原子写，失败路径测试覆盖 tmp 清理；atomic 写约定记入 conventions.md，pending.py/render_review_prompts.py 同类直写登记 p018。
