# Task review t225（reviewer_focus: 测试）

- task：`t225_workspace_pane_alignment`
- spec：`docs/tasks/t225_workspace_pane_alignment/spec.md`
- diff_anchor：`a386d099db29b0557da237c7a62c904d9e230d33`
- target：`git diff a386d099db29b0557da237c7a62c904d9e230d33`
- round：1
- reviewed_at：2026-08-06 13:20 UTC+8

## Findings

### t225_test_f001 - AC 4「回到底部」状态与阈值判定逻辑无测试

- 严重度：important
- 锚点：AC 4（向上滚动离底超过阈值出现「回到底部」，点击滚回底部）
- 位置：`src/renderer/lib/workspace/pane.ts:48`（`is_near_bottom`）、`src/renderer/components/workspace/SessionPane.tsx:238`（`!at_bottom` 条件渲染）；`tests/unit/renderer/components/workspace/SessionPane.test.tsx:10`（文件头注释宣称覆盖「回到底部按钮状态」）
- 问题：可测试性声明明确「AC 4 的滚动行为：jsdom 无真实布局与滚动度量，测状态与阈值判定逻辑」，但该部分零覆盖。`is_near_bottom` 纯函数在 `workspace_pane.test.ts` 中未测（该文件仅测 `should_insert_divider`/`summarize`/`message_counts`）；SessionPane 的 `at_bottom` 状态与「回到底部」按钮的 `!at_bottom` 条件渲染没有任何用例触发 scroll 事件验证。文件头注释声称覆盖了「回到底部按钮状态」，实际无对应 it 块。
- 建议：在 `workspace_pane.test.ts` 补 `is_near_bottom` 边界用例（`scroll_height - client_height - scroll_top <= 120` 判真/判假、阈值参数生效）；在 SessionPane 测试中通过 `Object.defineProperty` 抬高 `.pane-msgs` 的 `scrollHeight` 后 `fireEvent.scroll`，断言「回到底部」按钮出现、点击后消失。

### t225_test_f002 - AC 9 快捷键 Esc「逐层退出」只测聚焦一步，大纲→聚焦层级无测试

- 严重度：important
- 锚点：AC 9（`Esc` 按大纲 → 聚焦 → 普通态逐层退出）
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:511-518`（Esc 处理先关 outline 再退 focus）；`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:508-532`
- 问题：Esc 的逐层顺序是独立可验证行为：`outline_index !== null` 时 Esc 先关大纲（focus 保持），再次 Esc 才退聚焦。现有快捷键用例从不打开大纲（无 outline 状态），只验证了「聚焦→普通态」一步。若 handler 分支顺序被反转（focus 先退、outline 不退），现有测试无法发现。
- 建议：在 WorkspaceView 快捷键用例中先打开大纲（点「大纲」按钮或直接触发），断言首次 Esc 关大纲且 `[data-focused="true"]` 仍在，再次 Esc 才退出聚焦。

### t225_test_f003 - AC 10 源文件缺失空态无测试

- 严重度：important
- 锚点：AC 10（源文件缺失空态不回归）
- 位置：`src/renderer/components/workspace/SessionPane.tsx:194-195`（`status === "missing"` 渲染「该会话的原始记录文件不存在或已删除」）
- 问题：AC 10 明确把「源文件缺失空态」列为不回归项，该分支完全无测试（本 task 与既有 t224 测试均无）。渲染层从 HistoryColumn 迁到 SessionPane 后该空态既无旧覆盖也无新覆盖，属 AC 列出的能力零验证。
- 建议：SessionPane 测试补一条 `column({ status: "missing", messages: [] })`，断言渲染空态文案且不渲染消息区。

### t225_test_f004 - 删除 HistoryMessageRow 测试后部分行为覆盖未在高层补回

- 严重度：minor
- 锚点：测试策略「旧测试语义失效时新增覆盖新语义的测试，旧测试原样保留或整体删除并写明理由」
- 位置：删除 `tests/unit/renderer/components/session_history/HistoryMessageRow.test.tsx`；新实现在 `SessionPane.tsx:301-319`（`PaneMessageRow`）
- 问题：删除 HistoryMessageRow 合理（组件被 MarkdownMessage + PaneMessageRow 取代，Markdown 渲染/选择/复制已在高层覆盖）。但旧测试中的三个用户可观察行为没有直接替代：消息行角色标签（「用户」/「Agent」，`pane-msg-role`）、`timestamp === null` 不渲染时间（grok 无时间场景）、单条 checkbox 勾选触发 `on_toggle` 回调。现有测试只经「全选可见/清空选择」按钮间接覆盖选择，未触达单条行 checkbox 路径。
- 建议：SessionPane 测试补一条「勾选单条 checkbox 调用 on_toggle、timestamp null 不显示时间、角色标签正确」。

### t225_test_f005 - 「视图」开关「作用于全部 pane」未验证

- 严重度：minor
- 锚点：AC 8（显示时间戳、紧凑模式开关作用于全部 pane）
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:534-553`
- 问题：视图开关用例只装入单 pane，验证了即时生效但未验证「全部 pane」语义（多 pane 时同一切换应同步作用于每个 pane）。view 状态单源传递实现下机制成立，但多 pane 是 AC 明示范围。
- 建议：装入两个槽位后再切开关，断言两个 pane 的 `.pane-msg-time` / `.compact` 同步变化。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：4 条 t224 测试适配均为标签/选择器改名与定位迁移（`全选本栏`→`全选可见`、`清除本栏`→`清空选择`、`.history-msgs`→`.pane-msgs`、`getByText(/3 轮/)`→`.rail-sub` 内 `toContain`），断言的都是同一用户可观察行为的新形态，属语义保持的合法适配，未发现「迁就实现」式改测。
- 本轮新发现：5 条（f001-f003 important，f004-f005 minor）
- 未进表的提示：
    - AC 1 头部 meta：实现渲染 `{source} · {calls} 轮 · {tokens} tokens · {date}`，未渲染 cwd，且 agent 徽标只显示来源首字母不显示 model（`SessionPane.tsx:135,141,39-45`）；测试断言的是已实现子集（标题/轮数/tokens/徽标/色条），未断言日期。cwd/model 缺口属代码层与 spec 偏差，交由 code reviewer 处置；测试侧可补日期断言。
    - pane 头 hover 操作中「大纲」「关闭面板」按钮的点击→回调接线未直接测试（outline 经 prop 传入、关闭经 rail 按钮 `SessionRail.tsx:102` 测到同回调），行为已由高层间接覆盖。
    - 骨架屏动画时序按「有意不测」不出 finding，本次未列入。
    - Markdown HTML 安全断言非假绿：`querySelector("img")/querySelector("script")` 为 null 能真实拦截 rehype-raw 误配回归（配了 rehype-raw 时 img/script 元素会存在、断言即失败），`window.__xss` 未定义为补充信号。
