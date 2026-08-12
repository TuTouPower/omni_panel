# Task review t323（reviewer_focus: 通用）

- task：`t323_session_topbar_buttons_to_titlebar`
- spec：`docs/tasks/t323_session_topbar_buttons_to_titlebar/spec.md`
- diff_anchor：`20751dc1994d4b0630af70179ed360b74725dd17`
- target：`git diff 20751dc1994d4b0630af70179ed360b74725dd17`
- round：1
- reviewed_at：2026-08-12 20:21 UTC+8

## Findings

Round 1 零 finding。全 diff 10 文件逐行审阅，重点核实 state 提升、ref 注册、rail-toggle 上移、三按钮功能保留、AC-003 空行消除，未发现 critical / important / minor 问题。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：
    - `on_register_clear` ref 模式存在理论首帧窗口（清空按钮在 WorkspaceView 挂载 effect 注册 clear_all 前被点击会静默 no-op），但该窗口内工作台必为空态，清空本就是空操作，无可观察坏结果，不构成 finding。
    - `on_count_change` 上报存在单帧滞后（header 视图菜单在一次 commit 内读到旧 count），瞬时不可观察，且与旧实现（工具栏 live 读 WorkspaceView 内部 count）行为等价，不构成 finding。
    - header 三按钮在窄窗口下的潜在横向溢出：spec 上下文区「有意不测」已声明不做多 viewport 截图矩阵，e2e 固定 1280 viewport 通过，按已批准决策不报。
    - rail 折叠后 `grid.top` 与 `rail-scroll` 容器顶边基线差 0~1px（grid `p-px`），与 t318 既有基线断言一致，无回归。
- 总体判断：实现正确，AC-001~004 全部覆盖且断言触达真实路径，测试可信。无未解决 critical / important，PASS。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001（三按钮渲染于刷新按钮左侧，顺序 最近会话→清空→视图）：`re_verified`。复跑 `pnpm vitest run` 相关文件 48 通过；查证 `SessionShell.test.tsx` AC-001 用 `compareDocumentPosition` 断 DOM 顺序（recent→clear→view→refresh 均 FOLLOWING）、`PanelTitleBar.test.tsx` before_actions 插槽测试、e2e `session_panel.spec.ts` t323 用 bounding box 断 y 在 titlebar 内且 `view.right <= refresh.left+1`（几何推算：actions_cls `gap-1` 下间距 4px，成立）。
- AC-002（最近会话弹窗/清空全部槽位/视图下拉含原选项）：`re_verified`。查证 `WorkspaceView.test.tsx`「清空按钮退订全部并回到空态」经 `render_shell` 点顶栏清空按钮 → `clear_workspace_ref.current` 注册路径 → 断言「工作台为空」；「最近会话：快捷选择 + 清空替换全部槽位」经顶栏按钮开 modal → confirm_recent → 断言 2 槽位；视图菜单测试经顶栏「视图」点开断 aria-pressed 与 `--cols` 联动；`WorkspaceToolbar.test.tsx` 断下拉含显示时间戳/紧凑模式/会话排布及 count=0 时隐藏。复跑通过。
- AC-003（卡片信息栏顶边直顶顶栏下边，无额外空白行；grid 与 rail 同基线）：`re_verified`。查证 `WorkspaceView.test.tsx` t323 布局测试断 `.session-workspace-topbar` 为 null 且 `.session-workspace` firstElementChild 为 body；e2e 断 `Math.abs(grid.top - topbar.bottom) <= 1`、`Math.abs(grid.top - rail_scroll.top) <= 1`（几何推算：topbar 下无 margin，grid `p-px` 属 border-box 内，差 0，成立）。单测复跑通过；e2e 断言已读码核实，未重跑。
- AC-004（rail-toggle 折叠/展开行为不变，折叠后 rail 收缩、内容区仍可用）：`re_verified`。查证 `SessionShell.test.tsx` AC-004 断 toggle 在 `.session-topbar` 内、不在 `.session-workspace` 内，点击后 `.session-rail` classList 含 `collapsed`，再点展开移除；`WorkspaceView.test.tsx`「rail 可折叠/展开（t323 上移顶栏后行为不变）」经 shell 实路径验证。toggle `w-[220px]↔w-11` 与 rail 同宽同 `transition-[width] duration-200`，折叠宽度对齐。复跑通过。

coverage = 4 / 4

### 关键审阅记录（证据）

- state 提升正确性：`count` 由 WorkspaceView `occupied_count(slots_state)` 派生，`useEffect([count])` 上报 `set_count`（稳定）；初始 0 与空态一致，槽位变化后同步更新，无竞态/死循环（layout 校正 effect 终止条件：`choices.some(...layout)` 命中即停）。
- `on_register_clear` 可靠性：注册的 `clear_all` 为 `useCallback([hook_clear_all])`，`hook_clear_all` 内部经 `slots_ref`（ref）读状态，恒稳定，无陈旧闭包；unmount cleanup 置 null，SessionShell 内 WorkspaceView 常驻（tab 切换仅 `hidden`），注册始终有效。单测经真实点击验证。
- 三按钮功能保留：最近会话经 `recent_open` 受控 prop + `confirm_recent`（on_recent_close→hook_clear_all→open_session）；清空经 ref 注册 clear_all；视图经 `view` 受控 prop + `on_view_change`（SessionShell set_view），`SessionPane` 收到 view。与旧实现行为逐一等价。
- AC-003：`session-workspace-topbar` 行整体移除，body 成为 `.session-workspace` 首子元素，grid 顶边 = 顶栏下边。
- 测试可信度：所有受控交互测试经 `render_shell`（SessionShell 实路径），未 mock 被测逻辑；`render_workspace` 仅用于纯槽位/消息/选择逻辑（不依赖被提升回调）；无 `.skip`/`.only`/恒真断言/弱化断言/`@ts-ignore`。t318 旧布局断言（占满整行/同高/右对齐）随工具栏内联化语义作废，按 TDD 纪律替换为新语义断言，非弱化。

reviewed_scope: f1fc7a1195e2c158

verdict: PASS
