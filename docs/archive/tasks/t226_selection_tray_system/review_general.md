# Task review t226（reviewer_focus: 通用）

- task：`t226_selection_tray_system`
- spec：`docs/tasks/t226_selection_tray_system/spec.md`
- diff_anchor：`a3c4703bdeb6e2d0eacf6f377af6e5a753780920`
- target：`git diff a3c4703bdeb6e2d0eacf6f377af6e5a753780920`
- round：1
- reviewed_at：2026-08-06 15:05 UTC+8

## Findings

### t226_gen_f001 - 面板消息勾选态在「总数不变」的替换操作后变陈旧

- 严重度：important
- 锚点：AC 1「选中消息有明确视觉标识」/ AC 2「Shift 点击选中锚点到当前消息的范围」
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:422-425`（`is_selected` 直读 store，无订阅）、`src/renderer/components/workspace/SessionPane.tsx:232`（`selected={is_selected(m.id)}`）
- 问题：`SessionPane`/`WorkspaceView` 均未订阅 `selection_store`。勾选视觉更新的唯一重渲染路径是 `SessionShell` 顶栏徽标的 `useSyncExternalStore(() => selection_store.count())`（`session-shell/SessionShell.tsx:16-19`），React 对 snapshot 用 `Object.is` 比较，count 不变即不重渲染。`set_session`（Shift 连选/全选可见）可在 count 不变时替换某会话成员集合，导致面板勾选态与实际选择不一致。复现：会话 A 三条消息 m1/m2/m3，点选 m1、m3（anchor=m3，count 2），再 Shift 点 m2 → `set_session(A, [m2, m3])`，count 2→2，SessionShell 不重渲染，面板仍显示 m1 勾选、m2 未勾选，而托盘 chip 已正确变为 m2/m3。测试只断言托盘文本（`.tray-count`），未断言 checkbox 视觉，故全绿未暴露。
- 建议：让 `WorkspaceView`（或 `SessionPane` 每 pane）经 `useSyncExternalStore(selection_store.subscribe, () => selection_store.all())` 订阅 store，使任何变更都重渲染面板；托盘/SessionShell 的独立订阅保留。补一个「count 不变但集合成员变」的面板勾选态断言。

### t226_gen_f002 - 托盘高度不随空态/内容自动调整，与 demo 及 AC 4 不符

- 严重度：important
- 锚点：AC 4「托盘空态收成细条，有内容时展开」
- 位置：`src/renderer/components/workspace/SelectionTray.tsx:19`（`TRAY_MIN_H = 40`）、`:27`（`height` 初始 40）、`:41`（`style={{ height }}` 恒用拖拽态）
- 问题：`height` 只在拖拽时更新，空态/内容切换不重置。两个可观察症状：(a) 初次选中时 `height` 仍为 40，`.selection-tray` 内拖柄 6px + 脚栏约 38px 已超 40px，`.tray-scroll`（`flex:1; min-height:0`）被压到 0 高度，chip 完全不显示，需先拖高才看得到片段，与「有内容时展开」不符；(b) 拖高后清空选择，`expanded` 变 false 但 `height` 保留拖后值，空托盘仍是拖高的面板而非「收成细条」。demo 实现为默认 112px、空态 `animate` 回 40px（`frontend_demo/app/src/components/workspace/SelectionTray.tsx:55,78-81,138`），本实现两处均偏离。
- 建议：空态时固定用细条高度（忽略拖拽值），有内容时回到默认高度（如 112）或保留拖高值；`expanded` 切换时自动重置 `height`。为拖高手势留上下限测试。

### t226_gen_f003 - checkbox 用 `checked` + `onClick` 未配 `onChange`，触发 React read-only 警告

- 严重度：minor
- 锚点：无 AC 违反（行为可用）
- 位置：`src/renderer/components/workspace/SessionPane.tsx:320-328`
- 问题：`<input type="checkbox" checked={selected} onClick={...}>` 无 `onChange`，React 报「You provided a `checked` prop to a form field without an `onChange` handler. This will render a read-only field.」，t226 相关测试 stderr 均有此警告。功能依赖 onClick 在 change 前触发且受控 `checked` 覆盖，能工作但属反模式并污染日志。
- 建议：改用 `onChange={(e) => on_toggle(message.id, e.shiftKey)}`（事件里同样有 `shiftKey`）。

### t226_gen_f004 - markdown.ts 头部注释残留「时间格式化（分钟 / 完整）」

- 严重度：minor
- 锚点：无 AC 违反（文档一致性）
- 位置：`src/renderer/lib/session-history/markdown.ts:5`
- 问题：`format_time_full` 本 diff 已删除，注释仍写「时间格式化（分钟 / 完整）」，现只剩分钟短格式。
- 建议：改为「时间格式化（分钟）」。

### t226_gen_f005 - WorkspaceView.test.tsx 行 481 格式塌陷

- 严重度：minor
- 锚点：无 AC 违反（风格）
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:481`
- 问题：`it("rail 可折叠/展开", () => {        render(<WorkspaceView />);` 两语句挤同一行，diff 引入的格式破损。语法合法、测试通过，属风格缺陷。
- 建议：拆回两行。

