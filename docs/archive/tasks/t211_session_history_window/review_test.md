# Task review t211（reviewer_focus: 测试）

- task：`t211_session_history_window`
- spec：`docs/tasks/t211_session_history_window/spec.md`
- diff_anchor：`2077e331ac5c55a1e3d710ff9c6fee7375217616`
- target：`git diff 2077e331ac5c55a1e3d710ff9c6fee7375217616`
- round：1
- reviewed_at：2026-08-05 17:00 UTC+8

## Findings

### t211_test_f001 - AC 4 消息行渲染（pre / 角色区分）零断言，HistoryMessageRow 整组件无测试

- 严重度：important
- 锚点：AC「消息以纯文本 + pre 渲染，user 与 assistant 可区分，时间戳显示到分钟、悬停显示完整时间。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx`（全文件）；未覆盖组件 `src/renderer/components/session-history/HistoryMessageRow.tsx`
- 问题：消息行渲染的三个 AC 面完全没有断言：`.history-msg-text` 是否 `<pre>` 元素（决策 11 纯文本 + pre 保留换行缩进）、角色标签「用户」/「Agent」是否区分、时间戳 HH:MM 显示与悬停完整时间。现有 10 个 view 测试只用 `screen.getByText(文本)` 断言消息文本出现，能证明文本渲染在 DOM，但无法捕捉「丢 pre 元素」「角色标签恒为一种」「时间不渲染」等回归。`HistoryMessageRow`（diff 新增 42 行，消息展示的唯一实现）无任何直接测试；时间格式化虽在 `session_history_markdown.test.ts` 测到纯函数层，但组件接线（调 `format_time_short`/`format_time_full`、role 映射）未验证。父审阅清单明确点名「消息 pre 渲染」为需核对 AC。该面不在上下文区「有意不测」之列。
- 建议：在 view 测试补一条断言：`document.querySelector(".history-msg-text")?.tagName === "PRE"`，并断言同一栏 user 与 assistant 消息分别显示「用户」与「Agent」标签；对含时间戳消息断言 HH:MM 文本。

### t211_test_f002 - AC 11 分页数据加载逻辑零测试，与测试策略「单测只测分页数据加载逻辑」相悖

- 严重度：important
- 锚点：AC「长会话虚拟滚动，初始加载最近 200 条，向上加载更早；新增消息追加尾部不打断当前滚动位置。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx`（全文件）；生产逻辑 `src/renderer/views/SessionHistoryView.tsx:71-100`（load_older）
- 问题：虚拟滚动的分页数据加载逻辑（spec 有意不测仅豁免「像素级滚动位置」，明确单测只测分页数据加载逻辑）完全未测：所有 `query` mock 均返回 `next_cursor: null`，无任何测试触发栏顶部滚动 `on_load_older`，未断言初始 `query` 以 `{ limit: HISTORY_PAGE_SIZE }`（200）调用，未断言向上翻页携带 `before_cursor`、前置插入结果、并发锁（`loading_older_locks`）与 `next_cursor` 更新。`load_older` 是 diff 新增约 30 行带并发控制的关键逻辑（滚动到顶重复触发场景），一旦前置页重复、丢失或位置错乱，现有测试全绿。t210 的 subscription-service 测试覆盖主进程 query 分页，但不覆盖 renderer 视图消费侧。
- 建议：补一条 view 测试：`query` 首次返回 `next_cursor` 非空 + 部分消息，触发 `fireEvent.scroll` 到顶后断言 `query` 以 `{ limit: 200, before_cursor }` 调用、更早消息前置到列表前部。

### t211_test_f003 - AC 12 的 5s 兜底拉取未测

- 严重度：minor
- 锚点：AC「订阅推送到达时对应栏追加新消息；5s 兜底拉取生效。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:223-246`（仅推送路径）
- 问题：推送追加（onMessagesUpdated）已测；`setInterval(FALLBACK_MS)` 5s 兜底对 ready 栏 query 尾部合并未测（需 fake timers）。AC 12 前一半有测试，后一半无。属「可补 case」，不阻断。
- 建议：`vi.useFakeTimers()` 推进 5s，断言 ready 栏触发 query 且新消息并入。

### t211_test_f004 - AC 7 复制反馈「1.5s 恢复」未验证

- 严重度：minor
- 锚点：AC「复制后按钮变『已复制 ✓』1.5s。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:190`
- 问题：已断言复制后显示「已复制 ✓」（`getByText(/已复制 ✓/)`），但 1500ms 后恢复「复制 N 条」未测。无 fake timers，生产 `setTimeout(1500)` 恢复路径无证据。
- 建议：fake timers 推进 1500ms 断言按钮恢复复制文案。

### t211_test_f005 - AC 8 模态「可取消」「列出 6 个会话」未断言