- 总体判断：新测试整体可信、可触达真实生产逻辑、无假绿；但 AC 4 可测部分、AC 9 Esc 逐层、AC 10 缺失空态三项存在未解决的 AC 覆盖缺口，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-06 13:35 UTC+8)

复核 round 1 处置：以 `git diff a386d099db29b0557da237c7a62c904d9e230d33` 与当前代码/测试为准。实测 `pnpm vitest` 相关 4 文件 50 用例全绿（workspace_pane 13 / MarkdownMessage 6 / SessionPane 7 / WorkspaceView 24），无 `.skip`/`.only`/`@ts-ignore`/`eslint-disable`/恒真断言。

## Findings

### t225_test_f006 - AC 1 pane 头部 model/cwd 显示零断言（测试名声称覆盖但未达）

- 严重度：minor
- 锚点：AC 1（pane 头部徽标含 model、cwd 与 `轮数 · tokens · 日期`）
- 位置：`tests/unit/renderer/components/workspace/SessionPane.test.tsx:65-79`（测试名「头部显示 agent 徽标（含 model）、标题、cwd 与 轮数·tokens·日期 meta」，断言仅标题/`5 轮`/`1,200 tokens`/徽标存在/色条）；`src/renderer/components/workspace/SessionPane.tsx:135`（badge `title={slot_meta.model}`）、`:144`（cwd 拼入 meta 行）
- 问题：代码修复（code f001 SlotSession 补 model/cwd）后，SessionPane 已渲染 model（badge title）与 cwd（meta 行），`refresh_slot_meta`（`WorkspaceView.tsx:168-169`）也从 `row.model`/`row.directory` 传播到槽位——该链路完整但**零断言**。测试 META 已含 `cwd: "/path/to/proj"`、`model: "claude-sonnet-4"`，可断言而未断言；集成层 `refresh_slot_meta` 的 title/calls/tokens 有 rail 断言（`WorkspaceView.test.tsx:104-106`），model/cwd 传播无任何集成断言。回归（删 cwd 渲染 / 删 refresh_slot_meta 的 model/cwd 两行）测试无法发现。属「补断言」级扩展。
- 建议：头部用例补 `expect(screen.getByText(/\/path\/to\/proj/)).toBeTruthy()` 与 badge `getAttribute("title") === "claude-sonnet-4"`；可选在 WorkspaceView 集成用例（onFocus 打开，mock `getSessions` 返回含 directory 会话）断言 pane meta 含 cwd，封闭传播链路。

