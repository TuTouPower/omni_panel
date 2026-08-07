# Task review t251（reviewer_focus: 通用）

- task：`t251_panel_window_bounds_persist`
- spec：`docs/tasks/t251_panel_window_bounds_persist/spec.md`
- diff_anchor：`49c0ea008d4d5fb38d40e3d1655c0fa072a9b103`
- target：`git diff 49c0ea008d4d5fb38d40e3d1655c0fa072a9b103`
- round：1
- reviewed_at：2026-08-08 01:57 UTC+8

## Findings

### t251_gen_f001 - AC2 会话窗口无独立 e2e 覆盖

- 严重度：minor
- 锚点：AC2（会话面板窗口保存/恢复 + 两窗口互不影响）缺直接 e2e 验证
- 位置：`tests/e2e/electron/panel_window_bounds.spec.ts:61`
- 问题：新增 e2e 仅覆盖 agent 窗口（移动/调整大小 → 关闭 → 重开恢复）。history 窗口的保存/恢复与「两个窗口 bounds 互不影响」未被 e2e 直接验证。因 agent/history 共用同一 `create_panel_window`（`src/main/index.ts:354`）代码路径且使用独立 config 键（`agentWindowBounds`/`historyWindowBounds`，`src/main/index.ts:355`），且 `get_saved_bounds` 单测覆盖两键（`tests/unit/main/window-bounds.test.ts:88-121`），「互不影响」在结构上由「各自独立键 + 只写 `[k]` 的 spread 更新」保证，风险可控。但 AC2 作为独立验收条目未获端到端证据。
- 建议：在 `panel_window_bounds.spec.ts` 增加 history 窗口用例（移动 history 窗口 → 重开断言恢复；同时断言 agent 窗口 bounds 键不受影响），或将 AC2 归入共享路径已覆盖说明。

### t251_gen_f002 - `apply_window_bounds` 注释与实现不符

- 严重度：minor
- 锚点：行为缺陷（注释承诺「钳制异常时返回 false」，实际无该分支）
- 位置：`src/main/window/window-bounds.ts:76-77`
- 问题：注释写「无保存值或全部钳制异常时返回 false」，但实现（第 78-83 行）仅在 `!saved` 时返回 false；`compute_clamped_bounds` 无异常路径，`win.setBounds(clamped)` 后恒返回 true。调用方 `src/main/index.ts:361` 据此注释将「钳制异常」也归入 `win.center()` 分支，实际该分支只在无保存值时触发。注释是唯一出处，误导后续维护者对返回语义的理解。
- 建议：注释改为「无保存值（或键缺失）时返回 false」，与实现一致。

### t251_gen_f003 - 保存时最小尺寸提升与窗口实际可缩尺寸不对称

- 严重度：minor
- 锚点：AC1 边缘偏差（缩到 <480x360 时重开尺寸被放大）
- 位置：`src/main/window/window-bounds.ts:102-103`（`Math.max(PANEL_MIN_WIDTH, bounds.width)`）
- 问题：保存 handler 把宽度/高度提升到 PANEL_MIN（480x360），但 `WINDOW_CONFIGS.agent`/`.history` 未设 `minWidth`/`minHeight`（`src/main/window/window-manager.ts:58-75`），用户可实时把窗口缩到更小（如 400x300）；此时保存值为 480x360，重开后窗口比用户上次设的尺寸大。该行为与设置窗口先例（`src/main/index.ts:581-582`）完全一致，符合 spec 范围「语义与设置窗口现状一致」，故不判 blocking；但属 AC1「恢复到上次大小」在小于最小尺寸场景下的可观察偏差。
- 建议：若需严格对齐 AC1，可为 agent/history 窗口补 `minWidth`/`minHeight` 约束使实时尺寸与保存钳制一致；或明确接受与设置窗口先例一致的现状，在 task.md 处置表中记录。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条，全部 minor
- 未进表的提示：
    - 未重跑完整 240-file 套件；仅实际运行新增单测（11 passed）、e2e（1 passed）与 `tsc --noEmit`（无错）。implementer 自述全量全绿。
    - e2e 用 `setBounds` 脚本化模拟拖拽而非真实鼠标拖动，但走真实 move/resize 事件 → `watch_window_bounds` → `currentConfigSnapshot` 保存路径；x/y 精确断言、宽高 `>= target - 2` 容忍平台窗口管理/钳制偏差，非危险弱化。
    - renderer 全量 config 保存与 main 侧 bounds 保存存在既有全量快照互相覆盖的时序窗口（设置窗口先例同款）；`scheduleSave(() => currentConfigSnapshot)` thunk 已缓解防抖窗口内的回退，非本 task 引入。
- 总体判断：AC1/AC3/AC4 均有可观察测试触达真实路径；AC2 共享同一代码路径 + 键分离单元覆盖，仅缺独立 e2e；钳制逻辑与保存时机对齐设置窗口先例，未发现 critical/important 问题。仅有 minor，PASS。
- 系统性 follow-up：无

verdict: PASS
