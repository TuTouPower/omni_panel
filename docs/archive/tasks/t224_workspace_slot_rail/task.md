---
tid: "t224"
slug: "workspace_slot_rail"
title: "工作台 8 槽位 rail 与布局切换"
status: "done"
branch: "t224_workspace_slot_rail"
worktree: ""
review_level: "full"
diff_anchor: "f392135dade8531cc72ab2dfeef2e1ed941c5753"
depends_on: "t223"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 2026-08-06 实施

- **Step 1 前置**：`{doctor_cmd}` 无。SPIKE 核实 `recent_sessions` 字段：token-stats `query_sessions` 返回 `TokenStatsSession`（title/date/calls/四维 token 全齐），renderer `tokenStats.getSessions` 透传完整 DTO；但 session-history `sessions_provider`（main/index.ts:365）映射 SessionRow 时缺 calls/token。实现决定 picker/recent 均走 `tokenStats.getSessions` 取数，避免改主进程桥接。
- **架构决策**：
    - 删 `SessionHistoryView.tsx`（484 行 6 栏模型），工作台改挂新建 `WorkspaceView`。消息渲染/推送/分页/选择/复制逻辑迁入 WorkspaceView（`HistoryColumn` 组件原样复用，`session-history.css` 改由 WorkspaceView import）。
    - 槽位纯逻辑抽 `src/renderer/lib/workspace/slots.ts`（8 槽 assign/remove/move/clear、超位拒绝、按 loc 查重、`session_meta` 元数据派生、`effective_columns` 布局降档、`agent_accent` 色映射、`format_tokens`）。
    - 槽位状态用「state + 同步 ref」双维护：`open_session`/最近会话批量打开循环在 React 批处理下读 render-fresh ref 会 stale（t211 同款踩坑），所有槽位写操作先同步 ref 再 set state（`apply_slots`）。
    - 布局：`effective_columns(layout, width)` 按 MIN_COLUMN_WIDTH=375 降档；组件层 `cols = min(effective_columns, count)` 写入 `.slot-grid` 的 `--cols`，CSS `repeat(var(--cols), minmax(0,1fr))`。
    - 入口重接：renderer 侧 `onFocus(loc)` 与 URL `loc` query 都走 `open_session` 装入槽位；已开则滚动聚焦，槽满 toast 拒绝。主进程无需改动。
- **测试**：`workspace_slots.test.ts`（16）+ `WorkspaceView.test.tsx`（20 最终）。旧 `session_history_view.test.tsx`（18）整体删除（语义被槽位模型取代），能力由 WorkspaceView 测试等量补回（reviewer 确认删除合法）。
- **review 处置**：round 1 code 4 important + 5 minor / test 3 important + 3 minor 全部修复；round 2 双 PASS（test round 2 新 2 minor 已修）。要点：agent 色映射归一到 CSS 变量名、`add_session` 同 loc 查重防双槽、`refresh_slot_meta` 走 ref 同步、`confirm_recent` 退订旧槽位防 watcher 泄漏、删 `HistoryOverflowModal.tsx` 死代码。
- **踩坑**：拖拽换位测试用 `getByText` 撞 rail+网格双渲染文本，改 `querySelectorAll(".rail-title")` 定位；picker 行标题含「已打开」角标文本拼接，断言 `["会话一已打开",...]`；recent 标题计数文本「选 2/8」被拆元素，改正则 `/选 2\/8/`。
- **验证**：`pnpm test` 225 files / 2392 passed；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed；黑盒脚本 `.scratch/t224/workspace_blackbox.ts` 驱动 exe 验证空态/布局/弹窗/主题/无旧按钮，PASS。

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

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

### Round 1 (2026-08-06 11:45 UTC+8)

code 审查 4 important + 5 minor；test 审查 3 important + 3 minor。全部已修。

