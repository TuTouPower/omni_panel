# Task review t212（reviewer_focus: 通用）

- task：`t212_session_table_open_history`
- spec：`docs/tasks/t212_session_table_open_history/spec.md`
- diff_anchor：`8b3a4081bf91fe8a1384894719928bd47ab39df2`
- target：`git diff 8b3a4081bf91fe8a1384894719928bd47ab39df2`
- round：1
- reviewed_at：2026-08-05 18:57 UTC+8

验证动作：`npx vitest run`（受影响 5 个测试文件，88 用例全过）、`npx tsc --noEmit` 通过、`npx eslint src tests` 通过。

## Findings

### t212_gen_f001 - SessionTable 排序不清空 checkbox 选中态，违反「选中态仅当前页有效」

- 严重度：important
- 锚点：AC1「checkbox 选中态仅当前页有效，翻页清空」
- 位置：`src/renderer/components/token-stats/SessionTable.tsx:90-98`（`handleSort`）
- 问题：`handleSort` 调 `setPage(1)` 但未 `set_checked(new Set())`；`go_to_page`（行 100-108）与 pageSize 变更（行 314-319）都清了，唯独排序漏了。失败场景：用户在 page 2 勾选若干行 → 点表头排序 → 页面重置到 1，勾选行移出当前页，但 `checked` 集仍保留旧页 keys，「打开历史 (N)」按钮保持可用，点击批量打开不可见会话。即使在 page 1 排序，勾选行也可能被排到当前页 slice 之外，同样残留。直接违反 AC1 的「仅当前页有效」不变量。
- 建议：`handleSort` 内补 `set_checked(new Set())`，与 pageSize/翻页一致。

### t212_gen_f002 - 批量打开在历史窗口冷启动时只送达首个会话，其余 focus 事件被丢弃

- 严重度：important
- 锚点：AC1「点击后历史窗口打开全部勾选会话」
- 位置：`src/renderer/views/TokenStatsView.tsx:893-902`（`onOpenSelected` 循环）+ `src/main/index.ts:390-397`（OPEN handler）+ `src/main/core/main-panel/history-window-controller.ts:69-77`（did-finish-load 补发仅覆盖初始 loc）
- 问题：勾选 N 个会话点「打开历史」，renderer 同步连发 N 个 `SESSION_HISTORY_OPEN`。首个 handler 创建窗口并带初始 loc（`did-finish-load` 补发机制覆盖此 loc）；第 2..N 个 handler 时窗口已存在但仍在 `loadURL` 途中，`send_focus` 走 `webContents.send` 被丢弃（t210_code_f006 已记录同款丢包，补发逻辑只覆盖首个 loc）。冷启动（历史窗口未开）是常见路径，结果窗口只显示第一个会话栏，「打开全部勾选会话」未达成；热窗口下（渲染完成）才全部送达，行为随窗口开闭状态分叉。
- 建议：主进程侧对创建期到达的后续 loc 排队，`did-finish-load` 后按序补发全部 pending loc；或 renderer 侧对批量发送做防丢处理（首个 OPEN 后延迟重发余下 loc）。

### t212_gen_f003 - TokenStatsView header「到会话历史」按钮在 web 模式是死按钮，未应用「web 隐藏死按钮」约定

- 严重度：important
- 锚点：AC3「代理面板 header 出现『到会话历史』按钮，点击打开 / 聚焦历史窗口」+ 上下文区已核实决策「web 模式是死按钮，按钮隐藏，守卫用 `!is_web()`」+ `src/web/usageboard-web.ts:1-7` 顶部约定「Native-only surfaces (tray, window controls) are no-ops; the renderer hides their buttons in web mode」
- 位置：`src/renderer/views/TokenStatsView.tsx:721-730`
- 问题：按钮无条件渲染，未 gate `!is_web()`。web 构建中 `sessionHistory.open` 是 no-op stub（usageboard-web.ts:346），且 web 端可经「代理面板」按钮进入 TokenStatsView（`tokenStats.open` 设 hash=agent，App.tsx:15 渲染 TokenStatsView），用户点「到会话历史」无任何效果。popup TitleBar 同类按钮已按决策用 `!is_web()` 隐藏（TitleBar.tsx:73），此入口漏应用同一约定，两个面板导航按钮行为不一致。
- 建议：按钮包 `!is_web() && (...)` 守卫，与 popup TitleBar 一致。

### t212_gen_f004 - SessionTable checkbox 键与批量 split 语义不一致（identity_key 缺省时参数错位）

- 严重度：minor
- 锚点：无直接 AC（当前数据路径不触发）
- 位置：`src/renderer/components/token-stats/SessionTable.tsx:213-227`（checkbox 键 `identity_key ?? session_id`）+ `src/renderer/views/TokenStatsView.tsx:893-902`（`split("|")`）
- 问题：单行打开有 `if (r.identity_key)` guard（行 202）；checkbox 键却 fallback 到 `session_id`，`onOpenSelected` 会把无 identity_key 行的 session_id 当 `parts[0]`（source）传入 split，batch 参数错位。当前唯一数据路径 `dashboard_session_rows`（TokenStatsView.tsx:154）恒设 identity_key，未触发；属防御缺口，未来新增无 identity_key 数据源时静默出错。
- 建议：checkbox 键与单行打开用同一 guard；identity_key 缺失时行不可勾选，或 `onOpenSelected` 侧跳过无 identity_key 行。

