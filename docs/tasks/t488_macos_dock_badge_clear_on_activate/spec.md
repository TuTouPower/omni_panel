# Task spec

## 背景

在 macOS 系统下，OmniPanel 运行期间产生的系统通知（如定时刷新或用量预警）会导致 Dock 图标上显示红色角标（Badge），例如角标常驻显示 9。由于主进程未监听应用激活与窗口聚焦事件清理角标，用户即便打开或聚焦主窗口，该角标也始终不会被清理，造成常驻未读的视觉干扰。

## 契约区

### 范围

- 修改 `src/main/index.ts`（或窗口控制器）：
    - 增加 macOS 角标清理封装函数（调用 `app.dock?.setBadge("")` 及 `app.setBadgeCount?.(0)`）。
    - 在主窗口展示（`show_window`）、主窗口聚焦（`window.on("focus")`）以及应用激活事件（`app.on("activate")`）中调用角标清理逻辑。
- 增加对应生命周期重置逻辑的单元测试或门禁测试。

### 非范围

- 不修改 Windows 或 Linux 托盘图标闪烁逻辑。
- 不修改既有通知派发机制。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在 macOS 宿主下，当主窗口被激活展示或获得焦点时，调用系统 API 清除 Dock 角标（`setBadge("")`）。
- [ ] AC-002：在 macOS 宿主下，当应用接收到 Electron `activate` 事件时，调用系统 API 清除 Dock 角标。
- [ ] AC-003：在非 macOS（Windows / Linux）平台上，角标清除逻辑静默跳过，不调用不存在的平台 API。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：`p232`（2026-09-15 核实，排查确认全局未存在 `app.dock.setBadge` 清理调用）

### 有意不测

无

### 测试策略

- 针对角标清理助手函数进行单元测试，通过 mock `process.platform` 与 `app.dock` 验证在不同平台与窗口事件下的调用行为。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：在非 macOS 平台直接访问 `app.dock` 会导致运行时抛错（`undefined`）。
- 回退：严格增加 `process.platform === "darwin"` 与 `app.dock != null` 保护。

### 依赖与约束

- 依赖 Electron 的 `app.dock` API。

### Finalization 时更新的 blueprint

- 无
