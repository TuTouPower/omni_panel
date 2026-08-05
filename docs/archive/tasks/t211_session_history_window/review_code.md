# Task review t211（reviewer_focus: 代码）

- task：`t211_session_history_window`
- spec：`docs/tasks/t211_session_history_window/spec.md`
- diff_anchor：`2077e331ac5c55a1e3d710ff9c6fee7375217616`
- target：`git diff 2077e331ac5c55a1e3d710ff9c6fee7375217616`
- round：1
- reviewed_at：2026-08-05 17:10 UTC+8

## Findings

### t211_code_f001 - 「已开会话滚动到该栏」依赖的 data-loc-key 属性从未渲染，功能恒不生效

- 严重度：minor
- 锚点：非 AC 的自加交互缺陷；已开场景再打开时滚动定位恒失败
- 位置：`src/renderer/views/SessionHistoryView.tsx:159-162`（选择器）；`src/renderer/components/session-history/HistoryColumn.tsx:80`（栏元素未输出该属性）
- 问题：`open_session` 在会话已开时用 `document.querySelector('.history-column[data-loc-key="${CSS.escape(key)}"]')` 定位栏并 scrollIntoView。但 `HistoryColumn` 的 `<section className="history-column">` 从未渲染 `data-loc-key` 属性——grep 全仓该属性仅此一处引用。选择器恒返回 null，`?.scrollIntoView` 恒 no-op，注释「已开：滚动到该栏」的行为从未发生。
- 建议：在 `HistoryColumn` section 上补 `data-loc-key`（把 loc_key 作 prop 传入），或改用 ref 字典按 loc_key 定位。

### t211_code_f002 - layout.ts 导出的 grid_class 未被使用，分栏 class 逻辑在视图内重复实现

- 严重度：minor
- 锚点：DRY / 死代码（两份相同逻辑未来可漂移）
- 位置：`src/renderer/lib/session-history/layout.ts:9-12`；`src/renderer/views/SessionHistoryView.tsx:5,347`
- 问题：`layout.ts` 的 `grid_class(count)` 是设计为可复用的纯函数，但 `SessionHistoryView` 未 import，改内联 `columns.length <= 2 ? "history-grid single" : "history-grid"`。layout 的导出成为死代码，且两份逻辑当前一致但无约束保持同步。
- 建议：视图改为 `const grid_cls = grid_class(columns.length)`（改名避免遮蔽），或删除 layout.ts 未用导出并保留一处实现。

### t211_code_f003 - mount_column 的 subscribe 拒绝未处理，源文件缺失时产生 unhandled rejection

- 严重度：minor
- 锚点：错误处理——忽略异常；可观测为 renderer 控制台 unhandled promise rejection
- 位置：`src/renderer/views/SessionHistoryView.tsx:115`
- 问题：`void window.usageboard.sessionHistory.subscribe(...)` 无 `.catch`。主进程 `resolve_session_file` 失败返回 `fail("SESSION_NOT_FOUND")`，preload `invoke` 抛错 → rejected promise 无人接管。决策 12 源文件缺失场景必然触发（文件已删时 subscribe 与 query 同时失败）。空态文案由 query 失败分支正确呈现，行为不受影响，但 rejection 未处理属控制台噪声，且 subscribe 失败与「栏已挂载」状态无关联。
- 建议：`subscribe(...).catch(() => { /* 空态由 query 处理 */ })`，或并入挂载流程统一失败态。

### t211_code_f004 - load_older 完成回调基于可能过期的 columns_ref 快照整体替换 messages，与并发推送存在窄窗口竞态

- 严重度：minor
- 锚点：并发时序——state 原子性；可观测：并发推送的尾部消息短暂消失，5s 兜底自愈
- 位置：`src/renderer/views/SessionHistoryView.tsx:85-92`
- 问题：`.then` 内 `cur = columns_ref.current.find(...)` 读最近一次渲染快照；`columns_ref.current` 只在 render 时刷新。若 load_older 查询在途时推送事件到达且其 render 尚未提交，`cur.messages` 不含新推送消息，随后 `update_column` 的 `set_columns(prev => prev.map(c => ... messages: [...q.messages, ...cur.messages] ...))` 用过期快照整体替换（updater 读最新 prev 但补丁来自过期 cur），把刚推送的尾部消息从 prev 冲掉。该消息会在下个 5s 兜底周期被 `merge_tail` 补回，故为短暂可见、自愈缺陷，非永久丢失。
- 建议：合并基准改为在 `set_columns` updater 内基于 `prev` 对应栏的 messages 计算，即补丁写 `messages: [...q.messages, ...prev 中该栏 messages]`；或 load_older 完成也走 id 去重 merge 语义。

