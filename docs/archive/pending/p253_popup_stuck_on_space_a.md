# p253 用量弹窗跨全屏 Space 粘在 A 空间、切到 B 再点不跟随

- 现象：macOS 上两个应用各占独立全屏 Space。在 A 的菜单栏点 OmniPanel 图标显示用量弹窗，切到 B 再点图标，弹窗仍留在 A 空间，B 看不到；多点一次反而隐藏，需来回切换才能找回。
- 影响：多全屏 Space 工作流下用量弹窗（tray 左键 `open_or_toggle`）不可用；同面波及托盘右键菜单 `trayMenuWin`（`isVisible()` 切换且无跨 Space 属性，行为更差）。设置/agent/session/dev 走 `open_or_focus` 无 toggle 反转，不在本条。
- 根因：产品缺陷，两层叠加。直接层：`src/main/core/main-panel/main-panel-controller.ts:284-292` `open_or_toggle()` 用全局 `isVisible()` 做切换条件，无法区分 Space 归属，切 Space 后全局仍 visible，新 Space 点击误走 `hide()`（`.scratch/repro_space_sticky_20260918.ts` 已复现）。底层：darwin `setAlwaysOnTop(pinToTop=false)` 掉回 normal（`:182`），盖不住全屏 Space，与 p250/t503 同源；`setVisibleOnAllWorkspaces(true, {visibleOnFullScreen:true})`（`:178`）被层级抵消。
    已确认同类位点：`src/main/index.ts:1377-1384` tray click 同一 `open_or_toggle` 路径；`src/main/index.ts:1378/1393` `trayMenuWin` 的 `isVisible()` 切换 + 缺 `setVisibleOnAllWorkspaces`/`type:panel`（t503 已覆盖其跨全屏部分）。
- 测试缺口：`tests/unit/main/main_panel_controller.test.ts` 只测同 Space toggle（`:255`/`:265`），无跨 Space 用例；t497 单测只断言调了 `setVisibleOnAllWorkspaces`（`:480`），层级与 `pinToTop` 绑死假绿（p250 已记）。应补：darwin 下全局 visible 但在它 Space 时再次 toggle 应在当前 Space 显示（含 `position_popup` 重锚 + 展示期提权至 `floating`、隐藏恢复 `pinToTop`）；trayMenuWin 平台分支（darwin `showInactive` 且不 `focus` vs 非 darwin 原样）。真机双全屏切换仍 `[deploy]`。
- 线索：`.scratch/repro_space_sticky_20260918.ts`、`.scratch/popup_stuck_on_space_a_20260918.md`
- 处理：直接改 main（本次提交：p253 提权状态机 + p254 Dock 选项，无独立 task）
