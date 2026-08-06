# Task review t224（reviewer_focus: 代码）

- task：`t224_workspace_slot_rail`
- spec：`docs/tasks/t224_workspace_slot_rail/spec.md`
- diff_anchor：`f392135dade8531cc72ab2dfeef2e1ed941c5753`
- target：`git diff f392135dade8531cc72ab2dfeef2e1ed941c5753`
- round：1
- reviewed_at：2026-08-06 11:24 UTC+8

## Findings

### t224_code_f001 - rail agent 色左条：claude_code / kimi_code 回退为 lime

- 严重度：important
- 锚点：AC1「占用槽位显示 agent 识别色左条」—— claude_code（主 agent）与 kimi_code 槽位的左条显示 lime 而非 agent 色。
- 位置：`src/renderer/lib/workspace/slots.ts:127-130`（`agent_accent`）；`src/renderer/styles/session-shell.css:37-43,121-127`（CSS 变量）
- 问题：`agent_accent` 用 `source.replace(/_/g, "-")` 生成变量名。`claude_code → --agent-claude-code`、`kimi_code → --agent-kimi-code`，但 CSS 只定义了 `--agent-claude` / `--agent-kimi`（demo 风格，AgentId 为 `claude` / `kimi`）。两变量不存在 → `var(..., var(--accent-lime))` 回退 lime。4 个 source 中 2 个（含最常用的 Claude）颜色错误。`opencode` / `grok` 因 slug 恰与变量名一致而正常。
- 建议：统一映射。把 source 归一到 CSS 变量名（如 `claude_code→claude`、`kimi_code→kimi`），或按 `agent_slug` 约定补 `--agent-claude-code` / `--agent-kimi-code` 两个变量。任选其一，需与 `agent_slug`（markdown.ts）展示口径一致。

### t224_code_f002 - picker 允许把已打开会话装入第二个槽位 → 同 loc 双槽，关闭其一破坏另一个

- 严重度：important
- 锚点：AC4「已打开的会话有『已打开』标记」仅标记、不阻止；AC10「装入槽位的会话保持实时更新……不回归」。输入：槽 0 已开 sess_a；点空槽 5 → picker 选 sess_a（显示「已打开」）→ 装入槽 5。随后关闭槽 5。
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:263-275`（`add_session` 无查重）
- 问题：`add_session` 直接 `try_assign_slot`，不先 `find_slot_by_loc`。同一 loc 装入两个槽位后：`columns` 按 `loc_key` 键控，第二槽 `mount_column` 覆盖同一列数据，两个 HistoryColumn 渲染同一份；订阅以 webContents id 为 subscriber（`session-history-ipc.ts:67`），同 loc 重复 subscribe 幂等共享一个 watcher。关闭任一槽（`close_slot`）调用 `unsubscribe(loc)` 会整体移除该 loc 订阅并删除 `columns` 键，另一槽随即显示永久「加载中…」兜底列，实时更新停止。
- 建议：`add_session` 先 `find_slot_by_loc(slots_ref.current, ...)`，命中则关闭 picker 并滚动聚焦已有槽（或 toast），不新建槽位。

### t224_code_f003 - refresh_slot_meta 绕过 slots_ref 直接 set_slots_state，违反「先同步 ref」不变量

- 严重度：important
- 锚点：行为缺陷（状态不一致）。`WorkspaceView.tsx:79-86` 注释明确声明「所有槽位写操作先同步 ref 再 set state」；`refresh_slot_meta` 是唯一直接 `set_slots_state` 的写路径，未同步 ref。
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:149-177`（直写点在 156）
- 问题：`refresh_slot_meta`（mount 时异步 IPC）完成后 `slots_state` 含真实 title/calls/tokens，但 `slots_ref.current` 仍是装入时的占位 meta。此后任何基于 ref 的写操作（`move_slot_ui`、`open_session`、`add_session`）会用 stale ref 整块 `apply_slots`，把已刷新的 meta 回退为 session_id / 0 轮 / 0 tokens。典型触发：最近会话「清空并替换全部槽位」连开 8 个 → 8 个 meta 刷新全部落在 ref 之后 → 用户首次拖拽任一槽位，8 个槽位 meta 全部回退。
- 建议：`refresh_slot_meta` 改为基于 `slots_ref.current` 计算 next 并走 `apply_slots`（保持 ref 与 state 同步），或至少在同一回调里同步 `slots_ref.current`。

### t224_code_f004 - RecentSessionsModal 确认替换不退订旧槽位，订阅 watcher 泄漏

