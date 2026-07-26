> 验证方式：Desktop（Electron BrowserWindow + Tray）。拆自 ui-views（t037）。

# ui-views-desktop

`src/renderer/views/`。IPC 见 `ipc.md`；窗口承载见 `window-management.md`；术语见 `domain.md`。

## 视图

### PopupView / 主面板（route=usage）

用量面板。UI 态（provider 顺序、账号顺序、折叠/展开）持久化到 config，经 `CONFIG_CHANGED` 广播在多窗间同步。同步不变量（t153，修复保存回环闪烁）：

- `apply_config` 是广播唯一入口：对每个持久化字段「先同步已同步 ref、值相等则保留 state 引用」，广播回显绝不触发 persist effect 反向保存。
- 插件列表只在 `plugins_structure_signature`（`config.plugins` 整体序列化）变化时 `reload()`；`use_plugins.reload` 对值相等的新列表保留原数组引用，冗余 reload 零重渲染。
- 结构剪枝（provider/账号消失时清理折叠态）产生的保存是合法的一次性收敛，不构成回环。
- `use_config` 回显按值深比较跳过（IPC 反序列化后引用比较恒 false）。
- 主面板 `apply_config_change` 仅在 `pinToTop` 实际变化时 `setAlwaysOnTop`（Windows 上重复调用可见闪烁）。

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
