# p131 面板切换按钮 icon 被 t274 收口替换 + 设置面板 back 按钮移除

- 现象：设置面板右上角「用量面板」按钮 icon 显示 lucide 仪表盘（LayoutDashboard），非用户预期的时钟快进；会话面板切换按钮 icon 显示 lucide 圆角气泡（MessageSquare），非 t274 前的手绘聊天气泡（用户记忆「之前设置的会话 icon」）。设置面板左上角返回（小于号）按钮用户要求移除。
- 影响：四面板标题栏（PanelTitleBar 共用于 Settings/Agent/Session/Usage 窗口）+ 用量面板主界面（popup-view/TitleBar）+ 托盘菜单会话入口的切换按钮 icon 视觉。已确认同类位点：`PanelTitleBar.tsx:104-107`（Usage=dashboard/Agent=chart/Session=chat_square/Settings=gear）、`popup-view/TitleBar.tsx:85-108`（设置/代理/会话按钮）、`TrayMenu.tsx:75`（会话入口 chat_square）、`TokenStatsView` 经 PanelTitleBar 继承。
- 根因：t274（commit afd34807「clean legacy css」）把 `Icon.tsx` 从手绘 SVG 集收口到 lucide-react——`chat_square` 由手绘聊天气泡（带尾巴）换为 lucide MessageSquare，`dashboard` 由手绘换为 LayoutDashboard；无提示视觉替换。属产品缺陷（重构致视觉回归）。back 按钮删除为产品变更。
- 测试缺口：`icon.test.tsx` 只断言 name→lucide 组件映射（t274 后仍绿），无面板按钮 icon 的视觉/语义断言；无 PanelTitleBar 面板切换按钮 icon 断言。应补：PanelTitleBar 各面板按钮 icon name 断言（Usage→clock_forward、Session→chat_square）；SettingsView 无 back 按钮断言。
- 线索：无 `.scratch/`（静态代码核对，未跑复现脚本）
- 处理：未开
