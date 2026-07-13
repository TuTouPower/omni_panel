<!-- omni_powers: blueprint/specs/window-management -->

# 窗口管理

`src/main/window/window-manager.ts`（commit `e50dc26` 从 index.ts 提取）。IPC 见 `ipc.md`；UI 视图见 `ui-views.md`。

## 三类窗口（`WINDOW_CONFIGS`）

| key         | route      | 尺寸                      | 特征                                                                   |
| ----------- | ---------- | ------------------------- | ---------------------------------------------------------------------- |
| `popup`     | `popup`    | 482×480, min 472, max 780 | frameless, resizable, 托盘弹窗主面板（默认隐藏，托盘点击显示）         |
| `settings`  | `settings` | 820×660                   | frameless, `titleBarStyle:hidden`, `showWhenReady`, 圆角，独立持久窗口 |
| `tray_menu` | `tray`     | —                         | 自定义托盘菜单渲染窗口                                                 |

URL：`file://...renderer/index.html#<route>?ou_theme=<dark|light>&v=<version>`。

## 主面板模式（`mainPanelMode`）

- `popup` — 托盘弹窗（默认），点击托盘图标弹出，失焦隐藏。
- `floating` — 常驻浮窗。
- `main_panel:get_mode()` 返回当前模式；`mainPanel:hide` 隐藏。

## 动态高度（popup）

- 渲染经 `popup:reportContentHeight({ content_height, collapsed_min_height })` 上报测得内容高度。
- 主进程据此 `setBounds` 锁 BrowserWindow 高度，跟随折叠/展开撑高/缩矮。
- 约束：不超过 75% 工作区高度，无不必要底部留白。
- `floatingHeightMode` 配置控制浮窗高度策略。

## 主题

- `nativeTheme` 决定 dark/light，窗口创建时记 `themeSource` / `shouldUseDarkColors`。
- 渲染 `theme:set` 切 `light|dark|system`，`event:themeChange` 推送。
- body/#root inline 主题色消除首帧白闪（commit `99f1120`/`45c24dc`）。

## 设置窗持久性

设置窗 Windows 上需 persistent，防 open-flash（commit `1988216`）。`settings:open` 带 `SettingsOpenContext` 可定位到具体账号/数据源编辑页。

## 安全 prefs（所有窗口）

`SECURE_WEB_PREFS`：contextIsolation / no nodeIntegration / sandbox / webSecurity / no insecure content。详见 `ipc.md` 安全段。

## close-action

`src/main/core/settings-close-action.ts`（commit `17639de`）—— 纯函数决定设置窗关闭行为，可测。返回 `"hide" | "proceed"` 两种决策：运行中关闭=隐藏以便复用（防 open-flash）；退出流程中关闭=继续退出。
