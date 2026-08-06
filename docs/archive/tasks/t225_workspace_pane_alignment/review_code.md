# Task review t225（reviewer_focus: 代码）

- task：`t225_workspace_pane_alignment`
- spec：`docs/tasks/t225_workspace_pane_alignment/spec.md`
- diff_anchor：`a386d099db29b0557da237c7a62c904d9e230d33`
- target：`git diff a386d099db29b0557da237c7a62c904d9e230d33`
- round：1
- reviewed_at：2026-08-06 13:15 UTC+8

## Findings

### t225_code_f001 - AC 1 pane 头部未渲染 model 与 cwd

- 严重度：important
- 锚点：AC 1（pane 头部显示 agent 色条、徽标（含 model）、标题、cwd 与 `轮数 · tokens · 日期`）
- 位置：`src/renderer/components/workspace/SessionPane.tsx:135-143`（`agent_initial` 徽标 + meta 行）、`src/renderer/components/workspace/SessionPane.tsx:39-45`（`agent_initial`）、`src/renderer/lib/workspace/slots.ts:15-22`（`SlotSession` 无 `model`/`directory` 字段）
- 问题：AC 1 明确要求头部显示「徽标（含 model）」与「cwd」。实现中徽标 `.pane-agent-badge` 只显示来源首字母（`agent_initial`，如 "C"/"OC"），model 全无；meta 行为 `{source} · {calls} 轮 · {tokens} tokens · {date}`，无 cwd。根因在槽位模型层：`SlotSession` 未携带 `model` 与 `directory`（cwd），`session_meta`（slots.ts:98-111）从 `TokenStatsSession` 派生时丢弃这两个字段。数据源可达（`TokenStatsSession.model`/`directory` 存在，`refresh_slot_meta` 已拉全量 session 行），实现侧选择不携带。`task.md` 实施笔记为「无」，无偏离说明。另 test review `review_test.md` f004 已把该 cwd/model 缺口移交代码层处置。现有 `SessionPane.test.tsx` 头部用例断言的是已实现子集（标题/轮数/tokens/徽标/色条），未覆盖缺失项。
- 建议：扩展 `SlotSession` 增加 `model`/`directory`（cwd）字段，`session_meta` 与 `refresh_slot_meta` 一并回填，头部 meta 渲染 `{cwd} · {calls} 轮 · {tokens} tokens · {date}`、徽标含 model（或标题下 model 行）；若确认该 AC 不满足属 spec 过时，走改 spec 上下文区流程并注明。

### t225_code_f002 - 关闭/清空聚焦槽位后 `focused_index`/`outline_index` 未失效，聚焦布局卡死（空白网格）

