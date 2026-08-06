---
tid: "t225"
slug: "workspace_pane_alignment"
title: "工作台会话面板交互与 Markdown 渲染对齐"
status: "done"
branch: "t225_workspace_pane_alignment"
worktree: ""
review_level: "full"
diff_anchor: "a386d099db29b0557da237c7a62c904d9e230d33"
depends_on: "t224"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 2026-08-06 实施

- **Step 1 前置**：`{doctor_cmd}` 无。SPIKE 核实 Markdown 依赖：主仓原无；用户确认引入 **react-markdown@10.1.0 + remark-gfm@4.0.1**（demo 同款，MIT，约 120KB）。不装 rehype-raw——react-markdown v10 默认丢弃原始 HTML，满足「不把会话 HTML 当 HTML 执行」安全约束。
- **架构决策**：
    - 重做 pane：删 `HistoryColumn.tsx`/`HistoryMessageRow.tsx`/`session-history.css`，新建 `SessionPane`（头部 agent 色条/徽标含 model/标题/cwd/meta + hover 操作、消息区 Markdown 渲染/时间分隔线/回到底部/骨架屏、大纲抽屉、脚部槽位号+计数、聚焦模式）。`PaneData` 从 HistoryColumn 迁到 `lib/workspace/pane.ts`。
    - `MarkdownMessage` 封装 react-markdown + remark-gfm，默认无 rehype-raw（XSS 安全硬约束）。
    - pane 纯函数 `lib/workspace/pane.ts`：`should_insert_divider`（10 分钟阈值）、`summarize`（大纲摘要）、`message_counts`、`is_near_bottom`（回到底部阈值 120px）。
    - 聚焦/大纲/视图开关状态在 WorkspaceView：`focused_index`/`outline_index`/`view`（show_time/compact 全局下发所有 pane）。快捷键 `1-8` 聚焦槽位、`[`/`]` 循环切换（无聚焦首入循环聚焦第一占用槽）、`Esc` 逐层退出（大纲→聚焦→普通）。
    - `SlotSession` 补 model/cwd 字段（session_meta 派生），pane 头部展示。
- **测试**：`workspace_pane.test.ts`（13）+ `MarkdownMessage.test.tsx`（6，含 HTML 不执行安全断言）+ `SessionPane.test.tsx`（7，含 missing 空态）+ `WorkspaceView.test.tsx` 增补（聚焦/快捷键含 Esc 逐层/视图开关 4 条 + 4 条适配新 pane 语义）。删 `HistoryMessageRow.test.tsx`（组件被 MarkdownMessage/SessionPane 取代）。
- **review 处置**：round 1 code 2 important + 2 minor / test 3 important + 2 minor 全部修复。要点：SlotSession 补 model/cwd、聚焦索引残留清理、`[ ]` 首槽、死 CSS 清理、is_near_bottom/Esc 逐层/missing 空态补测。
- **踩坑**：jsdom 无真实布局，`is_near_bottom` 测试数据须避免 scrollTop 超界（浏览器 clamp 视为底部）；大纲滚动定位测试给目标消息行注入 scrollIntoView stub 而非改 Element.prototype（lint unbound-method 拒）。
- **验证**：`pnpm test` 227 files / 2417 passed；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed；黑盒脚本 `.scratch/t225/pane_blackbox.ts` 驱动 exe 验证视图菜单/聚焦/Esc/大纲，PASS。

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

### Round 1 (2026-08-06 13:28 UTC+8)

code 审查 2 important + 2 minor；test 审查 3 important + 2 minor。全部已修。

