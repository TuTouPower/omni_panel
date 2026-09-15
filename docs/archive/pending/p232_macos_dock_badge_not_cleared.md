# p232 macOS 环境下 Dock 图标常驻历史通知角标数未清理

- 现象：在 macOS 上，软件 Dock 图标显示红色未读通知角标（如用户观察到的 9 个通知角标），且在打开、激活或聚焦 OmniPanel 后角标依然存在不消失。
- 影响：用户无法感知当前是否存在新的未读告警，造成误导与视觉干扰。
- 根因：
    1. macOS 会对发出系统通知（UNNotification / 本地通知）的应用在 Dock 磁贴上保留未读通知数计数。
    2. `src/main/index.ts` 中完全缺少在应用被激活（`app.on("activate")`）、主窗口展示（`window.show()`）或聚焦（`window.on("focus")`）时清除 Dock 角标的生命周期逻辑（缺少 `app.dock.setBadge("")` 或 `app.setBadgeCount(0)` 调用）。
- 测试缺口：主进程窗口与 App 生命周期测试未验证在窗口展现时重置平台角标。
- 线索：macOS Accessibility 验证 `AXStatusLabel` 结果为 `Optional(9)`，确认 Dock 磁贴角标确实被系统置为 9。
- 处理：t488