- 严重度：important
- 锚点：AC 6（聚焦模式下单面板铺满工作区；退出后恢复原布局）
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:79-80`（`focused_index`/`outline_index` state）、`src/renderer/components/workspace/WorkspaceView.tsx:303-326`（`close_slot` 不清索引）、`src/renderer/components/workspace/WorkspaceView.tsx:335-347`（`clear_all` 不清索引）、`src/renderer/components/workspace/WorkspaceView.tsx:550-571`（`confirm_recent` 不清索引）、`src/renderer/styles/pane.css:23-25`（聚焦态隐藏 `data-focused="false"` pane）
- 问题：`focused_index`/`outline_index` 只在快捷键与按钮路径写，槽位增删/清空路径不重置。失败场景一：聚焦槽位 1 后关闭该槽位，`focused_index` 仍为 1，槽 1 已空；`.slot-grid` 保留 `focused` class，剩余槽 0 `data-focused="false"` 被 `display:none`，聚焦 pane 已卸载——工作区呈现空白网格，须按 `Esc` 才能恢复。失败场景二：聚焦后点「清空」或「最近会话→清空并替换全部槽位」，`focused_index` 残留；下次装入会话时网格立刻进入聚焦态（新会话被意外铺满）。两场景均违反 AC 6「恢复原布局」，且「空网格」不可通过「再次点击退出聚焦」恢复（无 pane 可点）。
- 建议：在 `close_slot`/`clear_all`/`confirm_recent` 中把 `focused_index`/`outline_index` 置 `null`（或按删除槽位后重新钳制到有效范围）；补一条「聚焦后关闭该 pane 网格不残留聚焦态」的 WorkspaceView 用例。

### t225_code_f003 - 死 CSS：workspace.css 残留 `.slot-pane > .history-column`

- 严重度：minor
- 锚点：范围（删除旧 HistoryColumn/HistoryMessageRow/session-history.css）；死代码清理完整性
- 位置：`src/renderer/styles/workspace.css:338`
- 问题：本 task 删除 `HistoryColumn` 组件与其 `session-history.css`，但 `workspace.css` 仍保留 `.slot-pane > .history-column { ... }` 规则（9 行），指向已删除的组件类名，为无匹配元素的死规则。同删除动作的清理不完整（另有 `format_time_full` 在 `HistoryMessageRow` 删除后生产侧无调用，见结论提示）。
- 建议：删除 `workspace.css:338-346` 的 `.slot-pane > .history-column` 规则。

### t225_code_f004 - 快捷键 `[` `]` 从无聚焦首次进入循环时行为异常

- 严重度：minor
- 锚点：AC 9（`[` `]` 循环切换聚焦槽位）
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:526-534`
- 问题：`focused_index` 为空时 `current = occupied[0]`（首个占用槽），`]` 计算 `(0+1+n)%n = 1`，`[` 计算 `(0-1+n)%n = n-1`。两个槽位时 `]` 与 `[` 均聚焦第二个槽，首槽被跳过，用户须先按数字键才能聚焦首槽。`]` 首次使用应聚焦首个占用槽（或 `[` 聚焦末槽），现行为与「循环切换」直觉不符。
- 建议：`focused_index` 为空时让 `]` 直接聚焦 `occupied[0]`、`[` 聚焦 `occupied[occupied.length-1]`；或调整 `next_pos` 基数使从「虚拟游标前一位」起步。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：4 条（f001-f002 important，f003-f004 minor）
- 未进表的提示：
    - 文件过大（降级规则，不进表）：`src/renderer/styles/pane.css` 491 行（新建，≥400 minor 阈值）；`src/renderer/components/workspace/WorkspaceView.tsx` 720 行（anchor 659，本 task +61，≥400）。`SessionPane.tsx` 337 行未超阈值。
    - 圈复杂度：`SessionPane` 渲染函数手算 CC≈11（≥10 提示，<15 不进表）。
    - 范围外观察（不改代码）：
        - 聚焦态 `.session-pane.focused { position:absolute; inset:0 }`（pane.css:16-21）锚定最近 positioned 祖先 `.session-shell`（session-shell.css:178 `position:relative`），铺满整个窗口（覆盖 shell topbar 与 rail），而非仅 workspace-main 区域。与 AC 6「铺满工作区」口径需对照 demo 目验；若期望只覆盖工作区，应给 `.workspace-main` 加 `position:relative`。
        - `format_time_full`（session-history/markdown.ts:47）在 `HistoryMessageRow` 删除后生产侧无调用，仅测试引用（`session_history_markdown.test.ts`）；属本次删除产生的死导出，非阻塞。
        - Markdown 安全面核查通过：`MarkdownMessage` 无 `rehype-raw`、无 `dangerouslySetInnerHTML`；react-markdown@10.1.0 默认丢原始 HTML，配合默认 `urlTransform` 拦 `javascript:` 等危险协议，满足「会话 HTML 不当 HTML 执行」硬约束。
        - 删除 HistoryColumn/HistoryMessageRow/session-history.css 的组件与样式引用清理基本完整（`src/` 与 `tests/` 均无残留引用），仅上述 f003 CSS 死规则与 `format_time_full` 两处遗漏。
    - 与 test review 一致性：`review_test.md` f004 已就 AC 1 cwd/model 缺口移交代码层，与 f001 对齐。
- 总体判断：pane 重做主体（Markdown 渲染/分隔线/回到底部/大纲/聚焦/视图/快捷键/保留能力）实现与 AC 对齐良好、XSS 面控制正确；但 AC 1 头部缺 model/cwd 与聚焦状态索引残留两处为未解决 important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-06 13:31 UTC+8)

# Task review t225（reviewer_focus: 代码）

- task：`t225_workspace_pane_alignment`
- spec：`docs/tasks/t225_workspace_pane_alignment/spec.md`
- diff_anchor：`a386d099db29b0557da237c7a62c904d9e230d33`
- target：`git diff a386d099db29b0557da237c7a62c904d9e230d33`
- round：2
- reviewed_at：2026-08-06 13:31 UTC+8

## Findings

本轮无新 finding；f001 修不彻底，仍为未解决 important（复核见下）。

## 结论

