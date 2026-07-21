> 验证方式：Desktop（Electron BrowserWindow + Tray）。拆自 ui-views（t037）。

# ui-views-desktop

`src/renderer/views/`。IPC 见 `ipc.md`；窗口承载见 `window-management.md`；术语见 `domain.md`。

## 视图

### TrayMenu（托盘菜单，route=tray）

自定义 frameless 托盘菜单（非系统原生菜单）。`TrayMenuItem`：icon / label_zh / label_en / danger / checked / meta? / action。

- `is_paused` — 暂停状态（`tray:pauseState`）
- autostart 状态（`tray:autostartState`）
- `tray:reportMenuSize` 上报菜单尺寸驱动窗口大小
- 版本号从 URL hash `?v=` 解析

## 共性

- 全部 `useTheme()` 适配 dark/light
- 经 `window.usageboard`（preload `UsageboardApi`）调主进程，不直接 Node
- 日志经 `log:renderer` 转发主进程统一 scrubber 脱敏
- **图标系统**（t014，`components/Icon.tsx`）：`Icon`（内置 `UI_ICONS` path 表，按 `name` 取）+ `VendorMark`（厂商标识，按 `VendorId` 优先查 `VENDOR_THEME_LOGOS` 主题切换 → `VENDOR_LOGOS` 单态 → `VENDOR_MARKS` 内联 SVG，兜底 `overview`）+ `VendorId`（`UsageProvider | "overview" | "cpa"`）。被 SettingsView/TrayMenu/ProviderAccountRow/ProviderNav 等共用。

## 国际化

`language: zh-Hans | en`。label 双语字段 `label` / `label@zh-Hans`。