### t226_gen_f006 - 两个「清空」按钮同名，可访问名冲突

- 严重度：minor
- 锚点：无 AC 违反（a11y/可用性）
- 位置：`src/renderer/components/workspace/SelectionTray.tsx:139`（托盘「清空」清选择）、`WorkspaceToolbar.tsx`（工具栏「清空」清空工作台）
- 问题：托盘「清空」清除已选片段、工具栏「清空」清空整个工作台槽位，两个动作可访问名同为「清空」。测试已依赖 `getAllByRole(...)[0]` 取序（`WorkspaceView.test.tsx:231`）。对屏幕阅读器与用户易混淆。
- 建议：托盘按钮文案区分（如「清空选择」），或给托盘按钮加不同 `aria-label`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：6 条（2 important + 4 minor）
- 未进表的提示：
    - `docs/blueprint/architecture.md:182-183` 仍描述旧选择/复制模型（决策 8/9/10，`build_copy_markdown`），spec 上下文区声明 finalization 时更新 architecture.md，故不判为当前缺陷，留待 finalization。
    - 旧 `build_copy_markdown` 测试整体删除理由写在 `session_history_markdown.test.ts:10-13` 注释而非 task.md 实施笔记（spec 测试策略要求写在实施笔记），理由已留存，仅位置不符，归为过程提示不单列。
    - `copy_format.test.ts` 用固定 epoch 断言 `06:13`/`06:14`（UTC+8 假设），`session_history_markdown.test.ts` 已有同模式先例，属项目既有时区假设，未单列。
    - `estimate_tokens` 按字符数估算并以「tokens」展示，spec 用「估算」措辞故不算 AC 违反；但对英文文本偏差约 4x，如追求 demo 对齐的真实 token 估算可后续改 spec/实现。
- 总体判断：2 条 important（面板勾选态陈旧、托盘高度不自动调整）需修复后复审；实现主路径（store 单例、Shift 锚点、三格式复制、快捷键、旧路径清理）正确，50 个相关单测与 `tsc --noEmit` 全绿。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-06 15:15 UTC+8)

- round：2
- reviewed_at：2026-08-06 15:15 UTC+8
- 依据：`git diff a3c4703bdeb6e2d0eacf6f377af6e5a753780920`（含 round 1 修复）。复核实测：相关 6 个测试文件 58 passed；`tsc --noEmit`、eslint 通过；WorkspaceView 测试输出无 React read-only 警告（f003 生效）。

### 前轮 finding 复核

