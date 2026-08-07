---
tid: "t244"
slug: "workspace_layout_selector"
title: "工作台视图：会话排布方式选择（按当前会话数给可选排布）"
status: "done"
branch: "t244_workspace_layout_selector"
worktree: ""
review_level: "single"
diff_anchor: "8d00bded6012ff969ead079bbd43e9a757c28380"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

已在 `slots.ts` 抽出 `layout_choices_for_count`，按会话数返回代表性列×行候选；`WorkspaceToolbar` 将候选放入「视图」菜单，并通过现有 `layout` 状态切换网格列数，保留工具条中间数字按钮。新增纯函数与组件测试覆盖 0/1/2/3/6/8 个会话及菜单选中态。目标测试、typecheck、lint、Prettier、`git diff --check`、全量 `pnpm test`、`pnpm build` 均通过。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-07 15:31 UTC+8)

| finding_id    | severity  | status | rationale | fix_ref |
| ------------- | --------- | ------ | --------- | ------- |
| t244_gen_f001 | important | 已修   | 会话数量变化时将布局归一到可表示候选，并补充 8 会话选中态回归测试。 | WorkspaceView.tsx / WorkspaceToolbar.tsx |

### Round 2 (2026-08-07 15:39 UTC+8)

| finding_id    | severity  | status | rationale | fix_ref |
| ------------- | --------- | ------ | --------- | ------- |
| t244_gen_f002 | important | 已修   | 视图菜单候选校验与旧数字按钮入口分开，数字按钮继续直接设置列数，菜单补入当前布局并标记选中。 | WorkspaceView.tsx / WorkspaceToolbar.tsx |

### Round 3 (2026-08-07 15:45 UTC+8)

Round 3 零新 finding；前两轮 finding 均已修复。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：新增排布候选纯函数与 WorkspaceView 菜单回归测试；目标测试 51 passed，typecheck、lint、Prettier、`git diff --check`、全量 `pnpm test` 与 `pnpm build` 通过。

### Reviewer verdict

- Round 1 general：FAIL
- Round 2 general：FAIL
- Round 3 general：PASS

### 结果摘要

工作台「视图」菜单按当前会话数提供列×行排布选择，保持现有数字布局按钮语义，并为当前布局提供选中态。

