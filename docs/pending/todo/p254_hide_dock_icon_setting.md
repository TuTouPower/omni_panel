# p254 设置新增隐藏 Dock 图标选项

- 来源：用户提出（2026-09-18，p253 同会话附带需求）
- 内容：设置页（通用区，`general_section.tsx` 现有 `launchAtLogin`/`pinToTop`/`mainPanelMode` 并列）新增选项“在 Dock 中显示图标”，允许关闭 Dock 栏图标、只留菜单栏。默认保持现状（显示 Dock）。实现面：配置新增布尔键、macOS `app.dock.hide()/show()` 或 `setActivationPolicy(accessory)` 切换、重启/即时生效语义待定；Windows/Linux 行为待定（任务栏隐藏另议，不在本条默认范围）。t497 明确当前为双态菜单栏/桌面应用且有正常 Dock 图标（t496 规范），不启用 `LSUIElement`。
- 处理：未开
