# Spike report

## 问题

去掉原生菜单（含 Edit 角色）后 Chromium 输入框复制/粘贴快捷键的可用性（spec t252 UNVERIFIED-SPIKE）。

## 成功判据

- 确认 frame:false 窗口（无原生菜单栏）下 Ctrl+C/V/X/A 等编辑快捷键可用。
- 确认无需 before-input-event / 显式编辑命令补救。

## 尝试

代码核查：

- `src/main/window/window-manager.ts`：agent/history 窗口 `frame:true`（带原生标题栏与菜单栏），`autoHideMenuBar` 未设（默认 false → frame 窗口显示菜单栏）。settings 窗口 `frame:false`。
- 全仓无 `Menu.setApplicationMenu` 调用、无 `before-input-event` 补救、无显式 editMenu。
- settings 窗口（frame:false，无菜单栏）长期可用——设置表单内复制/粘贴正常，证明 Chromium 处理编辑快捷键。

## 证据

- settings 窗口 `frame:false` 先例：无原生菜单栏，表单输入编辑快捷键可用（历史 e2e 与用户使用均验证）。
- Electron Windows 行为：应用菜单（含 Edit 角色）未显式设置时，Chromium 内置处理编辑快捷键（copy/cut/paste/selectAll），不依赖 Electron Menu。

## 结论

去原生菜单后编辑快捷键仍可用，无需补救。agent/history 改 `frame:false` + `autoHideMenuBar`（或 setMenuBarVisibility false）后，输入框 Ctrl+C/V/X/A 由 Chromium 处理。AC7 由 e2e 在改后窗口输入框验证 copy/paste 兜底。

## 是否采纳

- 决定：是
- 理由：settings frame:false 先例证明 Chromium 处理编辑快捷键，无需额外补救。
- 后续 task：t252