| finding_id     | severity  | status | rationale                                                                                            | fix_ref                                                         |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t224_code_f001 | important | 已修   | agent 色映射：claude_code→claude、kimi_code→kimi 归一到 CSS 变量名                                   | src/renderer/lib/workspace/slots.ts                             |
| t224_code_f002 | important | 已修   | add_session 先 find_slot_by_loc，同 loc 双槽 toast 拒绝                                              | src/renderer/components/workspace/WorkspaceView.tsx             |
| t224_code_f003 | important | 已修   | refresh_slot_meta 基于 ref 计算走 apply_slots，保持 ref/state 同步                                   | src/renderer/components/workspace/WorkspaceView.tsx             |
| t224_code_f004 | important | 已修   | confirm_recent 清空前逐个 unsubscribe 旧槽位                                                         | src/renderer/components/workspace/WorkspaceView.tsx             |
| t224_code_f005 | minor     | 已修   | rail 占用槽补 agent 徽标（色点 + 缩写）                                                              | src/renderer/components/workspace/SessionRail.tsx               |
| t224_code_f006 | minor     | 已修   | 工具条改三区 flex，布局切换器居中                                                                    | src/renderer/components/workspace/WorkspaceToolbar.tsx          |
| t224_code_f007 | minor     | 已修   | 删死代码 HistoryOverflowModal.tsx + layout.grid_class；session-history.css 改由 WorkspaceView import | src/renderer/components/workspace/WorkspaceView.tsx             |
| t224_code_f008 | minor     | 已修   | rail 满槽时「添加会话」disabled                                                                      | src/renderer/components/workspace/SessionRail.tsx               |
| t224_code_f009 | minor     | 已修   | 最近会话弹窗 RECENT_LIMIT=100 上限写 spec 上下文区说明                                               | docs/tasks/t224_workspace_slot_rail/spec.md                     |
| t224_test_f001 | important | 已修   | 补分页测试：初始 limit 200 + load_older before_cursor 前置                                           | tests/unit/renderer/components/workspace/WorkspaceView.test.tsx |
| t224_test_f002 | important | 已修   | 补 picker 测试：搜索/agent 筛选计数/已打开标记                                                       | 同上                                                            |
| t224_test_f003 | important | 已修   | 补 recent 测试：日期倒序/上限 8/顺序角标/disabled                                                    | 同上                                                            |
| t224_test_f004 | minor     | 已修   | 补清除本栏 + 跨槽位计数合计测试                                                                      | 同上                                                            |
| t224_test_f005 | minor     | 已修   | 补 rail 折叠/展开测试                                                                                | 同上                                                            |
| t224_test_f006 | minor     | 已修   | 补布局切换联动网格 --cols 测试                                                                       | 同上                                                            |

### Round 2 (2026-08-06 11:56 UTC+8)

code 复审 PASS（round 1 9 条全部核实消除）；test 复审 PASS（round 1 6 条全部核实消除）。test round 2 新 2 条 minor，已修。

| finding_id     | severity | status | rationale                                    | fix_ref                                                         |
| -------------- | -------- | ------ | -------------------------------------------- | --------------------------------------------------------------- |
| t224_test_f007 | minor    | 已修   | 补 merge_tail 去重（推送重复 id 只渲染一次） | tests/unit/renderer/components/workspace/WorkspaceView.test.tsx |
| t224_test_f008 | minor    | 已修   | 分页测试补「更早消息 DOM 前置」断言          | 同上                                                            |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 rail（色左条/徽标/标题/轮数·tokens/空槽虚线/折叠）：`SessionRail.test`（WorkspaceView 测试折叠）+ `WorkspaceView.test.tsx`（rail 元数据断言）。
    - AC2 拖拽换位：`WorkspaceView.test.tsx` rail 拖拽用例（dragStart/drop 后 rail 顺序交换，与网格同源 `slots_state`）；真实手势标 `[deploy]`。
    - AC3 布局切换 1/2/3/4/6/8 + 降档：`workspace_slots.test.ts`（`effective_columns` 判定）+ `WorkspaceView.test.tsx`（切换后 `.slot-grid --cols` 接线）。真实降档标 `[deploy]`。
    - AC4 picker 搜索/agent 筛选带计数/已打开标记/点行装入：`WorkspaceView.test.tsx` picker 用例。
    - AC5 recent 日期倒序/上限 8/快捷 2/4/8/清空替换：`WorkspaceView.test.tsx` recent 用例。
    - AC6 超位 toast 拒绝且已有槽位不变：`WorkspaceView.test.tsx`「槽位全满」用例。
    - AC7 入口重接（onFocus/URL loc 装入）：`WorkspaceView.test.tsx` 两用例；窗口未开开窗由主进程 SESSION_HISTORY_OPEN 保持，未改动。
    - AC8 全空空态引导：`WorkspaceView.test.tsx` 空态用例。
    - AC9 无栏满弹窗/「最近 6 条」：`HistoryOverflowModal.tsx` 已删死代码；黑盒脚本断言无「最近 6 条」。
    - AC10 实时更新与分页不回归：`WorkspaceView.test.tsx` 推送追加/去重 + 分页（limit 200 + load_older）用例。
- 门禁：`pnpm test` 225 files / 2392 passed；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（4 important + 5 minor，全修）
- Round 1 test：FAIL（3 important + 3 minor，全修）
- Round 2 code：PASS（round 1 全部核实消除）
- Round 2 test：PASS（round 1 全部核实消除；round 2 新 2 minor 已修）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 工作台从 6 栏平铺改为 8 槽位模型（rail/布局切换/两个弹窗/超位拒绝/入口重接），单会话面板能力零回归；删旧 SessionHistoryView 与死代码；d019 登记槽位 ref 双维护/查重/退订三不变量。
