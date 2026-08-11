---
tid: "t312"
slug: "token_stats_header_single_row"
title: "代理面板标题栏一行化（logo/标题/刷新时间/筛选下拉/面板按钮合并）"
status: "done"
branch: "t312_token_stats_header_single_row"
worktree: ""
review_level: "full"
diff_anchor: "e2039aacd962f382f294ea4abc6fb98bb5029d7e"
depends_on: ""
conflicts_with: "t308,t309,t311,t313"
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### t312 实施（2026-08-11）

- 标题区改造：TokenStatsView 不再用 `PanelTitleBar` 面板形态（`panel/onRefresh/onNavigate`），改通用形态（`title/actions`）：title 区 = logo + "Omni Panel - Agent" + 刷新时间（updatedAgo/sourceIssues/刷新中/刷新失败）；actions 区 = 工具/平台/模型/时间范围四个 Select + 刷新/设置/用量面板/会话历史按钮 + 窗口控制（is_web 分支）。PanelTitleBar 组件本体零改动（四面板共用不受影响）。actions 按钮顺序按 AC-001：刷新 → Settings → Usage → Session（改造前面板形态顺序为 Usage → Session → Settings）。
- 平台选项以代码现状为准：`PLATFORM_OPTIONS` 已是 `local|wsl`（t308 后），非 spec 里写的 Win/WSL；未改。
- RangePicker 触发方式：spec 非范围「不改 RangePicker 组件本身（仅改为由时间范围下拉触发）」。为满足 AC-003「选中自定义弹出面板」，给 RangePicker 增加可选受控 `open`/`onOpenChange` props（默认 undefined 时维持原非受控行为，向后兼容）；面板 UI、日期输入、apply 逻辑、active 样式零改动。时间范围下拉选 custom → `setRangePickerOpen(true)`。
- 测试发现 userEvent.selectOptions 在 jsdom 下事件序列为 click → change → click，第二次 click 落在 RangePicker 之外，触发面板「点击外部关闭」逻辑（真实浏览器 click 发生在 change 前，无此问题）。AC-003 测试改用 `fireEvent.change` 模拟选中 custom。
- 刷新按钮语义（与改造前一致）：缓存 fresh 时不重发请求（`query_cache.load` 命中 fresh 缓存直接返回）；测试先经 `onUpdated` 事件 `mark_stale` 再点刷新断言重发。
- e2e：`tests/e2e/web/` 无 token-stats 面板测试先例，web 端需从零 mock 全套 dashboard API（getDashboard/heatmap/sessions），基建成本高；按任务约定只做单测（`token_stats_header.test.tsx` 9 用例覆盖 AC-001..004 结构/交互），AC-005 由既有 33 用例（交互方式适配）保证。
- 既有测试适配：工具/平台/时间范围 Segmented（role=button）→ Select（selectOptions），断言语义不变；Grok 入口断言改查工具下拉 option。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-11 21:40 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                                                             | fix_ref                                                                                                 |
| -------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| t312_code_f001 | minor    | 已修   | spec 契约区平台选项文字同步为「全平台/Local/WSL」（t308 后 env 枚举）                                                                                                                                 | docs/tasks/t312_token_stats_header_single_row/spec.md:12                                                |
| t312_code_f002 | minor    | 已修   | 抽 PanelTitleBar 导出 WindowControls 公共子组件，TokenStatsView 与面板形态共用，消除 26 行 verbatim 重复                                                                                              | src/renderer/components/ui/PanelTitleBar.tsx:WindowControls + src/renderer/views/TokenStatsView.tsx:827 |
| t312_test_f001 | critical | 已修   | 刷新测试拆两条确定路径：fresh 缓存下点刷新不重复请求；事件重取 reject（缓存 stale）后点刷新触发新请求并上屏；AC-001 刷新中改事件 pending 驱动（不点按钮避免竞速）。SessionTable mock 改反映 rows prop | tests/unit/renderer/views/token_stats_header.test.tsx:AC-001/AC-004 三用例                              |
| t312_test_f002 | minor    | 已修   | 补「挂载默认即 30d 窗口」用例（30d 为默认 preset，选择不产生新请求）                                                                                                                                  | tests/unit/renderer/views/token_stats_header.test.tsx:「AC-003: 挂载默认即 1月（30d）窗口」             |

### Round 2 (2026-08-11 21:50 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                                           | fix_ref                                          |
| -------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| t312_code_f003 | minor    | 已修   | PanelTitleBar 面板形态化简为 `<WindowControls onClose={onClose} />`（WindowControls 已内置 is_web 守卫 + onClose 回退）；props 类型显式含 undefined 兼容 exactOptionalPropertyTypes | src/renderer/components/ui/PanelTitleBar.tsx:162 |

### Round 3/4 (2026-08-11 21:55-22:00 UTC+8)

code Round 3 PASS（f003 复核真修，0 finding）；code Round 4 PASS（注释清理）；test Round 3 PASS（0 finding）。无处置项。

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
- 证据：AC-001/002/003/004 由 token_stats_header.test.tsx 12 用例（单行结构、四下拉 Select、过滤生效、时间范围 7d/30d/自定义、刷新两确定路径、三导航按钮）+ token_stats_view.test.tsx 33 适配用例覆盖；AC-005 全量测试绿。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（f001/f002 minor）
- Round 1 test：FAIL（f001 critical）
- Round 2 code：PASS（f003 minor）
- Round 2 test：PASS（f001/f002 复核真修）
- Round 3 code：PASS（f003 复核真修）
- Round 4 code：PASS（注释清理）
- Round 3 test：PASS（0 finding）

`single`：

- N/A（full 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- TokenStatsView 标题区两行合并一行完成：PanelTitleBar 通用形态 + 工具/平台/时间范围 Segmented→Select（含自定义触发 RangePicker）、刷新/设置/用量面板/会话历史按钮、WindowControls 抽公共子组件；AC 五条全绿，review 4 轮 code + 3 轮 test 全 PASS（1 critical + 3 minor 均修）。存量 designmd 失败见 p142。
