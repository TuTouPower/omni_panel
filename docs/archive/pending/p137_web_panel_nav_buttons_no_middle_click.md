# p137 web 端面板跳转/外链按钮无法鼠标中键新开标签页

- 现象：web 端（浏览器连 local-api）右上角面板互跳按钮、Usage 标题栏设置/代理面板按钮、设置-关于页外链卡片按钮、Usage 空态「添加服务」按钮均无法鼠标中键/Ctrl+Click 新开标签页。期望：这些导航/外链语义按钮在浏览器里应能中键新开标签页。
- 影响：web 端四个面板（Usage/Agent/Session/Settings）互跳入口的链接语义缺失；设置-关于页外链无中键支持；无服务空态「添加服务」入口无中键支持。含已确认同类位点：PanelTitleBar 面板互跳按钮（Agent/Session/Settings 面板共用）、popup TitleBar 设置与代理面板按钮（Usage 面板）、about_section 外链卡片按钮（7 卡）、EmptyState 添加服务按钮。
- 根因：产品缺陷。web 端将导航/外链语义实现为 `<button onClick>` + JS 改 hash（usageboard-web.ts `location.hash = "setting"/"agent"/"history"/"usage"`）或 `window.open`；浏览器仅对原生 `<a href>` 支持中键/Ctrl+Click 新开标签页，`<button>` 的 onClick 不响应中键。已确认同类位点清单：
    - src/renderer/components/ui/PanelTitleBar.tsx:93-108（互跳按钮，onNavigate → web 桥 hash；SettingsView.tsx:429 / TokenStatsView.tsx:642 / SessionShell.tsx:22 三面板共用）
    - src/renderer/views/popup-view/TitleBar.tsx:78-98（设置/代理面板按钮）
    - src/renderer/views/settings-view/sections/about_section.tsx:107-129（外链卡片 window.open）
    - src/renderer/views/popup-view/EmptyState.tsx:22-25（「添加服务」→ settings.open → hash="setting"；PopupView.tsx:755）
      已扫丢弃：DeviceLoginSection.tsx:185-192 与 MarkdownMessage.tsx:74-81 已是 `<a target="_blank" rel="noopener noreferrer">` 中键可用；窗口控制/刷新/隐藏按钮非导航语义；popup 会话历史按钮 web 端 `!is_web()` 隐藏；TrayMenu 面板菜单项 web 端无托盘入口仅手动 URL 可达（场景外，不并入）；TokenStatsView/SessionLibrary 会话行打开为数据联动（带 source/env/session_id），非导航/外链链接语义；PopupView/provider_card_states 行级重新登录为操作语义；VendorPicker openConnectorsDir web 端 noop；about「检查更新」卡无外链行为；SettingsView goBack 为 window.close() 非导航。
- 测试缺口：PanelTitleBar.test.tsx:19-32 只断言切换按钮为 button role、点击调 onNavigate，未覆盖 web 端应渲染为链接；e2e panel_navigation.spec.ts:17-47 用 getByRole("button") 点击互跳图标（AC2 隐藏规则 36-47 同），改 `<a>` 后需改 link role；popup_view.test.tsx:351-360 代理面板按钮同需适配、设置按钮无导航语义测试；settings_view_general.test.tsx:323-330 只断言 8 卡片数量，无外链 href/target/rel 断言；EmptyState 无测试。补测须覆盖全部已确认位点：web 端互跳/外链/添加服务渲染为 `<a href>`（href 指向对应 hash 路由，外链 `target="_blank" rel="noopener noreferrer"`）、左键点击仍完成 hash 切换/调用、桌面端行为不变。
- 线索：`.scratch/task_bug_panel_nav_buttons.md`、`.scratch/p137/verify_notes.md`
- 处理：t311
