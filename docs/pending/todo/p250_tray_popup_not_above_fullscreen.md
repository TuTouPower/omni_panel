# p250 菜单栏弹窗只在桌面显示、不能盖在全屏应用上

- 现象：macOS 上某个应用处于全屏时，点菜单栏 OmniPanel 图标弹出的框只出现在桌面空间，不会叠在当前全屏应用之上。全屏时菜单栏默认隐藏，需先露出再点，观感像双击。
- 影响：用量弹窗（tray 左键）和托盘菜单（tray 右键）在全屏工作流里不可用，会被切回桌面。其它面板（设置/agent/session/dev）不在本条。
- 根因：产品缺陷。全屏应用在独立 space、窗口层级高于普通窗。t497 给用量弹窗加了 `type: "panel"`、`visibleOnFullScreen`、`showInactive`，但置顶绑在 `pinToTop`（默认 false）上，创建时 `setAlwaysOnTop(false, "floating")` 把层级打回 normal，盖不住全屏。托盘菜单 `trayMenuWin` 未做 t497：普通 `BrowserWindow`，`show()` + `focus()` 会激活应用并切空间。
    已确认同类位点：`src/main/core/main-panel/main-panel-controller.ts` 的 darwin `setAlwaysOnTop(last_pin_to_top, "floating")` 与 `apply_config_change` 同路径；`src/main/index.ts` 的 `trayMenuWin` 构造与 right-click `show()`/`focus()`。
- 测试缺口：t497 单测只断言调用了 `setVisibleOnAllWorkspaces` 和 `pinToTop` 为 false 时 `setAlwaysOnTop(false)`，把「不要钉在普通窗口上」和「不要浮在全屏上」绑死，假绿。无托盘菜单的 panel / `showInactive` / `visibleOnFullScreen` 断言。应拆：弹出期间用量窗与 tray menu 在 darwin 使用足以盖全屏的层级（如 `floating`/`status`/`pop-up-menu`），与 `pinToTop` 解耦；tray menu 断言 `type: "panel"`、`visibleOnFullScreen`、`showInactive` 且不 `focus`。真机全屏仍 `[deploy]`。
- 线索：`.scratch/tray_popup_fullscreen_20260918.md`
- 处理：未开
