# Task review t493（reviewer_focus: 通用）

- task：`t493_macos_window_chrome_native_traffic_lights`
- round：1

reviewed_scope: 91b89db456fc8c18

## Findings

Round 1 零 finding。

## 结论

- AC-001 原生交通灯与占位：macOS 下设置/会话/开发等窗口启用系统 frame: true + titleBarStyle: 'hidden'，渲染端预留 78px 交通灯占位区，拖拽双击行为正常。PASS。
- AC-002 纯面板标题：PanelTitleBar 移除 logo 与 Omni Panel 前缀，只展示纯面板名称。PASS。
- AC-003 自绘窗口控制隐藏：macOS 常规窗口隐藏自绘最小化/全屏/关闭按钮，仅保留原生交通灯；floating popup 维持隐藏到托盘。PASS。
- AC-004 应用菜单与快捷键：macOS 菜单包含 ⌘W、⌘M、⌃⌘F、⌘H、⌘Q，⌘W 正确区分 Usage 隐藏与普通窗口关闭。PASS。
- AC-005 原生窗口标题保留：系统 BrowserWindow 标题仍为 `Omni Panel - <panel>`。PASS。
- AC-006 Windows/Linux 无回归：Windows/Linux 依然使用自绘无边框三连控制，不受影响。PASS。
- AC-007 视觉对齐：标题字号与间距符合 macOS 人机界面规范。PASS。

coverage = 7 / 7

verdict: PASS