- 严重度：minor
- 锚点：AC「…弹模态框列出 6 个会话，关闭至少 1 个后新会话入栏；取消则不入栏。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:115-141`
- 问题：模态测试覆盖「弹窗、确认前禁用、勾选后入栏」；「列出 6 个会话」内容与「取消则不入栏」路径未测（`HistoryOverflowModal.tsx:63` 的取消按钮、`on_cancel` 未触达）。入栏后 6 栏列表项无断言。
- 建议：断言 dialog 内列出 6 个会话标题；补一条点「取消」后 `6/6` 不变、无新订阅。

### t211_test_f006 - AC 1 三到六栏两列网格分支未断言

- 严重度：minor
- 锚点：AC「窗口按分栏规则渲染 1~6 个会话栏，每栏独立滚动…」分栏规则「3~6 会话两列网格」。
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:79-80,95`
- 问题：`grid_class`（`layout.ts:9-11`）的 `single` 分支已在 1 栏、2 栏测试断言；3~6 栏的 `history-grid`（两列）分支无断言（超 6 测试渲染 6 栏但只断言 `6/6` 计数）。`layout.ts` 纯函数本身也无直接单测。spec 测试策略把「分栏布局类名」列为断言目标，另一分支缺覆盖。
- 建议：超 6 测试中补一条 `grid?.className` 不含 `single`；或对 `grid_class` 补纯函数断言（1/2→single，3/6→grid）。

### t211_test_f007 - AC 3「最近 6 条」未断言以 `{ limit: 6 }` 查询

- 严重度：minor
- 锚点：AC「点击『最近 6 条』后，查询最近 6 条会话并在窗口内打开…」。
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:98-113`
- 问题：测试验证 getSessions 返回的 3 个会话被打开并显示标题（触达真实 `recent_six` → `open_session` → `mount_column`），但未断言 `tokenStats.getSessions` 以 `{ limit: 6 }` 调用，`limit: 6`（spec 明确「复用现有 getSessions { limit: 6 }」）无证据。实际打开逻辑已测，此面属「补一条参数断言」。
- 建议：`expect(ub.tokenStats.getSessions).toHaveBeenCalledWith({ limit: 6 })`。

### t211_test_f008 - AC 5 跨栏选中与刷新保留未测

- 严重度：minor
- 锚点：AC「消息可点选，跨栏选中；栏头显示已选数并支持全选本栏 / 清除；刷新后选中保留。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:143-164`（单栏选择）
- 问题：勾选 / 全选 / 清除已测（单栏）；「跨栏选中」与「选中集按消息 id 跨刷新保留」（决策 8）无测试。选中集为全局 Set（`selection_key` 含 loc），单栏测试已覆盖同一 toggle 路径，跨栏与刷新保留属机制自然结果，属「补 case」。
- 建议：双栏各勾 1 条断言总计数 2；推送追加新消息后断言已选计数不变。

## 结论

- 前轮 finding 复核（Round 1 无前轮）：无
- 改测方向复核：`tests/unit/route_values.test.ts` 的 VALID_ROUTES 闭合集断言随新增 `history` 路由从「四 routes」改「五 routes」，由规格变化（`use-route.ts` 合法增 route）驱动，非迁就实现；App.tsx 的 route->view 字符串断言未同步断言 `case "history"`（不构成弱化，`use-route` 侧已兜底）。无「迁就实现」改测。
- 本轮新发现：8 条（2 important + 6 minor）
- 未进表的提示：`tests/unit/route_values.test.ts:44` 的 App.tsx switch 测试标题仍写「four routes」且未断言 `case "history"`，可顺手更新（minor 以下，不阻断）。复制反馈测试中 `getByText(/已复制 ✓/)` 位于 waitFor 之后、未包 act，依赖微任务 flush，存在理论 flaky（本次实跑全绿，非假绿）；可在 `waitFor(() => getByText(/已复制 ✓/))` 中消除。
- 总体判断：复制 Markdown 生成器纯函数（决策 9 格式：分节 / `---` 隔离 / 角色粗体 / 时间升序 / 空节 / null 标题回退）覆盖扎实，选中集状态机与超 6 模态主路径断言触达真实生产逻辑，mock 边界合理（仅 t210 preload API + 剪贴板）；但消息行渲染（pre / 角色区分，f001）与虚拟滚动分页数据加载（f002）两条 AC 面无任何测试，均未在「有意不测」豁免内，需补测后过下一轮。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-05 17:32 UTC+8)

### t211_test_f009 - AC 1 单栏关闭 ×（close_column）路径零测试