| finding_id     | severity  | status | rationale                                                                  | fix_ref                                                         |
| -------------- | --------- | ------ | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| t225_code_f001 | important | 已修   | SlotSession 补 model/cwd，session_meta 派生，pane 头部展示徽标 title + cwd | src/renderer/lib/workspace/slots.ts、SessionPane.tsx            |
| t225_code_f002 | important | 已修   | close_slot/clear_all/confirm_recent 清 focused_index/outline_index         | src/renderer/components/workspace/WorkspaceView.tsx             |
| t225_code_f003 | minor     | 已修   | 删 workspace.css 死 `.slot-pane > .history-column`                         | src/renderer/styles/workspace.css                               |
| t225_code_f004 | minor     | 已修   | `[`/`]` 无聚焦时首次聚焦第一个占用槽                                       | src/renderer/components/workspace/WorkspaceView.tsx             |
| t225_test_f001 | important | 已修   | 补 is_near_bottom 纯函数 + 回到底部阈值判定测试                            | tests/unit/renderer/lib/workspace_pane.test.ts                  |
| t225_test_f002 | important | 已修   | 补 Esc 逐层退出（大纲→聚焦→普通）测试                                      | tests/unit/renderer/components/workspace/WorkspaceView.test.tsx |
| t225_test_f003 | important | 已修   | 补 source missing 空态测试                                                 | tests/unit/renderer/components/workspace/SessionPane.test.tsx   |
| t225_test_f004 | minor     | 已修   | 消息行角色/时间/null 分支由 MarkdownMessage + SessionPane 测试覆盖         | tests/unit/renderer/components/workspace/SessionPane.test.tsx   |
| t225_test_f005 | minor     | 已修   | 视图开关作用全部 pane（单 pane 验证 + 实现按 view 状态全局下发）           | src/renderer/components/workspace/WorkspaceView.tsx             |

### Round 2 (2026-08-06 13:36 UTC+8)

code 复审 FAIL（f001 修不彻底）；test 复审 round 2 PASS。f001 修复续记在 Round 3；f002 回归用例补入 workspace 测试。test round 2 新 2 minor（f006 model/cwd 无断言、f007 聚焦清理无回归测）已随 round 3/4 处理。

### Round 3 (2026-08-06 13:38 UTC+8)

code 复审 FAIL（f001 model 可见文本未兑现）。已修：pane meta 行直接渲染 model 可见文本，测试断言升级 `screen.getByText(/claude-sonnet-4/)`；补「关闭聚焦槽位不残留聚焦态」回归用例（f007）。

### Round 4 (2026-08-06 13:46 UTC+8)

code 复审 PASS（f001 blocker 全部消除，0 新 finding）。test 复审 round 2 PASS。
| t000_test_f002 | minor | 遗留 | 一句话 | pNNN |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 头部 agent 色条/徽标（含 model）/标题/cwd/meta/hover 操作：`SessionPane.test.tsx`（徽标 title 含 model、meta 行含 cwd/model、轮数/tokens）。
    - AC2 Markdown 渲染含 HTML 不执行：`MarkdownMessage.test.tsx`（标题/列表/表格/代码块/GFM 任务列表/HTML script+img onerror 不执行）。
    - AC3 时间分隔线：`SessionPane.test.tsx`（12 分钟差插入 1 条分隔线）+ `workspace_pane.test.ts`（should_insert_divider 边界）。
    - AC4 回到底部：`workspace_pane.test.ts`（is_near_bottom 阈值）；真实滚动标 `[deploy]`。
    - AC5 大纲抽屉：`SessionPane.test.tsx`（行列表 + 点击 scrollIntoView 定位）。
    - AC6 聚焦模式：`WorkspaceView.test.tsx`（聚焦激活/退出 + 关闭聚焦槽不残留聚焦态）。
    - AC7 脚部槽位号 + 计数：`SessionPane.test.tsx`。
    - AC8 视图开关显示时间戳/紧凑：`WorkspaceView.test.tsx`（切换后 pane 时间显示/compact 类即时生效）。
    - AC9 快捷键 1-8/[ ]/Esc 逐层：`WorkspaceView.test.tsx`（1-8 聚焦、[ ] 循环、Esc 大纲→聚焦→普通）。
    - AC10 推送/分页锚定/missing 空态/初始定位不回归：`WorkspaceView.test.tsx` 既有用例 + `SessionPane.test.tsx` missing 空态。
- 门禁：`pnpm test` 227 files / 2418 passed；typecheck/lint 全绿；`pnpm build` 成功；`pnpm package` + `pnpm test:packaged` 4 passed。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（2 important + 2 minor，全修）
- Round 1 test：FAIL（3 important + 2 minor，全修）
- Round 2 code：FAIL（f001 model/cwd 回填不彻底，round 3 修）
- Round 2 test：PASS
- Round 3 code：FAIL（f001 model 可见文本，round 4 修）
- Round 4 code：PASS（f001 blocker 全部消除，0 新 finding）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 会话面板重做：Markdown 渲染（react-markdown+remark-gfm，无 rehype-raw 安全）、时间分隔线/回到底部/骨架屏、大纲抽屉、聚焦模式、脚部计数、视图开关、快捷键；d020 登记 react-markdown 默认丢原始 HTML 事实。
