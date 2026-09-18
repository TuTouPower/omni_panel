# Task spec

## 背景

在 macOS 上，当其它应用处于原生全屏（独立 Space）时，点击菜单栏 OmniPanel 图标弹出的用量弹窗（左键）或托盘右键菜单窗口会被限制在普通桌面空间，无法覆盖在全屏应用之上，导致系统自动切回普通桌面或弹窗不可见。此前 t497 虽引入了 `visibleOnFullScreen` 与 `type: "panel"`，但由于将窗口层级（`setAlwaysOnTop`）与 `pinToTop` 用户配置绑死（默认 `pinToTop: false` 会在构造与展示时调用 `setAlwaysOnTop(false)` 打回 normal 层级），导致弹窗盖不住全屏；且托盘右键菜单 `trayMenuWin` 仍使用普通 BrowserWindow 并在右键触发时调用 `focus()` 强切空间。

## 契约区

### 范围

- `src/main/core/main-panel/main-panel-controller.ts`：
    - macOS (darwin) 下解耦「弹出展示期间覆盖全屏」与「用户设定的 pinToTop（始终置顶）」；
    - 引入明确的提权展示状态机：展示时临时提权至 `setAlwaysOnTop(true, "floating")`；在隐藏（hide）或失焦关闭时，严格根据用户配置的真实 `pinToTop` 恢复（若为 false 则降回 normal），杜绝残留置顶；
    - 在 `apply_config_change` 时正确维护用户配置基准，窗口隐藏后始终恢复最新的 `pinToTop` 配置。
- `src/main/index.ts`（托盘右键菜单 `trayMenuWin`）：
    - 构造参数补齐 macOS 跨全屏属性：`type: "panel"`、`visibleOnFullScreen: true`；
    - 平台门控与交互收起闭环：
        - 在 macOS (darwin) 下：右键弹出时不主动调用 `focus()`，改用 `showInactive()`（或配套无 Space 跳转展示），避免强行切换系统 Space；同时完善收起机制（监听全局失活或托盘再次点击主动隐藏，杜绝因未获焦无法触发 blur 而卡死在屏幕上）；
        - 在 Windows / Linux 下：严格保持原有的 `show() + focus() + once("blur", hideTrayMenu)` 行为，绝不退化。
- 自动化测试：
    - 增加对用量弹窗在 darwin 下弹出展示提权、失焦隐藏恢复 `pinToTop` 以及多轮连击与配置变更的状态机单测；
    - 增加对 `trayMenuWin` 在 darwin 下右键弹出时不触发主焦点切换、而在非 darwin 下保持原有焦点的平台分支单测。

### 非范围

- 不修改 Windows / Linux 平台下的窗口展示逻辑与层级逻辑。
- 不修改除用量弹窗与托盘右键菜单之外的其它独立面板（设置/会话/Agent/Dev 面板）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在 macOS (darwin) 环境下，用量弹窗展示期间显式处于 `setAlwaysOnTop(true, "floating")` 以保证浮于全屏应用之上；在弹窗隐藏或失焦时严格按照用户配置的 `pinToTop` 值恢复层级，关闭后不残留多余置顶。
- [ ] AC-002：托盘右键菜单窗口（`trayMenuWin`）配置 `visibleOnFullScreen: true` 与 `type: "panel"`；在 macOS (darwin) 下右键弹出时不主动调用 `focus()` 强切 Space，且在点击菜单外或二次点击时能正常收起关闭，杜绝菜单卡死；在 Windows / Linux 上严格保持原有 `show() + focus()`。
- [ ] AC-003：单元测试覆盖 macOS 平台下用量弹窗弹出展示、失焦隐藏以及中途更改配置时的 `setAlwaysOnTop` 状态机流转断言，并断言托盘右键在不同平台下的焦点门控与生命周期。
- [ ] AC-004：`[deploy]` 在 macOS 上有应用处于全屏状态时，点击菜单栏 OmniPanel 图标，用量弹窗与右键菜单均能直接覆盖在全屏应用界面之上，不发生桌面空间跳转。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001：可自动测试（断言 controller 的 setAlwaysOnTop 调用参数与失焦恢复）。
- AC-002：可自动测试（断言平台分支、窗口配置与收起回调）。
- AC-003：可自动测试。
- AC-004：不可自动测试。须真机全屏应用下人工点击验证。

## 上下文区

- 来源：p250（2026-09-18 核实：t497 将全屏展示与 `pinToTop` 耦合；经 OpenCode Muse-Spark-1.3 审查揭示单纯 showInactive 将导致无法触发 blur 卡死在屏幕，必须配套收起机制与平台分支门控）。

### 有意不测

- 非 macOS 平台的全屏 Space 切屏（macOS 特有行为）。

### 测试策略

- 针对 controller 与主进程窗口行为编写基于 mock BrowserWindow 的单元测试，严格核查状态机流转序列（show -> hide -> show 及隐藏时修改配置）。
- 验证已有的托盘与主面板单测不发生回归。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若全屏应用存在特殊的系统级安全窗口遮挡；采用 floating/panel 属 macOS 官方支持的标准菜单栏辅助窗口模式。
- 回退：回滚层级状态机与 `trayMenuWin` 平台门控。

### 依赖与约束

- `[deploy]` 依赖 macOS 本地桌面人工验证。

### Finalization 时更新的 blueprint

- 无
