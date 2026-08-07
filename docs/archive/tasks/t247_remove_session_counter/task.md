---
tid: "t247"
slug: "remove_session_counter"
title: "工作台：取消会话上方数字条与右侧计数"
status: "done"
branch: "t247_remove_session_counter"
worktree: ""
review_level: "single"
diff_anchor: "22e3f5553d0c5ed5b810bbe8da0de594def2a71d"
depends_on: "t244"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 移除 `WorkspaceToolbar` 中间的 `LAYOUT_OPTIONS` 数字按钮组及右侧 `count/8`，同步删除对应 CSS；保留最近会话、清空、视图和视图菜单排布选择。
- 将工作台组件测试中的旧计数等待改为 rail/网格可观察断言，并新增工具条元素不存在的回归测试。
- 更新 `docs/specs/workspace.md`、`docs/specs_index.md` 与 `docs/blueprint/architecture.md`，明确排布选择统一位于视图菜单。
- 定向测试 32/32、全量测试 237 个文件 2556 passed/1 skipped、typecheck、lint、构建及变更文件格式检查通过。

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

### Round 1 (2026-08-07 17:47 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：WorkspaceView 定向测试 32/32；全量测试 237 个文件、2556 passed、1 skipped；typecheck、lint、构建、变更文件格式检查与 `git diff --check` 通过。

### Reviewer verdict

- Round 1 general：PASS

### 结果摘要

- 工作台工具条已移除独立数字布局按钮与 `count/8`，排布选择统一通过视图菜单提供。
