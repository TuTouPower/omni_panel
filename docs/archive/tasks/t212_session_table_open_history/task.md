---
tid: "t212"
slug: "session_table_open_history"
title: "会话历史打开入口与面板间导航"
status: "done"
branch: "t212_session_table_open_history"
worktree: ""
review_level: "single"
diff_anchor: "8b3a4081bf91fe8a1384894719928bd47ab39df2"
depends_on: "t210,t211"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE 核实（spec 上下文区改写）：`src/web/usageboard-web.ts` 的 `sessionHistory.open` 是 no-op stub；`select_session_history_api` 仅 history/agent route 给 full。结论：popup/floating 桌面模式显示按钮（真实 IPC），web 模式隐藏（死按钮），守卫 `!is_web()`。历史窗口打开为只读，不依赖 `is_live` 状态；按钮 onClick 用 `is_live ? onOpenHistory : undefined` 仅为高度测量 mirror（is_live=false）抑制交互绑定。
- preload 分权演进（AC9 扩展）：`select_session_history_api` 从两档（full/disabled）扩为三档（full/open_only/disabled）。usage route（托盘 popup / 用量面板）暴露 open_only：`open` 走真实 `SESSION_HISTORY_OPEN`，subscribe/query/recent 保持 disabled 空形状，避免 popup 意外获得历史数据通道。
- 纯跳转入口（无具体会话）：popup TitleBar / TokenStatsView header 调 `sessionHistory.open("", "", "")`；main `SESSION_HISTORY_OPEN` handler 在 `source` 为空时 `open_or_focus(undefined)`，只开/聚焦空窗。TokenStatsView 按钮同样 `!is_web()` 隐藏（web 版 sessionHistory 是 no-op stub，显示即死按钮，与 popup 一致）。
- SessionTable：行首 checkbox 列（td `onClick` stopPropagation 防单击行误触发）+ h3 内「打开历史」按钮（`disabled` 按选中数）+ 单击行 `onOpenSession(r.identity_key)` + 翻页/pageSize/排序（页重置）清空选中（`set_checked(new Set())`）。空态 colSpan 8→9。
- TokenStatsView：identity_key 形如 `source|env|session_id`，split 后逐段 open（`?? ""` 兜底 noUncheckedIndexedAccess）；无管道分隔（session_id 兜底键）的 key 丢弃不打开，避免拆出非法 source；批量循环 open（幂等由 open_or_focus 保证）。
- 批量打开冷启动不丢会话（review f002）：`history-window-controller` 增加 `loading` 标志 + `pending_locs` 缓冲。创建窗口期连续 OPEN 的 loc 先缓冲（send 在 loadURL 途中被丢弃），`did-finish-load` 后统一补发全部；按 key 去重防累积。renderer 侧 `open_session` 已按 loc_key 去重（初始 URL loc 与补发重复只滚动不重复挂载）。
- 会话历史窗口内返回入口：history-toolbar 前部加「用量面板」（`tray.open_panel()`）与「代理面板」（`tokenStats.open()`），与既有 nav 按钮同级。
- Icon.tsx 新增 `history` 图标（时钟+逆时针箭头）；token-stats.css 加 `.t-check` / `.table-actions` / `.open-history-btn` / tbody tr cursor。

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

### Round 1 (2026-08-05 19:10 UTC+8)

| finding_id    | severity  | status | rationale                                                                                                                             | fix_ref                                                      |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| t212_gen_f001 | important | 已修   | `handleSort` 补 `set_checked(new Set())`，与翻页/pageSize 一致；新增「排序清空选中」测试                                              | src/renderer/components/token-stats/SessionTable.tsx:97      |
| t212_gen_f002 | important | 已修   | controller 加 `loading` 标志 + `pending_locs` 缓冲，did-finish-load 统一补发全部定位并按 key 去重；新增批量缓冲/去重/加载后直发三测试 | src/main/core/main-panel/history-window-controller.ts:50-108 |
| t212_gen_f003 | important | 已修   | TokenStatsView「到会话历史」按钮包 `!is_web()` 守卫，与 popup TitleBar 一致；新增 web 隐藏测试                                        | src/renderer/views/TokenStatsView.tsx:724                    |
| t212_gen_f004 | minor     | 已修   | `onOpenSelected`/`onOpenSession` 侧跳过无管道分隔（session_id 兜底）的 key，避免拆出非法 source                                       | src/renderer/views/TokenStatsView.tsx:894,905                |
| t212_gen_f005 | minor     | 已修   | task.md 实施笔记注明 `is_live` gate 用于 mirror 抑制                                                                                  | docs/tasks/t212_session_table_open_history/task.md           |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 明细表 checkbox / 打开历史 / 单击行 / 翻页清空：`session_table.test.tsx`（7 用例：渲染 checkbox、按钮 disabled→enabled、批量按行序传参、单击行打开不改选中态、checkbox 不触发行、翻页清空、排序清空）。
    - AC2 popup TitleBar「会话历史」按钮：`popup_view.test.tsx`（点击调 `sessionHistory.open("", "", "")`；web 模式隐藏）。
    - AC3 代理面板「到会话历史」按钮：`token_stats_view.test.tsx`（点击调 open 空参；web 隐藏）。
    - AC4 窗口内返回入口：`session_history_view.test.tsx`（用量面板 → `tray.open_panel`、代理面板 → `tokenStats.open`）。
    - AC5 OPEN 幂等 + 批量冷启动不丢：`history-window-controller.test.ts`（12 用例，新增批量缓冲/去重/加载后直发）；preload 分权 `route_api.test.ts`（usage → open-only 档）。
    - AC6 既有功能不回归：`pnpm test` 全量 2337 通过（存量 flaky p049/p051 隔离全绿）、typecheck、lint、build 通过。
    - 本批 UI 改动未做浏览器实测：组件测试覆盖交互调用参数，跨窗口真实聚焦 [deploy] 由 t213 手动验收。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：FAIL（important ×3 + minor ×2）
- Round 2 general：PASS（5 条全部以 diff 核实消除，零新 finding）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

t212 交付全部会话历史打开入口与面板间导航：明细表 checkbox 批量 / 单击行、popup TitleBar、代理面板 header、窗口内返回跳转；preload 分权扩三档（usage 仅 open）；批量冷启动补发机制修复。2 轮 review 收尾 PASS，无遗留。