| finding_id    | severity  | 结论   | 依据（diff / 代码）                                                                                                                                                                                                                                                                                                                                  |
| ------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t226_gen_f001 | important | 已消除 | `WorkspaceView.tsx:428` 新增 `useSyncExternalStore(selection_store.subscribe, () => selection_store.all())`；`all()` 每次变更返回新数组引用，set_session 在 count 不变时替换会话成员也触发面板重渲染。`is_selected`（`WorkspaceView.tsx:422-426`）渲染期直读 store，订阅 + 渲染链完整。实现层修复成立，但新增回归测试未覆盖其核心场景，见本轮 f007。 |
| t226_gen_f002 | important | 已消除 | `SelectionTray.tsx:35` `effective_height = expanded ? Math.max(height, TRAY_CONTENT_H) : TRAY_MIN_H`：空态恒 40、首次有内容 max(40,160)=160、清空回 40。测试断言 40/160/40（`SelectionTray.test.tsx:22-34`）。拖拽上下限逻辑未测，见本轮 f008。                                                                                                      |
| t226_gen_f003 | minor     | 已消除 | checkbox 改 `readOnly` + `onClick={(e) => on_toggle(message.id, e.shiftKey)}`（`SessionPane.tsx:317-325`），readOnly 抑制受控 read-only 警告（实跑确认无警告）；`SessionPane.test.tsx:53` 补 `on_hover` prop。                                                                                                                                       |
| t226_gen_f004 | minor     | 已消除 | `markdown.ts` 头部注释改「时间格式化（分钟）」，删除 `format_time_full` 与 `build_copy_markdown`，模块注释标注复制格式已移交 copy-format。旧测试整体删除理由写在测试文件头注释（round 1 已接受位置不符）。                                                                                                                                           |
| t226_gen_f005 | minor     | 已消除 | `WorkspaceView.test.tsx:481-482` `it(...)` 与 `render(...)` 已拆回两行。                                                                                                                                                                                                                                                                             |
| t226_gen_f006 | minor     | 已消除 | 托盘清空按钮 `aria-label="清空摘选"`（`SelectionTray.tsx:161`），可访问名覆盖可见文本「清空」，与工具栏「清空」区分；托盘测试用 `getByRole name=清空摘选`，工具栏测试用精确 `name=清空`（exact 默认，不匹配「清空摘选」）。                                                                                                                          |

### 本轮 Findings

#### t226_gen_f007 - f001 回归测试未覆盖「count 不变、成员替换」核心场景，守卫无效

- 严重度：important
- 锚点：AC 2「按住 Shift 点击可选中锚点到当前消息的范围」/ 测试可信（弱化断言、AC 缺测试）
- 位置：`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:490-524`（「Shift 连选」测试）
- 问题：该测试以 f001 回归自居（注释「f001 回归：set_session 替换后（count 不变时）面板勾选态同步刷新」），但其每一步 count 都在变（0→1→3→2），从不落入 f001 的失败模式「count 不变但成员替换」。唯一的面板勾选断言 `checkbox[2].checked === false`（行 523）在 round 1 bug 态下同样成立——因为每次变更 count 都变化，SessionShell 订阅 `count()`（`SessionShell.tsx:16`）会重渲染并级联重渲染其子 `WorkspaceView`，面板在无订阅的 bug 态下也会随之刷新；且该断言只验 m3 未勾，未断言任何 checkbox 变为勾选。结论：把 `WorkspaceView.tsx:428` 的订阅删掉，本测试依旧全绿，起不到防回归作用。
- 建议：构造「count 不变、成员替换」场景补断言。例：同会话 m1/m2/m3/m4，点 m1、m4（count 2，anchor m1），Shift 点 m2 → `set_session(A, [m1,m2])`，count 2→2、m4 出、m2 入；断言 m2 checkbox 变勾选、m4 checkbox 变未勾选（在无订阅 bug 态下这两项均保持旧态，测试将红）。同时把现有行 523 的负向断言改为正向（Shift 全选后断言 box0/box2 均勾选）。

#### t226_gen_f008 - 托盘拖拽高度上下限逻辑无测试

- 严重度：minor
- 锚点：AC 4「拖上沿可在下限与上限之间调高」/ round 1 f002 建议
- 位置：`SelectionTray.tsx:65-75`（`start_drag` 的 `Math.min(TRAY_MAX_H, Math.max(TRAY_MIN_H, ...))` clamp，TRAY_MIN_H=40 / TRAY_MAX_H=320）
- 问题：round 1 f002 建议「为拖高手势留上下限测试」，实现只补了空/内容态切换（40/160/40，`SelectionTray.test.tsx:22-34`），拖拽 clamp 路径与 320 上限完全未测。真实拖拽标 `[deploy]`，故为覆盖缺口而非行为缺陷。
- 建议：补模拟 `mousedown`/`mousemove` 的上下限断言，或将 clamp 抽纯函数直接测 40/320 边界。