- 严重度：important
- 锚点：spec 风险与回退节「槽位模型替换影响订阅生命周期（槽位移除=退订、窗口销毁注销全部）」。`confirm_recent` 清空槽位未退订。
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:468-480`（`confirm_recent`）
- 问题：确认「清空并替换全部槽位」时只 `apply_slots(clear_slots())` + `set_columns({})`，未像 `clear_all`（309-321）那样对 `slots_ref.current` 逐个 `unsubscribe`。被替换会话的 watcher（2s 轮询，`subscription-service.ts:241-243`）继续存活，直到窗口销毁的 `destroyed` 钩子才清理（`session-history-ipc.ts:84-86`）。窗口常驻期间反复替换会累积存量 watcher。
- 建议：`confirm_recent` 清空前先循环 `slots_ref.current` 逐个 unsubscribe（复用 `clear_all` 的退订逻辑）。

### t224_code_f005 - rail 占用槽缺「徽标」，SlotSession.agent 字段未展示

- 严重度：minor
- 锚点：AC1「占用槽位显示 agent 色左条、徽标、标题与 `轮数 · tokens`」。
- 位置：`src/renderer/components/workspace/SessionRail.tsx:57-95`；`src/renderer/lib/workspace/slots.ts:15-22`
- 问题：占用槽渲染 `rail-accent`（色左条）+ `rail-title` + `rail-sub`，无 demo 的 AgentBadge（色点 + 缩写）式徽标。`session_meta` 计算的 `SlotSession.agent` 字段无任何展示消费。
- 建议：如需对齐 demo，补 agent 徽标（如色点/缩写）；若左条已视为识别元素，则在 spec/结论说明缺徽标为有意精简，并删 `agent` 死字段。

### t224_code_f006 - 布局切换器未居中

- 严重度：minor
- 锚点：范围「居中布局切换器（1/2/3/4/6/8）」。
- 位置：`src/renderer/styles/workspace.css:49-56`（`.ws-layout-switch { margin-left: auto }`）
- 问题：`margin-left:auto` 把切换器推到工具条右侧（其后还有「复制」「计数」），非居中。
- 建议：改用绝对居中或 flex 三区布局（左：最近会话/清空，中：切换器，右：复制/计数）。

### t224_code_f007 - 6 栏模型替换后遗留死代码

- 严重度：minor
- 锚点：AC9 旧交互不存在（实现已达成），但源码树遗留未引用物。
- 位置：`src/renderer/components/session-history/HistoryOverflowModal.tsx`（整体未引用）；`src/renderer/lib/session-history/layout.ts:9`（`grid_class` 无调用）；`src/renderer/styles/session-history.css`（无 import）
- 问题：`SessionHistoryView` 整体删除后，仅被它引用的 overflow 弹窗组件、`grid_class`、`session-history.css` 成为死代码。
- 建议：随本 task 清理，或登记 follow-up 再删。

### t224_code_f008 - 槽位满时「添加会话」仍打开指向占用槽位的 picker

- 严重度：minor
- 锚点：AC6 超位 toast 拒绝。功能满足，但 UX 与 demo 不一致。
- 位置：`src/renderer/components/workspace/SessionRail.tsx:99-109`（`first_empty === -1 ? 0 : first_empty`）
- 问题：满 8 槽时点底部「添加会话」`on_pick(0)` 打开目标为槽 1（已占用）的 picker，选中后 toast「该槽位已有会话」而非「槽位已满」；demo 中满时按钮 disabled。
- 建议：满时 disabled 按钮（`disabled={first_empty === -1}`）或提示槽位已满。

### t224_code_f009 - 最近会话「全部会话」实为最近 100 条

- 严重度：minor
- 锚点：AC5「全部会话按日期倒序多选」。
- 位置：`src/renderer/components/workspace/RecentSessionsModal.tsx:10,18-34`（`RECENT_LIMIT = 100`）
- 问题：`tokenStats.getSessions({ limit: 100 })` 只取最近结束的 100 条，超出部分不可选，与「全部会话」字面不符。属有意的 pragmat 截断。
- 建议：确认口径；若坚持「全部」，需在 AC/结论注明 100 条上限。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：9 条（f001-f004 important；f005-f009 minor）
- 未进表的提示：
    - 文件过大（新建即超 minor 阈值，按降级规则不入 finding 表）：`src/renderer/components/workspace/WorkspaceView.tsx` 607 行、`src/renderer/styles/workspace.css` 749 行。两者均为本 task 新建且超 400 行 minor 阈值，建议后续拆分；未达 800 important 阈值。
    - 圈复杂度：未发现单函数 ≥15 CC；WorkspaceView 主渲染与回调均未超阈值，无提示。
    - 范围外观察：无。
- 总体判断：槽位状态模型、布局降档、超位拒绝、全空空态、入口重接（onFocus/URL loc）主线实现完整且被测试覆盖；但存在 4 个 important：agent 色左条映射错误（AC1 视觉失效）、picker 允许同 loc 双槽导致关闭破坏另一槽、`refresh_slot_meta` 违反 ref/state 同步不变量、最近会话替换不退订旧 watcher。未解决即 FAIL。
- 系统性 follow-up：无（死代码清理可并入本 task 或单独 repo-hygiene，不阻断）。

verdict: FAIL

## Round 2 (2026-08-06 11:49 UTC+8)

### 前轮 finding 复核（以 `git diff f392135d` 与代码为准，不采信 task.md 自述）

- f001（important，agent 色映射）：已消除。`src/renderer/lib/workspace/slots.ts:128-137` 新增 `AGENT_COLOR_VAR` 归一映射 `claude_code→--agent-claude`、`kimi_code→--agent-kimi`、`opencode→--agent-opencode`、`grok→--agent-grok`；`src/renderer/styles/session-shell.css:37-43,121-127` 在暗/亮两主题均定义这 4 个变量。`agent_accent` 对未知 source 的 fallback 走 `--agent-opencode`（已定义），不再回退 lime。f001 涉及的最常用 claude_code 左条颜色已正确。
- f002（important，picker 同 loc 双槽）：已消除。`WorkspaceView.tsx:271-277` `add_session` 在 `try_assign_slot` 前先 `find_slot_by_loc(slots_ref.current, loc)`，命中则 toast「该会话已在槽位 N」并 `set_picker_target(null)`，不新建槽位。同 loc 双槽共享订阅/列数据、关闭其一破坏另一槽的路径被阻断。
- f003（important，refresh_slot_meta 违反 ref/state 同步）：已消除。`WorkspaceView.tsx:149-182` 改为基于 `slots_ref.current.map(...)` 按 `loc_key` 匹配计算 next，统一走 `apply_slots`（先同步 ref 再 set state），与文件头声明的「所有槽位写操作先同步 ref」不变量一致。多槽并发刷新各自按当前 ref 匹配 loc，不再整块回退旧 meta。
- f004（important，confirm_recent 不退订）：已消除。`WorkspaceView.tsx:485-493` 清空前对 `slots_ref.current` 逐个 `unsubscribe`（与 `clear_all` 同款逻辑），再 `apply_slots(clear_slots())`。renderer→main IPC 消息 FIFO 有序，退订先于后续 `open_session` 的订阅处理，无订阅竞态。
- f005（minor，rail 缺徽标）：已消除。`SessionRail.tsx:85-90` 渲染 `.rail-badge`（色点底 + `agent_initial` 缩写）；`workspace.css:213-225` 有 `.rail-badge` 样式。AC1「色左条 + 徽标 + 标题 + 轮数·tokens」齐备。
- f006（minor，布局切换器未居中）：已消除。`WorkspaceToolbar.tsx` 改三区 flex（left/居中/right）；`workspace.css:57-65` `.ws-layout-switch` 用 `margin-left:auto; margin-right:auto` 在左右区之间居中。
- f007（minor，死代码）：已消除。`HistoryOverflowModal.tsx` 已删除；`layout.ts` 的 `grid_class` 已移除（仅剩 `HISTORY_PAGE_SIZE`）；`session-history.css` 由 `WorkspaceView.tsx:25` import。`src/` 下无 `HistoryOverflowModal`/`grid_class`/`SessionHistoryView` 残留引用。
- f008（minor，满槽「添加会话」仍开 picker）：已消除。`SessionRail.tsx:117` 底部「添加会话」`disabled={first_empty === -1}`，满 8 槽时不可点。
- f009（minor，最近会话 100 条上限未说明）：已消除。`spec.md`「风险与回退」新增 `RECENT_LIMIT=100` 截断说明，与 `RecentSessionsModal.tsx:10,21` 一致。

### 本轮新发现

0 条。修复过程未引入新的行为缺陷：f003 的 `refresh_slot_meta` 在目标槽已关闭/替换时 `apply_slots(map(...))` 仅产生一次等价数组的冗余 setState（无害重渲染），不构成 bug；f004 的双退订不存在（清空后经 `open_session` 重新订阅同 loc 属合法重建）。

### 未进表的提示

- 文件过大（新建/净增超 400 行 minor 阈值，未达 800，按降级规则不入 finding 表）：`src/renderer/components/workspace/WorkspaceView.tsx` 629 行、`src/renderer/styles/workspace.css` 780 行。Round 1 已提示；本轮 f003/f004 修复净增约 22 行，仍建议后续拆分，不阻断。
- 相邻观察（非新 finding，未引入）：picker「已打开」标记按 `session_id` 键控（`SessionPickerModal.tsx:132`、`WorkspaceView.tsx:609-611`），而 f002 查重按完整 loc（source/env/session_id）。同一 session_id 跨 source 时标记会误标「已打开」但 `add_session` 仍可装入。会话 id 实际唯一，属边缘展示瑕疵，既有行为非本 task 引入，不进表。
- 圈复杂度：未发现单函数 ≥15 CC；无提示。
- 范围外观察：无。

### 总体判断

Round 1 全部 4 important + 5 minor 均已按代码核实消除，无新 blocker。仅余文件膨胀与上述边缘展示观察（minor 级）。满足 PASS。

verdict: PASS