### t212_gen_f005 - task.md 实施笔记「不 gate is_live」与 TitleBar 代码字面不符

- 严重度：minor
- 锚点：无 AC（行为符合意图）
- 位置：`docs/tasks/t212_session_table_open_history/task.md`（实施笔记）+ `src/renderer/views/popup-view/TitleBar.tsx:78`
- 问题：task.md 记「history 窗口打开为只读，不 gate `is_live`」，实际代码 `onClick={is_live ? onOpenHistory : undefined}`。popup 中 live tree 恒 is_live=true、offscreen mirror 恒 false（PopupView.tsx:797,816），该 gate 实为 mirror 抑制，行为与笔记意图一致；但字面不一致可能误导后续维护者移除 gate，导致 mirror 挂上真实 handler。
- 建议：task.md 注明 `is_live` gate 用于 mirror 抑制（live tree 恒 true）。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：5 条（important ×3，minor ×2）
- 未进表的提示：无
- 总体判断：批量打开冷启动丢会话（f002）与排序残留选中（f001）是 AC1 核心行为在常见路径上的可观测缺口；web 死按钮（f003）违反已核实决策。均未解决，FAIL。
- 系统性 follow-up：f002 涉及 SESSION_HISTORY_OPEN 批量语义与窗口创建期补发机制，若不在本 task 修复，建议 follow-up（标题建议「会话历史批量打开冷启动补发」；slug `session_history_batch_coldstart_replay`；阻断性 blocking）。

verdict: FAIL

## Round 2 (2026-08-05 19:21 UTC+8)

验证动作：`npx vitest run`（t212 受影响 6 个测试文件，102 用例全过）、`npx tsc --noEmit` 通过、`npx eslint`（t212 改动源文件）通过。

### 前轮 finding 复核（以 diff 与代码为准）

- **t212_gen_f001（important）已消除**：`handleSort` 在 `setPage(1)` 后补 `set_checked(new Set())`（`src/renderer/components/token-stats/SessionTable.tsx:98-99`），与翻页（行 105-106）、pageSize 变更（行 316 附近）一致。新增测试「clears checked state when sorting resets the page」先勾选再点表头排序，断言按钮回 disabled，真实触达排序清空路径。
- **t212_gen_f002（important）已消除**：`history-window-controller.ts` 增加 `loading` 标志（行 53）与 `pending_locs` 缓冲（行 55）。创建窗口期 `loading = true; pending_locs = [loc]`（行 77-78）；批量后续 OPEN 走 `open_or_focus` 已开分支 → `send_focus(loc)` → loading 中缓冲并按 source/env/session_id 去重（行 103-119）；`did-finish-load` 统一补发全部（行 79-88），并先清 `loading`。`main/index.ts:395` 空 source 走 `open_or_focus(undefined)` 只开/聚焦空窗。3 个新 controller 测试真实驱动 controller（fake window + 手动触发 did-finish-load）：批量三 loc 加载后按序补发 3 次、重复 loc 去重只发 1 次、加载完成后直发不再缓冲，均触达补发路径；预存在测试也补了 load 完成前置。renderer 侧 `open_session` 按 loc_key 去重（SessionHistoryView.tsx:171-180），初始 URL loc 与补发重复只滚动不重复挂载，已核实。
- **t212_gen_f003（important）已消除**：TokenStatsView「到会话历史」按钮包 `!is_web()`（`src/renderer/views/TokenStatsView.tsx:724`），与 popup TitleBar 一致；新增测试「hides the session-history nav button in web mode」（设 `dataset.web=1` 断言按钮不在），且「opens the session history window from the header nav button」断言 `open("", "", "")`。
- **t212_gen_f004（minor）已消除**：`onOpenSelected` / `onOpenSession` 对 `identity_key.split("|")` 长度 ≠ 3 的 key 跳过（TokenStatsView.tsx:894,905），避免无管道分隔兜底键拆出非法 source。未配专门跳过测试，属 minor 修复，代码可核。
- **t212_gen_f005（minor）已消除**：task.md 实施笔记写明「按钮 onClick 用 `is_live ? onOpenHistory : undefined` 仅为高度测量 mirror（is_live=false）抑制交互绑定」，is_live gate 意图已注明。

### 本轮新发现

- 0 条。

### 结论

- 前轮 finding 复核：f001-f005 全部以 diff/代码核实消除，无一残留；未采信处置表自称（处置表断言与代码核实一致）。
- 本轮新发现：0 条。
- 未进表的提示：worktree 内 `node_modules/better-sqlite3` 原生绑定按 NODE_MODULE_VERSION 146 编译，当前 Node v22.13.0 需 127，导致全部 DB 依赖测试（`tests/integration/*`、`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts` 等）失败。与 t212 diff 无关（diff 未触碰 DB 代码），t212 受影响 6 个测试文件全过。建议主仓按当前 Node 重建依赖后跑全量。
- 总体判断：5 条前轮 blocker/minor 全部消除，无新 blocker，PASS。
- 系统性 follow-up：无（f002 已在本 task 内修复，无需 follow-up）。

verdict: PASS
