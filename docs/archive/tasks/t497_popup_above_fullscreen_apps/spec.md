# Task spec

## 背景

用户对比发现：其它菜单栏应用的弹出窗口能显示在**全屏应用之上**，本产品的用量弹窗则会切到全屏应用所在空间、被压在下面。核实（2026-09-17）：

- `src/main/core/main-panel/main-panel-controller.ts:137` 只调用 `target.setAlwaysOnTop(last_pin_to_top)`（且默认来自用户偏好 `pinToTop`，常为 false）；`src/main/core/main-panel/main-panel-controller.ts:244` 的 `setAlwaysOnTop(pin_to_top)` 同理。
- 全仓 **无** `setVisibleOnAllWorkspaces` / `visibleOnFullScreen` / `type: "panel"` 调用（grep 0 命中）。
- 因此窗口是普通 `NSWindow`：跟随当前 space，无法在全屏应用之上显示，也不会出现在所有桌面。

macOS 最佳实践（Electron 官方 API 语义）：

- `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`：让窗口出现在所有空间并**浮于全屏窗口之上**；菜单栏应用还需 `skipTransformProcessType: true` 以避免每次调用时窗口与 Dock 短暂消失。
- 构造函数 `type: "panel"`（macOS）：加 `NSWindowStyleMaskNonactivatingPanel`，窗口浮于全屏应用之上并出现在所有空间，且**不激活应用**（菜单栏弹窗的典型形态）。
- 弹层类窗口的置顶级别应为 `pop-up-menu`/`floating`，而非默认 `normal`。

## 契约区

### 范围

- 用量弹窗（popup 与 floating 两种模式）在 macOS 上：出现在所有空间，并可在全屏应用之上显示。
- 打开弹窗不激活/不抢焦点（不打断用户当前的全屏应用），关闭后不改变其它窗口状态。
- 保持既有语义：点击外部隐藏（popup）、pinToTop 用户偏好仍生效、Win/Linux 行为不变。

### 非范围

- 其它面板窗口（setting/agent/session/dev）的置顶策略（见 t493 的 chrome 改动）。
- 托盘的点击/菜单交互本身。
- 全屏动画、Mission Control 分组等系统行为细节。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：macOS 上，在某个应用处于全屏时点击托盘图标，用量弹窗显示在该全屏应用之上（不被压到其空间）。
- [ ] AC-002：弹窗显示时不会把当前全屏应用切出全屏、不抢键盘焦点。
- [ ] AC-003：切换桌面空间（Mission Control / 三指滑动）时弹窗仍可见（出现于所有空间）。
- [ ] AC-004：popup 模式点击外部隐藏的既有行为不变；floating 模式仍可常驻。
- [ ] AC-005：`pinToTop` 用户偏好语义不变（关闭时不会因本次改动被强制置顶在所有普通窗口之上）。
- [ ] AC-006：[deploy] Windows/Linux 行为不回归（弹窗仍按既有方式显示，不出现置顶异常）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 ~ AC-003：不可自动测试（需真实全屏应用与空间切换）；替代：`main_panel_controller` 单测断言在 macOS 平台注入下调用了 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })` 与预期置顶级别，且窗口创建参数含 `type: "panel"`；其余依赖 deploy 人工验证。
- AC-004：现有 popup 隐藏行为单测保持通过。
- AC-005：`pinToTop` 相关单测断言语义未变。
- AC-006：deploy 人工验证（Windows/Linux）。

## 上下文区

- 来源：用户反馈（2026-09-17）+ Electron 官方文档（`BaseWindow`/`BrowserWindow` 的 `setVisibleOnAllWorkspaces`、`type: 'panel'`、`setAlwaysOnTop` 级别）；无 pNNN。

### 有意不测

- 全屏切换动画期间的时序表现：系统行为，人工观察即可。

### 测试策略

- 单测：扩展 `tests/unit/main/main_panel_controller.test.ts`（假窗口记录调用序列：`setVisibleOnAllWorkspaces`/`setAlwaysOnTop`/构造选项），断言仅 darwin 生效。
- 黑盒：macOS 打包版 + 一个全屏应用（Safari/全屏视频）人工验证 AC-001~003、006（需用户许可）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- `type: "panel"` 与此产品的“点击外部自动隐藏”“不显示 Dock 图标”等既有行为是否冲突（panel 窗口的激活语义）：已验证无冲突。
    1. 本产品是双态菜单栏/桌面应用，在 macOS 上有正常 Dock 图标（见 t496 规范），不启用 `LSUIElement`，无“不显示 Dock 图标”既有约束。
    2. `type: "panel"` 向 macOS 底层注入 `NSWindowStyleMaskNonactivatingPanel`，使用量面板弹出时不夺取用户当前全屏应用的系统激活权与键盘焦点（配合 `showInactive()`）。
    3. `usage` 面板的关闭/隐藏行为为点击托盘切换（`open_or_toggle`）或 IPC `mainPanel:hide`，不依赖窗口本身的系统 blur 隐藏（系统 blur 仅用于独立托盘右键菜单 `trayMenuWin`），因此 `type: "panel"` 完全不破坏既有弹窗交互。
    4. 验证方式：`tests/unit/main/main_panel_controller.test.ts` 及 `tests/unit/main/window_manager.test.ts` 全覆盖断言生效，全量单测 3848 个用例无回归通过。

### 风险与回退

- 风险：`type: "panel"` 改变窗口激活/焦点行为，影响“点击外部隐藏”判定；`setVisibleOnAllWorkspaces` 若不传 `skipTransformProcessType` 会导致窗口闪烁。
- 回退：改动集中在 `main-panel-controller` 的窗口创建与显示路径，可单独 revert；可先只上 `setVisibleOnAllWorkspaces + visibleOnFullScreen`，确认无副作用再评估 `type: 'panel'`。

### 依赖与约束

- 仅 macOS 行为变化；Windows/Linux 必须保持现状。
- 与 t493 都可能触及窗口创建路径，合并时注意顺序（无硬依赖）。

### Finalization 时更新的 blueprint

- `docs/specs/window-management.md`：用量弹窗的 macOS 空间/全屏可见性与焦点策略。
