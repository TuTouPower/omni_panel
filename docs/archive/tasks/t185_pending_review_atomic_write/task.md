---
tid: "t185"
slug: "pending_review_atomic_write"
title: "pending.py / render_review_prompts.py 原子写"
status: "done"
branch: "t185_pending_review_atomic_write"
worktree: ""
review_level: "single"
diff_anchor: "211dcb9dad9f49a14e65a4fa716bc0af687df282"
depends_on: ""
conflicts_with: ""
note: "p018"
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

### Round 1 (2026-08-02 23:50 UTC+8)

| finding_id    | severity | status | rationale                                                   | fix_ref                                             |
| ------------- | -------- | ------ | ----------------------------------------------------------- | --------------------------------------------------- |
| t185_gen_f001 | minor    | 已修   | 测试 docstring 元引用 `(t185, p018)` 改为描述性文字，去编号 | tests/repo_template/test_pending_render_atomic.py:1 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/AC2：`tests/repo_template/test_pending_render_atomic.py` 用 monkeypatch 在 `task.os.replace` 注入异常，断言 pending/archive 与 prompt 目标文件保持原内容 + 无 tmp 残留。
    - AC3：两脚本 `from task import _atomic_write_text` 复用同一实现，未重复 tmp+fsync+replace 逻辑；monkeypatch `task.os.replace` 覆盖两脚本调用路径证明共享。
    - 黑盒：typecheck / lint 零警告；repo_template pytest 201 全过。

### Reviewer verdict

`single`：

- Round 1 general：PASS（1 finding：t185_gen_f001 minor，测试 docstring 元引用）
- Round 2 general：PASS（f001 已修确认，无新发现）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

pending.py / render_review_prompts.py 写权威/派生文件改用 task.py 的 `_atomic_write_text`，消除半写风险；p018 闭环。