- 前轮 finding 复核（以 `git diff` 与代码为准）：
    - **t225_code_f001（important）→ 修不彻底，仍存在**。修复覆盖了三处：`SlotSession` 增 `model`/`cwd` 字段（`src/renderer/lib/workspace/slots.ts:19-20`）、`session_meta` 回填（`slots.ts:105-106`）、pane 头部 meta 行渲染 cwd（`src/renderer/components/workspace/SessionPane.tsx:142-146`）。但 AC 1 缺口仍在两条路径可观测：
        1. `refresh_slot_meta`（`src/renderer/components/workspace/WorkspaceView.tsx:154-185`）仍只回填 `title`/`calls`/`tokens`，不回填 `model`/`cwd`。而 `open_session`（最近会话、URL `loc` 初始定位、`onFocus` IPC 三个入口）用合成 `TokenStatsSession` 建槽，`model: ""`/`directory: null`（`WorkspaceView.tsx:257,259`），于是这些 pane 头部完全不显示 cwd 与 model。round 1 finding 明确要求「session_meta **与 refresh_slot_meta 一并回填**」，只做了前者。最直接佐证：`confirm_recent`（`WorkspaceView.tsx:577-579`）拿到的是带 `model`/`directory` 的完整 `TokenStatsSession[]`（`src/shared/types/token-stats.ts:27-29`），却丢成最小 loc 再走 `open_session`，数据在门口被扔掉。失败场景：工作台→打开最近会话→选一个会话，pane 头部 `claude_code · 5 轮 · 1,200 tokens · 2026-08-06`，无 cwd、无 model，违反 AC 1。
        2. 即使 model 数据在位（picker 路径），`pane-agent-badge` 只把 model 放进 `title` 悬停 tooltip（`SessionPane.tsx:135`），非可见文本；对齐基准 `public/frontend_demo/app/src/components/workspace/SessionPane.tsx:155` 用 `<AgentBadge showModel />` 将 model 渲染为可见文本。AC 1「显示…徽标（含 model）」按 demo 口径应为可见展示。现有头部测试（`tests/unit/renderer/components/workspace/SessionPane.test.tsx:64-79`）只断言徽标元素存在，未断言 cwd/model 文本，未覆盖上述缺口。

    - **t225_code_f002（important）→ 已修（代码层）**。`close_slot` 关闭聚焦/大纲槽位时清索引（`WorkspaceView.tsx:325-326`）、`clear_all`（`:350-351`）与 `confirm_recent`（`:575-576`）置 `null`。`remove_slot` 是定位置空、不位移（`slots.ts:67-70`），故关闭非聚焦槽不改变聚焦槽索引，无索引错位复发。round 1 两个失败场景（关聚焦槽后空网格、清空后残留聚焦态）代码上均消除。**注意**：finding 建议补的「聚焦后关闭该 pane 网格不残留聚焦态」回归用例未新增（本轮 diff 的 4 条新用例无此场景），属测试覆盖缺口，列入未进表提示。

    - **t225_code_f003（minor）→ 已修**。`workspace.css` 的 `.slot-pane > .history-column` 已删除（diff 确认 9 行移除；当前文件 grep 计数 0）。

    - **t225_code_f004（minor）→ 已修**。`[`/`]` 首次进入聚焦时统一聚焦 `occupied[0]`（`WorkspaceView.tsx:531-537`），round 1 的「首槽被跳过」缺陷消除。`[` 首次落首槽而非末槽是合理设计取舍，非缺陷。

- 本轮新发现：0 条
- 未进表的提示：
    - 测试覆盖缺口（minor，建议 test reviewer 或后续补）：f002 建议的「聚焦后关闭聚焦槽位网格不残留 focused 态」用例未加；f004 的「无聚焦首按 `[`/`]` 聚焦首占用槽」用例未加（现有用例从已聚焦态开始）。
    - 文件过大（降级规则，不进表）：`src/renderer/styles/pane.css` 491 行（新建 ≥400）；`src/renderer/components/workspace/WorkspaceView.tsx` 731 行（anchor 659，本 task +72）。
    - 范围外观察（不改代码）：无新增；round 1 已记的 `format_time_full` 死导出与聚焦态 `position:absolute; inset:0` 覆盖范围观察仍成立。
- 总体判断：f002/f003/f004 已按 diff 核实消除，但 f001 修不彻底——`refresh_slot_meta` 未回填 model/cwd 导致最近会话/URL/onFocus 路径 pane 头部仍缺 cwd 与 model（且 model 仅为 tooltip 非可见文本），AC 1 缺口在主要入口可观测，仍有未解决 important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 3 (2026-08-06 13:41 UTC+8)

# Task review t225（reviewer_focus: 代码）