### t211_code_f005 - 超 6 模态框未展示「打开时间」，agent 用原始 source 而非友好名

- 严重度：minor
- 锚点：契约区「范围」决策 4 表述「agent+标题+打开时间」字段未满足
- 位置：`src/renderer/components/session-history/HistoryOverflowModal.tsx:51-58`
- 问题：决策 4 描述模态框列出「agent+标题+打开时间」，实现只渲染 `col.loc.source`（如 `claude_code`）与 `col.title`，缺 openedAt；且 source 未经 `agent_friendly`（栏头显示「Claude」、模态框显示「claude_code」，跨栏展示不一致）。AC-8 可观察行为（列会话、关够才开、可取消）满足，此为字段级偏差。
- 建议：`<span className="history-modal-agent">{agent_friendly(col.loc.source)}</span>`，并追加 `format_time_short(col.openedAt)` 展示打开时间。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1，无。
- 本轮新发现：5 条（全部 minor，无 blocking）。
- 未进表的提示：
    - 文件过大：`src/renderer/views/SessionHistoryView.tsx` 415 行，达实现源码 minor 阈值（400），本 task 新建即略超；窗口编排逻辑内聚，未产生可观测缺陷，列入观察。`src/preload/index.ts` 624 行 ≥400，本 task 净增 37 行，系既有单文件 API 聚合、跨 task 持续堆积，同样未达 important。均不进 finding 表。
    - 复杂度：`SessionHistoryView` 各函数手算 CC 均 <10（load_older/mount_column/open_session/modal_confirm 等 ≤6），无命中。
    - 布局验证：`session-history.css` 未显式 `grid-template-rows`（默认 `grid-auto-rows: auto`），初看疑为「行高随内容、`.history-msgs` 不滚动」。用 Playwright 以本 task 精确 CSS 复刻 200 条消息/栏场景实测：`.history-msgs` clientH 643 / scrollH 11216，内部滚动成立，文档无页面级滚动（pageScrollable=false），分栏独立滚动与滚动触发 load_older 成立，未出 finding。
    - 范围外观察：`docs/pending.md` 增 p051（整批并行下真实定时器测试 flaky）属顺手登记系统性观察，非代码范围外改动。
- 总体判断：12 条 AC 均有实现且行为可观察达标，未发现 critical / important；5 条 minor 建议由 implementer 处置，可 PASS。
- 系统性 follow-up：无。

verdict: PASS

## Round 2 (2026-08-05 17:35 UTC+8)

前轮 finding 复核（Round 1 → 2，以当前 diff 为准）：