### 结论

- 前轮 finding 复核：6 条全部已消除（实现层逐一核实，含实跑测试与类型/静态检查）。
- 本轮新发现：2 条（1 important + 1 minor）
- 未进表的提示：
    - `SessionShell.tsx:75-84` 顶栏「摘选托盘」`<button>` 无 onClick，点击无动作，仅作徽标展示；round 1 未 flag 的既有项、非修复引入，归为观察不入表。
    - `WorkspaceView.tsx:442-444` 全局 Space keydown 与聚焦 checkbox 的原生 Space 激活可能交互（聚焦 checkbox 时按 Space 可能同时触发原生 click 与 hover 消息切换）；依赖浏览器默认行为、边缘场景未实测，不入表。
- 总体判断：2 条 important 的实现修复均成立（订阅、高度自动调整）；但 f001 新增回归测试未覆盖其核心「count 不变成员替换」场景，round 1 bug 态下同样全绿，属未解决 important，需补强测试后进入下一轮。
- 系统性 follow-up：无

verdict: FAIL

## Round 3 (2026-08-06 15:30 UTC+8)

- round：3
- reviewed_at：2026-08-06 15:30 UTC+8
- 依据：`git diff a3c4703bdeb6e2d0eacf6f377af6e5a753780920`（含 round 2 修复）。复核实测：`npx vitest run` 全量 230 文件 2434 passed / 1 skipped（其中 WorkspaceView.test.tsx 28 passed、SelectionTray.test.tsx 7 passed）；`npx tsc --noEmit` exit 0。

### 前轮 finding 复核

| finding_id    | severity  | 结论   | 依据（diff / 代码）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t226_gen_f007 | important | 已消除 | 新增独立测试「f001 回归：count 不变的 set_session 成员替换触发面板勾选刷新」（`WorkspaceView.test.tsx:529-588`）：点选 m1+m3（count 2）后直接驱动 `selection_store.set_session` 替换为 m1+m2（count 仍 2、成员 m3→m2），断言 c0/c1 checked=true、c2=false。已核实该场景真落入失败模式：本测试独立渲染 `<WorkspaceView/>`（无 SessionShell），面板勾选更新的唯一重渲染路径即 `WorkspaceView.tsx:428` 的 `useSyncExternalStore(selection_store.subscribe, () => selection_store.all())`；`SessionPane` 不订阅 store、只经 prop 收 `is_selected`（grep 确认无 `selection_store` 引用）。round 1 bug 态（删订阅）下 set_session 后 c1 保持 false、c2 保持 true，断言 c1=true/c2=false 必红；故测试为真守卫。`all()` 返回模块级 `items` 引用、变更间稳定，无无限渲染循环风险。 |
| t226_gen_f008 | minor     | 已消除 | `clamp_tray_height` 抽为纯函数（`SelectionTray.tsx:13-15`，`Math.min(TRAY_MAX_H, Math.max(TRAY_MIN_H, base+delta))`），`start_drag` on_move（`:76`）复用同一函数——测试即覆盖真实拖拽路径。测试（`SelectionTray.test.tsx:109-113`）断言上界 320、下界 40、正常值 180，恰为 f008 建议的纯函数方案，且已实跑通过。                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### 本轮 Findings

无。

### 结论

- 前轮 finding 复核：f007（important）与 f008（minor）均已消除，以 diff 与实跑（测试 + typecheck）为准，不采信处置表自述。
- 本轮新发现：0 条
- 未进表的提示：
    - `WorkspaceView.tsx:428` 订阅使每次选择变更触发整个 WorkspaceView（含全部槽位面板）重渲染；粒度为组件级、规模可接受，且为 f001 建议方向，属观察不入表。
    - 新回归测试手动构造 `SelectedItem`（`role_index`/`session_title` 简化）并经 `set_session` 直驱，不测 Shift 点击到 set_session 的组装链；该链已由「Shift 连选」测试覆盖，两者互补，不入表。
- 总体判断：round 2 两条 finding 均已按建议落实，全量门禁（2434 单测 + tsc）绿，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
