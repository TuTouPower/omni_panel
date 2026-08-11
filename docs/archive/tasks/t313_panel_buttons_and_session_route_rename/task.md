---
tid: "t313"
slug: "panel_buttons_and_session_route_rename"
title: "面板按钮顺序/icon/位置统一 + #history→#session 路由与 CSS 类名改名"
status: "done"
branch: "t313_panel_buttons_and_session_route_rename"
worktree: ""
review_level: "single"
diff_anchor: "5732998b98dd6af8a95de86dfaa4994efe25a27f"
depends_on: ""
conflicts_with: "t308,t310,t312,t316"
schedule_status: "scheduled"
note: "merged from t304"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- TDD：先更新/新增 13 个测试文件（含 e2e），红相 11 例覆盖 AC-001/003/004/005/006/007/008；AC-002 首次运行即绿（popup 现状已合规，测试锁定语义）。
- AC-001：`panels` 数组改 `["Settings","Usage","Agent","Session"]`；刷新按钮加 `panel !== "Settings"` 守卫；Usage 图标 `dashboard`→`clock_forward`。
- AC-002：popup TitleBar 现序（刷新 设置 代理面板 会话历史）已与统一语义一致，仅补 `popup_view.test.tsx` 顺序断言，无实现改动。
- AC-003：SessionShell header 改 `relative` + PanelTitleBar `min-w-0 flex-1`（按钮区直达窗口右缘）+ nav 绝对水平居中（`left-1/2 -translate-x-1/2`）并加 `no-drag`（叠在拖拽区上）。
- AC-004：`history`→`session` 全链路：use-route VALID_ROUTES、App case、window-manager WINDOW_CONFIGS/PANEL_TITLES、preload route_api 分权 + preload/index case、usageboard-web hash、main/index 窗口 key。`historyWindowBounds` 持久化键与 session-history IPC/history-window-controller 内部命名按要求保留。
- AC-005：`history-*` CSS 类全量→`session-*`（SessionShell + workspace 六组件 + use-workspace-columns + e2e/单测选择器）；`grep '"history"|#history|history-' src/ tests/e2e/` 路由字面量与 CSS 类名零残留（`history-window-controller` 内部模块命名/日志名按 spec 非范围豁免）。
- AC-006：PanelTitleBar Usage 按钮 clock_forward；**顺带同步** TokenStatsView（t312 Agent 自绘 header）同语义 Usage 按钮 dashboard→clock_forward——同一「用量面板切换按钮」icon 语义，否则 Agent 面板残留 dashboard 与统一目标矛盾（偏离 spec 措辞范围，属同一 AC 语义延伸）。
- AC-007：`chat_square` 从 UI_ICONS 移除（连同 MessageSquare 导入），Icon 组件内联 t274 前手绘双气泡 path（取自 git afd34807^ 的 message-chat-square.svg）；icon.test t274 守卫测试无需改动（内联不引资产路径/文件名）。`dashboard: LayoutDashboard` 映射随最后一个消费者移除（Icon.tsx 清理）。
- AC-008：SettingsView 删返回按钮 + `goBack`（window.close）+ 无用 `Button` 导入。
- 验证：全量 `pnpm test` 2919 passed / 1 failed（designmd.test.ts 存量 drift，base 上同样失败，非回归）/ 9 skipped；`pnpm typecheck`、`pnpm lint`（--max-warnings=0）通过；web e2e `panel_navigation` + `session_panel` 13/13 通过（含 #session 路由与 session-\* 类选择器）。
- 遗留观察：`Icon name="history"`（lucide History）与 `history: History` 映射为 t274 前存量死代码，非本 task 范围未动。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **仅有 minor（无 critical / important）**：Round 1 2 条 minor，处置见下表。

### Round 1 (2026-08-12 00:05 UTC+8)

| finding_id    | severity | status | rationale                                                                                                                               | fix_ref                                                           |
| ------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| t313_gen_f001 | minor    | 遗留   | designmd drift 门禁为基线失败（diff_anchor 上即存在，t313 未动 globals.css）；登记 p142 跟踪，AC-005 字面「全量测试通过」由基线问题限制 | p142                                                              |
| t313_gen_f002 | minor    | 已修   | task.md 自述措辞修正：限定「路由字面量与 CSS 类名零残留」；history-window-controller 内部模块命名按 spec 非范围豁免                     | docs/tasks/t313_panel_buttons_and_session_route_rename/task.md:31 |

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
- 证据：AC-001~008 由 PanelTitleBar/popup/SessionShell/icon/settings_view/window_manager/route_api/usageboard-web 测试覆盖（见 `handoff.json` ac_evidence）；全量 2919 passed，唯一失败为存量 designmd drift（p142）。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS（2 minor：f001 遗留→p142、f002 已修）

`full`：

- N/A（single 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 面板按钮顺序/icon/位置统一 + #history→#session 路由与 CSS 类名改名完成：PanelTitleBar 固定序「设置 用量 代理 会话」+刷新首位、Usage icon clock_forward、chat_square 恢复手绘、SessionShell 按钮贴右上角、SettingsView 删返回按钮；AC 八条全绿，review 1 轮 PASS（2 minor：f001 存量 drift 归 p142、f002 措辞修正）。
