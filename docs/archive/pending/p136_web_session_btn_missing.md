# p136 web 面板右上角无会话历史按钮

- 现象：期望用量面板（popup `#usage` 路由）右上角有「会话历史」按钮；web 模式（data-web=1）右上角只有刷新/设置/代理面板，无会话按钮（桌面模式按钮正常）。
- 影响：web 用量面板无法从右上角进入会话历史；会话能力本身 web 可达（`#history` 直达、Agent 面板 Session 切换/会话行点击均可用）。WSL 无头场景 web 面板是唯一 UI，入口缺失影响直接。
- 根因：产品缺陷（设计意图残留）。`src/renderer/views/popup-view/TitleBar.tsx:99` 会话按钮包在 `!is_web() &&` 内（t212 引入）。隐藏语义本用于 Electron-only 窗口控制（is-web.ts），会话历史不属其列；t228/t259/t263 已补全 web `sessionHistory` bridge（usageboard-web.ts:607-768：open 分发 onFocus + 切 hash 路由；服务端 /v1/sessionHistory 端点组 server.ts:613-632），桥可用但按钮未随桥放开。已扫全仓 `is_web` 6 处 + 会话入口 3 处 + `sessionHistory.open` 10 处，无其它会话入口被 web 隐藏；TitleBar.tsx:124 与 PanelTitleBar.tsx:110 的 `!is_web()` 包的是窗口控制（语义正确）、SettingsView/WebLoginSection 的 web 分支与会话无关、TrayMenu 会话入口未被隐藏（均非同因）。
- 测试缺口：`tests/unit/renderer/views/popup_view.test.tsx:362-373`「hides the session history button in web mode」把隐藏行为固化为期望（t212 遗留），未挡住缺陷；web e2e 无 popup 右上角会话按钮用例（panel_navigation.spec.ts 注释明确不测该入口、session_panel.spec.ts 用 evaluate 绕过按钮）。补测：单测反写该断言为 web 模式按钮可见 + 点击调 `sessionHistory.open("", "", "")`；web e2e 补 `#usage` 页按钮可见 + 点击 → `#history` 挂载会话面板；桌面模式断言保留。窗口控件隐藏断言（token_stats_view.test.tsx:814-824 等）语义正确，不触碰。
- 线索：.scratch/p136/evidence.md；.scratch/bug_t304_evidence.md
- 处理：t307
