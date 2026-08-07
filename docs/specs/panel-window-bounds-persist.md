# 面板窗口位置大小持久化

## 背景

会话（history）与代理（agent）面板窗口由固定尺寸创建，每次打开都回到默认位置大小，用户需重新调整。设置窗口已有 bounds 保存/恢复机制（displayId、最小尺寸钳制、workArea 钳制），直接复用其模式。

## 范围

- 代理面板窗口：移动或调整大小后保存 bounds，关闭重开及软件重启后恢复上次位置与大小。
- 会话面板窗口：同上，与代理面板各自独立保存。
- 恢复时的可见性钳制：目标位置已不在任何显示器的可见工作区（如拔掉副屏、分辨率变化）时，钳制回可见区域。
- 旧配置无对应键时按现状默认尺寸位置创建。

## 非范围

- 不动用量面板（popup）的 `floatingBounds` 机制与设置窗口的 `settingsBounds` 机制。
- 不改变窗口的其他行为（单例、show/focus、关闭语义）。
- 不持久化最大化/全屏状态之外额外的窗口形态。

## 验收标准

- [x] AC1：调整代理面板窗口的位置与大小后关闭再打开（或重启应用），窗口恢复到上次的位置与大小。
- [x] AC2：会话面板窗口满足同样的保存与恢复；两个窗口的 bounds 互不影响。
- [x] AC3：保存的 bounds 落在已不可见的显示区域时，恢复结果被钳制到可见工作区内。
- [x] AC4：配置中无对应键（旧配置）时，首次打开按现状默认尺寸位置显示，不产生错误。
- [x] AC5：现有测试与 e2e 全部通过，无回归。

## 实现要点

- 新增 config 键 `agentWindowBounds` + `historyWindowBounds`（复用 FloatingBoundsConfiguration 结构，shared + zod 双端）。
- `src/main/window/window-bounds.ts`：`compute_clamped_bounds` 钳制纯函数（displayId 失效回退主屏、最小尺寸提升、workArea 收缩/负坐标/超界钳制）+ `apply_window_bounds`（真实 screen）+ `watch_window_bounds`（move/resize 保存，值未变跳过防写放大）+ `get_saved_bounds`。
- index.ts `create_panel_window`：createWindowFor 后 apply 保存 bounds（无值 center），注册 move/resize 保存（scheduleSave thunk 防回退）。agent/history controller 的 create_window 改用之；两窗口各自独立键。

## 测试覆盖

- `tests/unit/main/window-bounds.test.ts`：钳制纯函数 8 例（可见/负坐标/超右界/最小尺寸/超大收缩/副屏/displayId 失效/无 displayId）+ get_saved_bounds 3 例。
- `tests/e2e/electron/panel_window_bounds.spec.ts`：agent 窗口移动/调整大小 → 关闭 → 重开恢复 bounds（AC1）。
- `pnpm test` 全量 + `pnpm test:e2e:electron` + `pnpm test:packaged`。
