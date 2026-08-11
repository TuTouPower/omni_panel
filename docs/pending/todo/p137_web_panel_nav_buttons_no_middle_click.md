# p137 web 端面板跳转/外链按钮无法鼠标中键新开标签页

- 现象：web 端（浏览器连 local-api）右上角面板互跳按钮、Usage 标题栏设置/代理面板按钮、设置-关于页外链卡片按钮均无法鼠标中键/Ctrl+Click 新开标签页。期望：这些导航/外链语义按钮在浏览器里应能中键新开标签页。
- 影响：web 端四个面板（Usage/Agent/Session/Settings）互跳入口的链接语义缺失；设置-关于页外链无中键支持。含已确认同类位点：PanelTitleBar 面板互跳按钮（Agent/Session/Settings 面板共用）、popup TitleBar 设置与代理面板按钮（Usage 面板）、about_section 外链卡片按钮。
- 根因：产品缺陷。web 端将导航/外链语义实现为 `<button onClick>` + JS 改 hash（usageboard-web.ts `location.hash = "setting"/"agent"/"history"`）或 `window.open`；浏览器仅对原生 `<a href>` 支持中键/Ctrl+Click 新开标签页，`<button>` 的 onClick 不响应中键。已确认同类位点清单：src/renderer/components/ui/PanelTitleBar.tsx:100-102、src/renderer/views/popup-view/TitleBar.tsx:78-98、src/renderer/views/settings-view/sections/about_section.tsx:114-129。已扫丢弃：DeviceLoginSection.tsx:188 与 MarkdownMessage.tsx:77 已是 `<a target="_blank">` 中键可用；窗口控制/刷新/隐藏按钮非导航语义；popup 会话历史按钮 web 端隐藏。
- 测试缺口：PanelTitleBar.test.tsx:19-32 只断言切换按钮为 button role、点击调 onNavigate，未覆盖 web 端应渲染为链接；e2e panel_navigation.spec.ts:17-47 用 getByRole("button") 点击互跳图标，改 `<a>` 后需改 link role；popup TitleBar 与 about_section 无导航语义测试。补测须覆盖三个已确认位点：web 端互跳/外链渲染为 `<a href>`（href 指向对应 hash 路由）、左键点击仍完成 hash 切换、桌面端行为不变。
- 线索：`.scratch/task_bug_panel_nav_buttons.md`
- 处理：未开