- task：`t225_workspace_pane_alignment`
- spec：`docs/tasks/t225_workspace_pane_alignment/spec.md`
- diff_anchor：`a386d099db29b0557da237c7a62c904d9e230d33`
- target：`git diff a386d099db29b0557da237c7a62c904d9e230d33`
- round：3
- reviewed_at：2026-08-06 13:41 UTC+8

## Findings

本轮无新 finding；f001 部分修复（数据管道已通，model 可见文本未兑现），复核见下。

## 结论

- 前轮 finding 复核（以 `git diff` 与代码为准）：
    - **t225_code_f001（important）→ 修不彻底，仍存在（数据管道已修复，model 可见文本缺口未兑现）**。分两条独立子项核对：
        1. **数据管道（round 2 子项 1）→ 已修复**。diff 核实：
            - `refresh_slot_meta` 现回填 `model`/`cwd`（`src/renderer/components/workspace/WorkspaceView.tsx:168-169`），`cwd` 用 `row.directory ?? slot.cwd`、`model` 用 `row.model || slot.model` 兜底，URL loc / onFocus IPC 路径经 `mount_column`（`:209` 调 `refresh_slot_meta`）异步补全，不丢 picker 已带的值。
            - `open_session` 增 `meta?: { model?; cwd? }` 参数（`WorkspaceView.tsx:242-243`），合成对象 `model: meta?.model ?? ""`、`directory: meta?.cwd ?? null`（`:259,261`）。
            - `confirm_recent` 直接传完整 `sess.model`/`sess.directory`（`WorkspaceView.tsx:581-584`），不再丢成最小 loc。
            - `SlotSession` 增 `model`/`cwd` 字段（`src/renderer/lib/workspace/slots.ts:19-20`），`session_meta` 派生回填（`slots.ts:105-106`）。
            - 三路径数据流核实：最近会话（`RecentSessionsModal` 传完整 `TokenStatsSession[]` → `confirm_recent` → `open_session(meta)`）、picker（`SessionPickerModal` 传完整 session → `add_session` → `session_meta(sess)`）、URL loc/onFocus IPC（`open_session(loc)` → `refresh_slot_meta` 异步补全）。`TokenStatsSession` 契约含 `model: z.string()`、`directory: z.string().nullable()`（`src/shared/types/token-stats.ts:27-29`）。cwd 已作为可见文本进 meta 行（`SessionPane.tsx:144`）。此子项消除。
        2. **model 可见文本（round 2 子项 2）→ 未兑现**。徽标仍只渲染 `agent_initial`（如 "C"），model 仅放 `title` 悬停 tooltip（`src/renderer/components/workspace/SessionPane.tsx:135`），meta 行无 model（`:142-146`）。对齐基准 demo 用 `<AgentBadge agentId showModel />` 将 model 渲染为 12px mono 可见文本（`public/frontend_demo/app/src/components/AgentBadge.tsx:32`，`SessionPane.tsx:155`）。本轮新增头部用例对 model 的断言只验证 `getAttribute("title")`（`tests/unit/renderer/components/workspace/SessionPane.test.tsx:78-79`），是弱断言，恰好固化了 tooltip 方案而非 AC 1「徽标（含 model）」的可见展示。该子项为 round 2 f001 的组成部分，diff 未动渲染，故 blocker 未完全消除。

    - **t225_code_f002（important）→ 已修**。`close_slot`/`clear_all`/`confirm_recent` 清 `focused_index`/`outline_index`（`WorkspaceView.tsx:327-328,352-353,577-578`）。round 2 提示缺失的「关闭聚焦槽位后网格不残留聚焦态」回归用例本轮已补（`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`「关闭聚焦槽位后网格不残留聚焦态」）。测试覆盖缺口闭环。

    - **t225_code_f003（minor）→ 已修**（round 2 已核，diff 无回退）。

    - **t225_code_f004（minor）→ 已修**（round 2 已核，diff 无回退）。

- 本轮新发现：0 条
- 未进表的提示：
    - f001 数据管道三路径已按代码核实接通；但无集成测试覆盖「getSessions → SlotSession → 头部展示」链路（新增头部断言为 SessionPane 直渲用例，不经 confirm_recent / refresh_slot_meta 实流），数据流正确性仅代码层面可证。
    - f004 的「无聚焦首按 `[`/`]` 聚焦首占用槽」用例仍未补（现有用例从已聚焦态开始），沿用 round 2 提示。
    - 文件过大（降级规则，不进表）：`src/renderer/styles/pane.css` 491 行、`src/renderer/components/workspace/WorkspaceView.tsx` 737 行，均沿用前轮结论。
    - 范围外观察：无新增。