### t225_test_f007 - 聚焦索引清理（code f002 修复）无回归测试

- 严重度：minor
- 锚点：AC 6（聚焦模式退出后恢复原布局）；code f002 修复行为
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:325-326`（close_slot 清 focused/outline index）、`:350-351`（clear_all）、`:575-577`（confirm_recent）；`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx`（无关闭聚焦槽位用例）
- 问题：code f002 已修（关闭/清空/替换全部槽位时清 `focused_index`/`outline_index`，避免网格残留 focused 态），但无回归测试：现有 `.focused`/`data-focused` 断言均聚焦后立即退出或按键退出（`:502-505,518-531,546-553`），无「聚焦槽位被关闭 → grid 退出 focused」用例。若删去清理两行，测试全绿。
- 建议：补用例——装入两槽，聚焦槽 A，点 A 的「关闭面板」（或 rail 关闭），断言 `.slot-grid` 无 `focused` 且 `[data-focused="true"]` 消失。

## 结论

- 前轮 finding 复核（Round 2）：
    - **f001 已修**：`tests/unit/renderer/lib/workspace_pane.test.ts:67-86` 直测生产 `is_near_bottom`，覆盖近底真/滚离假/scrollTop 超范围 clamp 视为底部/内容不满一屏恒在底部，直接触达阈值判定逻辑。残（minor，非阻断）：f001 原建议的「阈值参数生效」「组件级 at_bottom→回到底部按钮 wiring（scroll 事件用例）」未补，纯函数层已覆盖 AC 4 可测核心。
    - **f002 已修**：`WorkspaceView.test.tsx:534-554` 打开聚焦+大纲，Esc 1 断言关大纲且 grid 仍 focused，Esc 2 断言退聚焦。若 handler 分支顺序反转（先退 focus），Esc 1 后 grid 不再 focused，断言即失败——能捕获顺序回归。
    - **f003 已修**：`SessionPane.test.tsx:138-147` missing 状态断言空态文案 + 无骨架屏，能区分 loading 空态（loading 有骨架屏），关键可观察行为已覆盖。残：未额外断言 `.pane-msgs` 不渲染（与空态文案冗余，非阻断）。
    - **f004 修不彻底**：fix_ref 声称「消息行角色/时间/null 分支由 MarkdownMessage + SessionPane 测试覆盖」不成立。核对：`.pane-msg-role` 角色标签无直接断言（脚部「用户 2 · Agent 1」测的是 `message_counts`，非行内角色）；`timestamp === null` 不渲染时间无用例（视图开关测试只用非 null 时间戳）；单行 checkbox → `on_toggle` 无用例（仅「全选可见/清空选择」按钮间接覆盖）。原 minor，维持 minor，不阻断。
    - **f005 修不彻底**：`WorkspaceView.test.tsx:556-575` 仍单 pane。多 pane「全部 pane 即时生效」语义靠 view 状态单源下发（`WorkspaceView.tsx:81,667` 传 `view` 到所有 pane）机制成立，但无多 pane 用例。原 minor，维持 minor。
- 改测方向复核：无。「补测」全部为新增用例且直接断言生产行为（纯函数输出 / DOM 渲染 / 快捷键层序），未发现「把断言迁就当前实现」式改测；t224 适配改测已在 round 1 判定合法，本轮无新改测。
- 本轮新发现：2 条（f006、f007，均 minor）
- 未进表提示：
    - `is_near_bottom` 阈值参数非默认值未测、`distance === 120` 精确边界未测（f001 原建议含「阈值参数生效」）。
    - `[`/`]` 无聚焦时首入第一占用槽（code f004 修复）无直接测试；现有 `[` 用例均先建立聚焦（`WorkspaceView.test.tsx:517-528`）。
    - SessionPane 头 hover「关闭面板」按钮 → `on_close` 接线未直接测试（rail 关闭已覆盖同一 `close_slot` 回调，行为间接可达）。
    - 视图开关多 pane 语义测试侧仍单 pane（f005 残留）。
    - 骨架屏动画时序按「有意不测」未列。
- 总体判断：3 条 important 测试 finding（f001-f003）已实质修复且测试可信；现存均为 minor 覆盖扩展（f004/f005 修不彻底、f006/f007 新增 minor、若干未进表提示）。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