- 严重度：minor
- 锚点：AC「窗口按分栏规则渲染 1~6 个会话栏，每栏独立滚动，栏头含 agent、标题、关闭 ×。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx`（全文件未触达 `HistoryColumn.tsx:97-104` 关闭按钮与 `SessionHistoryView.tsx:184-195` close_column）
- 问题：栏头「关闭 ×」按钮渲染与点击行为无测试。现有 14 个 view 测试只经「清空全部」批量路径覆盖 unsubscribe；单栏 × → on_close → close_column（unsubscribe + 过滤栏 + 按 loc 前缀清理选中集 `close_column` 的 `k.startsWith(key|)` 删除）未被触达。若 close_column 漏过滤栏或漏清理选中，现有测试全绿。栏移除与选中清理属用户可观察行为，AC 1 栏头关闭 × 面缺覆盖。
- 建议：开 2 栏各选 1 条，点其中一栏 aria-label「关闭会话栏」按钮，断言该栏标题消失、计数变 1/6、对应 unsubscribe 被调、工具栏合计降为 1。

### t211_test_f010 - AC 8 模态「取消则不入栏」路径仍无测试

- 严重度：minor
- 锚点：AC「…关闭至少 1 个后新会话入栏；取消则不入栏。」
- 位置：`tests/unit/renderer/views/session_history_view.test.tsx:129-157`（仅覆盖确认路径）
- 问题：Round 1 f005 的取消面仍未补：HistoryOverflowModal 的「取消」按钮 → on_cancel → `set_pending([])` 不入栏（`SessionHistoryView.tsx:419-421`）无断言。6 栏满后第 7 个触发模态，点「取消」应断言计数保持 6/6、无新 subscribe。f005 只修了「列出 6 会话」一半，取消路径无证据。
- 建议：模态测试补一条：点「取消」后断言 6/6 不变、`subscribe` 未被以新 loc 调用。

## 结论

- 前轮 finding 复核（以 diff/代码为准，不采信处置表自称）：
    - f001（important）：已消除。`HistoryMessageRow.test.tsx`（untracked，5 case）逐条触达生产组件：`text.tagName === "PRE"`、角色「用户」/「Agent」、短时间文本 + `title` 完整时间、`timestamp null` 不渲染 `.history-msg-time`、checkbox checked 态 + `onToggle(m5)` 回调；实跑全绿。
    - f002（important）：已消除。分页测试真实触发 onScroll→handle_scroll→load_older（`HistoryColumn.tsx:71-77` 真实 handler：scrollTop=0 ≤ 120、next_cursor 非空、非 loading），未 mock 被测逻辑；断言初始 `{ limit: 200 }`、翻页 `{ limit: 200, before_cursor: "cursor-1" }`、前置顺序 `rows[0]=更早1 / 末位=最新6`。waitFor 文本出现 + 顺序断言共同证明前置而非追加。
    - f003（minor）：修不彻底但接受。新测试「5s 兜底拉取合并新消息去重」未触发 interval，仅经 onMessagesUpdated 同源验证 merge_tail 去重（推送与兜底共用 merge_tail，`SessionHistoryView.tsx:283,305`）。5s interval 拉取本身仍无单测；但可测试性声明已把「5s 兜底」标 [deploy]/t213 手动验收，interval 不单测在声明范围内，不重复 finding。
    - f004（minor）：未按 finding 补测，仅以「1.5s 定时恢复属 UI 计时器不单测」理由标已修；「已复制 ✓」出现断言 Round 1 已有，无新增。1500ms 恢复仍无测试（UI 计时器，minor 接受）。
    - f005（minor）：修不彻底。模态「列出 6 会话」以 6 个 checkbox 断言触达（`HistoryOverflowModal.tsx:45-64` 渲染 6 行）；「取消则不入栏」仍未测（见本轮 f010）。
    - f006（minor）：已消除。3 会话断言 `grid_class(3)` 分支 className 不含 single（`layout.ts:10`），1/2 栏含 single 断言与之互补。
    - f007（minor）：已消除。`tokenStats.getSessions` 断言 `toHaveBeenCalledWith({ limit: 6 })`。
    - f008（minor）：已消除。两栏各勾 1 条 → 两栏独立「已选 1 条」×2 + 工具栏「复制 2 条」；推送（同 id a1 + 新 id a2）后仍「复制 2 条」，验证两栏独立计数、工具栏合计与选中按 id 保留且不扩散到新消息。
    - Round 1 未进表提示（route_values 补 `case "history"`）：已消除，五 routes 闭合集 + App.tsx `case "history"` 均断言。
- 改测方向复核：无「迁就实现」改测。`route_values.test.ts` 闭合集 four→five 由新增 history 路由（use-route.ts 合法变更）驱动，标题与断言同步更新，非改预期迁就实现。
- 本轮新发现：2 条（均 minor）。
- 未进表提示：`task.md` 处置表 t211_test_f004~f008 与 `review_test.md` Round 1 finding 语义错位（f004 实为复制 1.5s 恢复，处置表误记为超 6 模态 + limit 6；f005~f008 依次错位，route_values 提示混入 f008 行），建议 implementer 修正处置表归属映射，确保「已修」落对 finding（不阻断）。「最近 6 条」空位不足弹模态（AC 3 子路径）未直接测，经 onFocus 触达同一 open_session→pending 逻辑，可补 case。
- 总体判断：Round 1 两条 important（f001/f002）已真实修复且触达生产逻辑，无假绿；本轮未发现新 blocking，仅剩 minor 覆盖扩展项。
- 系统性 follow-up：无

verdict: PASS