- 总体判断：f001 数据管道（refresh_slot_meta 回填 / open_session meta 参数 / confirm_recent 传参 / picker-session_meta）已按 diff 核实修复，三路径 cwd 可见、model 进入徽标 tooltip；但 round 2 f001 的「model 应为可见文本」子项未兑现，新增测试亦只断言 tooltip。仍有未解决 important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 4 (2026-08-06 13:45 UTC+8)

# Task review t225（reviewer_focus: 代码）

- task：`t225_workspace_pane_alignment`
- spec：`docs/tasks/t225_workspace_pane_alignment/spec.md`
- diff_anchor：`a386d099db29b0557da237c7a62c904d9e230d33`
- target：`git diff a386d099db29b0557da237c7a62c904d9e230d33`
- round：4
- reviewed_at：2026-08-06 13:45 UTC+8

## Findings

本轮无新 finding；round 3 遗留的 f001 子项 2（model 可见文本）已兑现，复核见下。

## 结论

- 前轮 finding 复核（以 `git diff` 与代码为准）：
    - **t225_code_f001（important）→ 已修，blocker 全部消除**。round 3 遗留子项 2「model 应为可见文本」按代码与测试核实已兑现：
        1. **渲染**：`src/renderer/components/workspace/SessionPane.tsx:144` meta 行现直接渲染 `{slot_meta.model ? ` · ${slot_meta.model}` : ""}`，model 成为 pane 头部可见文本（meta 行实渲为 `claude_code · claude-sonnet-4 · /path/to/proj · 5 轮 · 1,200 tokens · <date>`）。round 3 指出的「meta 行无 model」缺口消除。徽标 `agent_initial` 仍保留（badge 显示 "C"，`title` tooltip 保留为补充，`:135-137`）。
        2. **测试断言升级**：`tests/unit/renderer/components/workspace/SessionPane.test.tsx:78` 改为 `expect(screen.getByText(/claude-sonnet-4/)).toBeTruthy()`。`getByText` 匹配元素**直接文本节点**（getNodeText），不匹配 title 属性；徽标文本为 "C"（`agent_initial`），其 `title="claude-sonnet-4"` 是属性不参与匹配，故该断言唯一命中 `.pane-meta` 可见文本——round 3 批评的「只断言 tooltip」弱断言已替换为可见文本断言（`:79-81` title 属性断言保留为补充，不减弱主断言）。
        3. **实测**：`npx vitest run tests/unit/renderer/components/workspace/SessionPane.test.tsx` 7 用例全过；workspace 目录 38 用例全过（MarkdownMessage 6 / SessionPane 7 / WorkspaceView 25），无回归。
        4. **数据管道无回退**：`src/renderer/lib/workspace/slots.ts:19-20` `SlotSession.model/cwd`、`:105-106` `session_meta` 回填仍在，round 3 子项 1 结论成立。

    - **t225_code_f002（important）→ 已修**（round 3 已核，diff 无回退）。

    - **t225_code_f003（minor）→ 已修**（round 2 已核，diff 无回退）。

    - **t225_code_f004（minor）→ 已修**（round 2 已核，diff 无回退）。

- 本轮新发现：0 条
- 未进表的提示：
    - 范围外观察（不改代码）：model 落在 meta 行而非徽标内部，与 demo `<AgentBadge showModel />`（徽标内 12px mono）位置不同；AC 1「头部显示…徽标（含 model）」的可观测要求（头部可见 model）已满足，placement 差异属 demo 对齐口径，非阻塞。`.pane-meta` 为单行 `nowrap + ellipsis`（`src/renderer/styles/pane.css:81-84`），meta 行现含 source · model · cwd · 轮数 · tokens · 日期共 6 段，8 槽窄布局下 model 可能被 ellipsis 截断；model 已在 DOM 可见文本中，AC 1 满足，截断属 `[deploy]` 目验的视觉适配。
    - 沿用前轮：f001 数据管道无集成测试覆盖「getSessions → SlotSession → 头部展示」链路；f004「无聚焦首按 `[`/`]` 聚焦首占用槽」用例仍未补；`pane.css` 491 行 / `WorkspaceView.tsx` 737 行文件过大（降级规则不进表）。
- 总体判断：round 3 唯一未兑现子项「model 可见文本」已修复，测试断言从 tooltip 弱断言升级为可见文本断言且实测通过；f001 至此全部消除，其余 blocker 前轮已核无回退。当前无未解决 critical / important，PASS。
- 系统性 follow-up：无

verdict: PASS
