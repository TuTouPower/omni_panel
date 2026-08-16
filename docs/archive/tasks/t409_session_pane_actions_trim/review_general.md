# Task review t409（reviewer_focus: 通用）

- task：`t409_session_pane_actions_trim`
- spec：`docs/tasks/t409_session_pane_actions_trim/spec.md`
- diff_anchor：`e9b953f2563378b97cd90781a953c121c23b9746`
- target：`git diff e9b953f2563378b97cd90781a953c121c23b9746`
- round：1
- reviewed_at：2026-08-16 04:01 UTC+8

reviewed_scope: 11fb583cbbe1fb71

## Findings

### t409_gen_f001 - 关闭面板按钮的点击行为不再有测试覆盖

- 严重度：important
- 锚点：AC-003（头部保留按钮渲染与点击行为不变）；spec 上下文区测试策略「新增断言三按钮不存在、保留按钮可点」
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:839`（仅断言渲染）；`src/renderer/components/workspace/WorkspaceView.tsx:81`（`close_slot`）
- 问题：diff 删除了原「关闭聚焦槽位后网格不残留聚焦态」用例，该用例是全仓唯一通过点击「关闭面板」按钮触达 `on_close → close_slot → hook_close_slot` 链路的测试。当前 `grep -rn "关闭面板" tests/` 仅剩两处 `getByRole` 渲染断言，无任何 fireEvent 点击。AC-003 要求「点击行为不变」，关闭按钮的点击路径现已无测试验证；「大纲」点击由 Esc 用例覆盖，「关闭面板」缺失。
- 建议：补一条最简用例——打开一个槽位后 `fireEvent.click(screen.getByRole("button", { name: "关闭面板" }))`，断言槽位移除（如回到「工作台为空」或 `.session-slot-title` 数量减一）。

### t409_gen_f002 - SessionPane.test 同 describe 内 AC 编号口径混杂

- 严重度：minor
- 锚点：测试结构清理
- 位置：`tests/unit/renderer/components/workspace/SessionPane.test.tsx:513`（标题「AC5：…」属 t324 旧编号）与 `:524`（新增「AC-001：…」属 t409 契约区编号）
- 问题：相邻两条用例分别引用两个 task 的 AC 编号，读者无法判断「AC5」指向何处；不影响断言有效性。
- 建议：把 t324 旧用例标题改为描述性文本（去掉 AC5 编号）或注明 `t324 AC5`。

## 结论

- 本轮新发现：2 条（important ×1，minor ×1）
- 未进表的提示：`docs/specs_index.md` 中 `session_window_design_migration` 行更新描述未动日期列（日期恰为当日，不判问题）；全量套件 9 项 skipped 为既有项，本 diff 未新增 `.skip`/`.only`。无其他范围外观察。
- 总体判断：删除实现干净彻底（grep 清零、类型检查通过、套件全绿），但 AC-003 对保留按钮「点击行为」的验证在删除旧用例后出现缺口，须补测后方可信。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`——独立重跑 `SessionPane.test.tsx`/`WorkspaceView.test.tsx`（70 passed），新增用例以 `queryByRole` 断言三按钮不存在；`grep` src 无 `on_select_all`/`on_clear_select`/`on_focus` 残留。
- AC-002：`re_verified`——`tsc --noEmit`（`noUnusedLocals` 开启）exit 0；`grep` src 无 `focused_index`/`data-focused`/`col-span-full`/`select_all_in_column`/`clear_selection_in_column` 残留，CSS 亦无 `.focused` 选择器残留。
- AC-003：`re_verified`（部分）——渲染断言已复验；「大纲」点击经 Esc 用例触达；「关闭面板」点击无测试，即 f001。
- AC-004：`re_verified`——逐条 checkbox 选择、托盘展开/复制、跨槽位计数合计用例更新后通过（`WorkspaceView.test.tsx` 全绿）。
- AC-005：`re_verified`——独立重跑 `pnpm test` 全量：274 文件 3281 passed、9 skipped（既有），exit 0。

coverage = 5 / 5

verdict: FAIL

## Round 2 (2026-08-16 04:06 UTC+8)

- round：2
- reviewed_at：2026-08-16 04:06 UTC+8

reviewed_scope: 979fec87a19202ff

### 前轮 finding 复核

- t409_gen_f001（important，AC-003 关闭面板点击无测试覆盖）：**已消除**。`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:842` 新增用例「AC-003：点击关闭面板移除槽位回到空态」：`fireEvent.click(screen.getByRole("button", { name: "关闭面板" }))`（`:852`）触达 `on_close → close_slot → hook_close_slot` 链路，断言可观察行为 `getByText("工作台为空")`（`:854`）及 `unsubscribe` 以 `("claude_code", "win", "sess_a")` 被调（`:856`）。已核实生产逻辑 `use-workspace-columns.ts:274-286` 的 `close_slot` 确实先调 `sessionHistory.unsubscribe` 再移除槽位，断言非空转 mock。独立重跑该文件 41 用例全绿。
- t409_gen_f002（minor，SessionPane.test 同 describe 内 AC 编号口径混杂）：**已消除**。`tests/unit/renderer/components/workspace/SessionPane.test.tsx:513` 标题改为「会话标题在第二行可见，头部保留大纲/关闭（t324 标题可见 + t409 动作保留）」，裸「AC5」已去除并显式标注来源 task；`grep` 该文件无 `AC5` 残留（`SessionRail.test.tsx:100` 的「AC5」属另一文件、不在 f002 范围）。

### 本轮新发现

0 条。

修复过程扫描（以 diff 为准）：

- 新增用例使用真实 `fireEvent.click` 交互，无 `.skip`/`.only`、无恒真断言、无弱化断言（diff 全量 grep 无命中）。
- SessionPane 重命名用例的断言由 5 按钮循环改为 2 按钮（大纲/关闭面板），与 AC-001 三按钮删除一致，属 spec 要求的同步更新，非弱化。
- 指纹核对：`review_scope_fingerprint` 重算当前 diff = `979fec87a19202ff`，与本节 reviewed_scope 一致，审查后无额外改动。

### 结论

- 前轮 finding 复核：f001 已消除、f002 已消除，均以 diff 与测试代码核实。
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：两条前轮 finding 均真修，修复未引入新问题，AC-003 点击路径覆盖缺口已补齐。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified`——重跑 `SessionPane.test.tsx`/`WorkspaceView.test.tsx`（68 passed），`queryByRole` 断言三按钮不存在。
- AC-002：`re_verified`——Round 1 已核 `tsc --noEmit` 与 grep 清零；本轮 diff 未触及 src 生产代码，结论沿用 Round 1 独立验证结果。
- AC-003：`re_verified`——渲染断言 + 新增关闭点击用例（`WorkspaceView.test.tsx:842`）独立重跑通过；「大纲」点击经 Esc 用例触达。
- AC-004：`re_verified`——`WorkspaceView.test.tsx` 逐条 checkbox/托盘用例全绿（41 passed）。
- AC-005：`re_verified`——独立重跑 `pnpm test` 全量：274 文件 3282 passed、9 skipped（既有），exit 0。

coverage = 5 / 5

verdict: PASS
