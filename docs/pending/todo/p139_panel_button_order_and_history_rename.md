# p139 面板切换按钮顺序统一 + 会话面板按钮靠右上角 + #history→#session 路由/CSS 改名

- 现象：会话历史面板标题栏按钮顺序为「刷新 用量 代理 设置」（当前 PanelTitleBar 按 `["Usage","Agent","Session","Settings"]` 过滤渲染），用户期望所有面板统一「刷新 设置 用量 代理 会话」固定序且当前面板隐藏；会话面板按钮未贴窗口右上角（被 tab 导航布局影响）；会话面板 URL hash 为 `#history`（旧「会话历史」时代命名），应为 `#session`；`history-*` 前缀 CSS 类名同源残留。
- 影响：四面板标题栏（PanelTitleBar 共用于 Settings/Agent/Session，popup 独立 TitleBar 另实现）+ 会话面板布局 + 会话路由标识 + history-\* CSS 类名。已确认同类位点：
    - 按钮顺序：`PanelTitleBar.tsx:47,90-109`（panels 数组顺序、过滤渲染）、`popup-view/TitleBar.tsx`（独立实现，顺序 设置/代理/会话，与 PanelTitleBar 不一致）
    - 按钮位置：`SessionShell.tsx:21-28`（header 布局，tab 导航 ml-auto 挤占）
    - 路由：`use-route.ts:6`（VALID_ROUTES）、`App.tsx:29`（case "history"）、`window-manager.ts:75-76`（WINDOW_CONFIGS.history）、`preload/route_api.ts:63`（route==="history" 选 full_api）、`preload/index.ts:613`、`web/usageboard-web.ts:623`、`main/index.ts:443`
    - CSS 类名：`history-shell`/`history-topbar`/`history-tab`/`history-cell`/`history-*`（SessionShell、session-panel e2e 等）
- 根因：t210-t212「会话历史」时代窗口/路由命名为 `history`，t252 起 UI 语义改「会话面板」（PanelName=Session）但路由/CSS 未同步改名；面板按钮顺序各面板实现不统一。属产品缺陷（命名残留 + 一致性缺失）。
- 测试缺口：`window_manager.test.ts:152`、`panel_navigation.spec.ts`、`session_panel.spec.ts`、`usageboard-web.test.ts:578-581`、`route_api.test.ts:147` 等断言 `#history`/`history` 路由，改名后须同步更新；无面板按钮顺序/位置断言。
- 线索：无 `.scratch/`（静态代码核对）
- 处理：未开