- t211_code_f001：已修。`HistoryColumn.tsx:82` section 补 `data-loc-key`；`SessionHistoryView.tsx:170-172` 选择器 `.history-column[data-loc-key="..."]` + `CSS.escape` 在带引号属性选择器内能正确往返（`\|`→`|`、`\\`→`\`），滚动定位成立。
- t211_code_f002：已修。`SessionHistoryView.tsx:5` import `grid_class`，`:358` `const grid = grid_class(columns.length)`，`:386` 使用；layout.ts 导出不再死代码。
- t211_code_f003：已修。`SessionHistoryView.tsx:123-126` subscribe 补 `.catch()`，空态仍由 query 拒绝分支置 `status="missing"` 呈现。
- t211_code_f004：已修。`SessionHistoryView.tsx:87-98` load_older 完成改函数式 setState，合并基准 `[...q.messages, ...c.messages]` 读 prev 最新栏，`loading_older_locks` Set 锁防滚动顶事件在状态落盘前重复前置页；与在途推送竞态消除。
- t211_code_f005：已修。`HistoryOverflowModal.tsx:56` `agent_friendly(col.loc.source)`，`:59-61` `format_time_short(col.openedAt)` 展示打开时间。

## Findings

### t211_code_f006 - 「最近 6 条」批量打开绕过 6 栏上限，已有栏时直接挂载超 6 会话、不弹模态框

- 严重度：important
- 锚点：AC-3「点击『最近 6 条』后…空位不足时弹模态框按决策 4 腾位」；AC-8 的 6 栏上限不变量
- 位置：`src/renderer/views/SessionHistoryView.tsx:268-274`（recent_six 同步循环）；`:175-179`（open_session 容量检查读 `columns_ref.current.length`）
- 问题：`recent_six` 在单个 `.then` 回调里同步 for 循环逐次调 `open_session`。`open_session` 的 `columns_ref.current.length >= MAX_COLUMNS` 检查读的是 render 时才刷新的 ref；React 19 createRoot 自动批处理使循环内 `set_columns` 不触发中间 render，`columns_ref.current` 全程停留在批处理前的旧长度。故已有 N(1~5) 栏时点「最近 6 条」，6 个新会话全部直接 `mount_column`，最终 N+6 栏 >6，模态框不弹。具体场景：开 1 栏（`columns_ref.current.length === 1`）→ 点「最近 6 条」→ 6 次 `open_session` 均判定 1 < 6 → 全部挂载 → 工具栏显示 7/6，两列网格排 4 行。仅 0 栏起步时（0+6=6）恰好合规。现有测试「最近 6 条」仅覆盖 0 栏起步，未覆盖此路径。
- 建议：`recent_six` 批量打开先累计拟挂载 loc 再统一按「空位数」分流（空位不足部分进 pending），或让容量判定改函数式/以累计计数为准；保证任意起点都守住 6 栏上限。

### t211_code_f007 - unsubscribe 三处无 .catch，与 round 1 f003 同类

- 严重度：minor
- 锚点：错误处理——忽略拒绝；窗口/进程关闭时 IPC 拒绝产生 unhandled rejection，注销失败致主进程订阅残留
- 位置：`src/renderer/views/SessionHistoryView.tsx:186`（close_column）、`:199`（clear_all）、`:326-328`（卸载 effect）
- 问题：三处 `void window.usageboard.sessionHistory.unsubscribe(...)` 均无 `.catch`。unsubscribe 走 `ipcRenderer.invoke`，窗口卸载、主进程关闭或 IPC 异常时拒绝无接管 → unhandled rejection；注销失败时主进程对已关会话的订阅残留（renderer 侧 onMessagesUpdated 找不到 key 变 no-op，泄漏留在主进程侧）。常规关闭路径 resolved，属边界噪声 + 订阅泄漏风险。
- 建议：与 f003 同法补 `.catch(() => {})`，或把注销收敛为幂等清理函数统一接管拒绝。

## 结论

- 前轮 finding 复核：5 条 code finding 全部已修，且未发现修复引入的新回归。
- 本轮新发现：2 条（f006 important、f007 minor）。
- 未进表的提示：
    - 文件过大：`SessionHistoryView.tsx` 426 行（round 1 记 415，本轮净增 11）≥400 minor 阈值；`preload/index.ts` 624 行、本 task 净增 37。均维持观察，未达 important。
    - 复杂度：各函数手算 CC <10，无命中。
    - load_older 重开窄竞态：栏关闭后数百 ms 内以同 key 重开，在途 load_older 的 stale 结果会 `[...q.messages, ...c.messages]` 合并进新栏并覆盖其 `next_cursor`，且旧 key 的 `loading_older_locks` 短暂阻塞新栏首次 load_older。需关+开同一会话窗口极短时序，未证明可复现，未出 finding。
    - clear_all 时模态框仍开：清空全部不清 `pending`，模态框继续列出已消失的 6 栏，确认后 pending 会重新挂进空网格。UX 边界，未出 finding。
    - preload `case "history"` API 面 = tray 路由全量（connector 写 / tray quit / settings 等），config 只读 + session disabled 正确；与本仓既有 route 分权模式一致，属跨窗口最小权限收紧的系统性话题，未出 finding。
    - 滚动锚定：`useLayoutEffect` 依赖 `[column.messages, first_id]` 正确；前置补偿以 prev_height_ref 为基准，loading 占位符在 prepend render 时已移除，补偿量恰为新增页高度，无视觉跳变。
- 总体判断：Round 1 全部 code minor 已修；本轮新增 f006 important（最近 6 条批量打开绕过 6 栏上限，违反 AC-3），修复前 FAIL。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-05 17:50 UTC+8)

前轮 finding 复核（Round 2 → 3，以当前 diff 为准）：

- t211_code_f006：已修。`SessionHistoryView.tsx:65` 新增同步 `opened_count_ref`；mount +1（:125）/ close −1（:197）/ clear 归零（:216），`open_session` 容量检查改读它（:181）。逐路径核对增减平衡：`mount_column` 是唯一 +1 入口（open_session 与 modal_confirm 均经它），`close_column` 是唯一 −1 入口，`clear_all` 归零，无其他改 columns 长度的 setState 遗漏计数；`modal_confirm` 先 close 后 mount，净变化 = 旧计数 − close 数 + pending 数，而 `HistoryOverflowModal.tsx:24` `enough = close_set.size >= pending_count` 强制 close ≥ pending，确认后计数恒 ≤6。React 19 自动批处理下同步计数在批量循环内即时更新，无 stale 读——0 栏起步 6 挂载、1~5 栏起步空位满后剩余进 pending 弹模态，第 7 个直接挂载的路径已不存在。回归测试 `session_history_view.test.tsx:358-388`（已开 1 栏 + 最近 6 条 → 弹模态 + 6/6）在无此修复时必挂，测试有效。
- t211_code_f007：已修。三处 unsubscribe 均已补 `.catch`：close_column `:192-196`、clear_all `:210-215`、卸载 effect `:343-348`。与 f003 同法收敛。

## Findings

### t211_code_f008 - recent_six 的 getSessions 无 .catch，IPC 拒绝时产生 unhandled rejection

- 严重度：minor
- 锚点：错误处理——与 f003/f007 同类漏接管；可观测为「最近 6 条」IPC 失败时控制台 unhandled rejection + 按钮静默无反馈
- 位置：`src/renderer/views/SessionHistoryView.tsx:284-290`
- 问题：`recent_six` 内 `void window.usageboard.tokenStats.getSessions({ limit: 6 }).then(...)` 无 `.catch`。history route 下 tokenStats 是真实 IPC；token-stats store 未就绪或通道异常时 getSessions 拒绝 → 无接管。与 implementer 本轮刚为 subscribe/unsubscribe 补齐的 .catch 同类，recent_six 遗漏。
- 建议：补 `.catch(() => { /* 忽略，按钮静默失败 */ })`。

### t211_code_f009 - copy_selected 的 navigator.clipboard.writeText 无 .catch，剪贴板失败无反馈

- 严重度：minor
- 锚点：错误处理——复制写入失败被忽略；可观测为背景/失焦窗口剪贴板拒绝时 unhandled rejection 且「已复制 ✓」恒不出现
- 位置：`src/renderer/views/SessionHistoryView.tsx:276-281`
- 问题：`void navigator.clipboard.writeText(md).then(...)` 无 `.catch`。Electron renderer 剪贴板写入在窗口失焦/权限受限时会 reject；此时不落剪贴板、无「已复制 ✓」反馈、控制台 unhandled rejection，AC-6/AC-7 对该失败路径无任何呈现。
- 建议：补 `.catch(() => {})`；如需反馈可置一条失败提示（可选）。

### t211_code_f010 - 5s 兜底合并读 render-fresh columns_ref 后整体替换，与 f004 同类竞态未消除

- 严重度：minor
- 锚点：并发时序——f004 已修 load_older 的同型 stale-read-then-replace 模式在兜底 timer 残留；可观测：兜底合并与推送交错时尾部新消息短暂消失，下个兜底/推送自愈
- 位置：`src/renderer/views/SessionHistoryView.tsx:316-322`
- 问题：兜底 `.then` 内 `cur = columns_ref.current.find(...)`（仅 render 刷新），`merge_tail(cur.messages, q.messages)` 在 updater 外算好补丁，再经 `update_column` 的函数式 setState 用该补丁整体替换。若推送事件的 setState 已入队但 render 尚未提交（columns_ref 仍旧），兜底替换会在推送 updater 之后执行，把刚推送的尾部消息从 prev 冲掉（同 f004 的机制，只是触发窗口更窄）；下个 5s 兜底或推送补回，自愈。f004 的修复（合并基准改 prev 内读）未覆盖此路径。
- 建议：兜底合并同样把 `merge_tail` 移进 `set_columns` updater，基于 prev 对应栏计算。

## 结论

- 前轮 finding 复核：f006（important）与 f007（minor）均已按方向正确修复，未发现修复引入的新回归。
- 本轮新发现：3 条（f008/f009/f010，全部 minor）。
- 未进表的提示：
    - 文件过大：`SessionHistoryView.tsx` 442 行（round 2 记 426，本轮净增 16）≥400 minor 阈值；`preload/index.ts` 624 行。均维持观察，未达 important。
    - 复杂度：各函数手算 CC <10，无命中。
    - modal_confirm 与模态期间 pending 增长：focus 事件在模态框开启期间追加 pending 时，模态框随重渲染用新 `pending_count` 重新计算 `enough`、确认按钮重新禁用；React 18+ 自动批处理保证 IPC 回调的 state 更新在用户点击（独立 macrotask）前已 flush，无法用旧 close_set 尺寸触发超 6 挂载。未出 finding。
    - round 2 结论所记「clear_all 时模态框仍开」边界实际不可达：`.history-modal-backdrop`（session-history.css:198-206）`position: fixed; inset: 0` 遮罩覆盖工具栏，清空全部在模态开启时无法点击。
    - load_older 关+重开窄竞态仍存在（stale 页合并进同 key 新栏 + 旧锁短暂阻塞新栏首次 load_older），round 2 已述，未证明可复现，未出 finding。
    - preload `case "history"` API 面含 tray 全量（quit/restart 等）——跨窗口最小权限收紧的系统性话题，round 2 已述，未出 finding。
- 总体判断：f006/f007 已正确修复且无新 blocker；本轮 3 条 minor 建议由 implementer 处置，可 PASS。
- 系统性 follow-up：无。

verdict: PASS
