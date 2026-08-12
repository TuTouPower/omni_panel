---
tid: "t323"
slug: "session_topbar_buttons_to_titlebar"
title: "会话顶栏三按钮移到刷新按钮左侧 + 消除卡片上方空行"
status: "done"
branch: "t323_session_topbar_buttons_to_titlebar"
worktree: ""
review_level: "single"
diff_anchor: "20751dc1994d4b0630af70179ed360b74725dd17"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 三按钮与 rail-toggle 上移顶栏：SessionShell header 左侧渲染 rail-toggle（w-[220px]↔w-11，与 rail 左缘同列对齐），PanelTitleBar 新 `before_actions` 插槽渲染 WorkspaceToolbar（最近会话→清空→视图，刷新按钮左侧，顺序保持）。
- state 提升到 SessionShell：`layout`/`view`/`recent_open`/`rail_collapsed`/`count`；WorkspaceView 受控化（props：layout/view/recent_open/rail_collapsed + on_layout_change/on_recent/on_recent_close/on_count_change/on_register_clear）。移除 `session-workspace-topbar` 行，body 直顶容器，grid 顶边与顶栏下边相接（AC-003）。
- clear 动作：槽位模型状态在 WorkspaceView（useWorkspaceColumns）内部，WorkspaceView 经 `on_register_clear` 把 clear_all 注册进 SessionShell 的 ref，顶栏「清空」按钮调用之；recent modal 由 `recent_open` prop 受控，confirm 仍在 WorkspaceView（需 hook_clear_all + open_session）。
- count 上报：WorkspaceView 经 `on_count_change` 上报 `occupied_count(slots_state)`，顶栏视图下拉据此出排布选项。
- rail-toggle 位置决策：移入 header 与 rail 对齐（折叠宽度动画 220px↔44px 保留）；`rail_collapsed` 相应提升到 SessionShell（spec 点 3 原文「保留在 WorkspaceView 内管理」，但 toggle 移至 header 需要该值渲染，故提升；AC-004 折叠行为不变，由测试覆盖）。toggle 用 rail 同色 bg-surface + border-r outline，与下方 rail 视觉连续。
- `on_view_change` 未作为 WorkspaceView prop：view 仅由顶栏「视图」下拉修改（on_view_change 在 SessionShell 供 WorkspaceToolbar 用），WorkspaceView 只读 view prop、内部无修改点，故移除该死 prop（spec 点 3 列出但为死 prop，tsc noUnusedParameters 门禁）。
- 旧测试语义处置：t318 工具栏「占满整行/纵向紧凑/同高」断言随三按钮上移作废，按 TDD 纪律改为 t323 新语义断言（WorkspaceToolbar 按钮顺序、SessionShell AC-001/AC-004、WorkspaceView 无 topbar 行 + grid/rail 同基线、PanelTitleBar before_actions 插槽）；e2e t318 布局测试改为 t323 几何断言（grid 顶边 vs 顶栏下边 ≤1px、rail/grid 同基线、视图菜单右锚定不溢出）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

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
- 证据：AC-001/002 由 SessionShell 单测覆盖（三按钮顶栏刷新左侧、功能保留）；AC-003 由 e2e 几何断言（grid 顶边 vs 顶栏下边 ≤1px）；AC-004 rail 折叠单测；全量 2950 passed；详见 handoff.json ac_evidence

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话面板三按钮（最近会话/清空/视图）上移顶栏刷新按钮左侧（PanelTitleBar before_actions 插槽），rail-toggle 同步上移 header 最左；WorkspaceView 移除次级 topbar 消除空行，grid 顶边直贴顶栏
