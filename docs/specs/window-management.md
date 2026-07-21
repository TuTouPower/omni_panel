# 窗口管理

`src/main/window/window-manager.ts`（commit `e50dc26` 从 index.ts 提取）。IPC 见 `ipc.md`；UI 视图见 `ui-views.md`。

## 四类窗口（`WINDOW_CONFIGS`）

| key         | route     | 尺寸                       | 特征                                                                   |
| ----------- | --------- | -------------------------- | ---------------------------------------------------------------------- |
| `usage`     | `usage`   | 482×480, min 472, max 1400 | frameless, resizable, 托盘弹窗用量面板（默认隐藏，托盘点击显示）       |
| `setting`   | `setting` | 820×660                    | frameless, `titleBarStyle:hidden`, `showWhenReady`, 圆角，独立持久窗口 |
| `tray_menu` | `tray`    | —                          | 自定义托盘菜单渲染窗口                                                 |
| `agent`     | `agent`   | 900×700                    | `frame:true`, `showWhenReady`, 圆角，独立窗承载 TokenStatsView         |

URL：`file://...renderer/index.html?ou_theme=<dark|light>#<route>`（query 在前 hash 在后）。

> TrayMenu 渲染层保留对 hash 中 `v=<version>` 的解析（历史兼容），当前 main 未注入 `v=`。

## 用量面板模式（`mainPanelMode`）

- `popup` — 托盘弹窗（默认），点击托盘图标弹出，失焦隐藏。
- `floating` — 常驻浮窗。
- `system` — schema 已收纳（`types.ts` `mainPanelModeSchema` = `z.enum(["system","popup","floating"])`），但语义未落地。
- `main_panel:get_mode()` 返回当前模式；`mainPanel:hide` 隐藏。

> 已知分裂：schema 放行三值（含 `system`），但 preload `main_panel.get_mode()` 类型签名仍声明 `Promise<"popup" | "floating">`（`src/preload/index.ts`）。消费者按二值处理，`system` 值经 IPC 回流时类型层面不被承认。

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
