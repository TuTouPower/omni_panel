# p147 网页版标题栏当前面板自身按钮缺失（agent/usage 两面板）

- 现象：用户要求右上角按钮恒定（刷新、设置、用量、代理、会话），当前面板不隐藏，仅设置面板去刷新。t330 只让 Session/Settings 达标；**网页版 Agent 面板缺「Agent」自身按钮、Usage 面板缺「用量」自身按钮**。复现（playwright 实测各面板按钮）：
    - usage：刷新全部 / 设置 / 代理面板 / 会话历史 → 缺「用量」
    - agent：刷新 / Settings面板 / Usage面板 / Session面板 → 缺「Agent」
    - session：刷新 + Settings/Usage/Agent/Session 完整 ✓
    - setting：Settings/Usage/Agent/Session 四面板无刷新 ✓
- 影响：Agent/Usage 面板无法从标题栏切回自身（只能靠其他面板切换按钮进入）；「当前面板不隐藏」意图在网页版两面板未达成。已确认同类位点：`src/renderer/views/TokenStatsView.tsx`（header_actions 手写互跳 Settings/Usage/Session，缺 Agent）、`src/renderer/views/popup-view/TitleBar.tsx`（刷新/设置/代理/会话，缺用量）。
- 根因：产品缺陷（t330 范围不完整）。t330「取消隐藏当前面板」只改了 `PanelTitleBar` 面板形态（Session/Settings 走该形态，四面板恒定）；Agent 用 PanelTitleBar **通用形态** + header_actions 手写互跳（漏自身），Usage 用**独立 TitleBar 组件**（无面板切换）。t330 非范围明确「不改 popup TitleBar / TokenStatsView 的互跳按钮」，两处从未纳入修复。
- 测试缺口：t330 测试只覆盖 PanelTitleBar（PanelTitleBar.test.tsx + panel_navigation e2e 断言 Session/Settings 面板按钮）；TokenStatsView/TitleBar 的标题栏按钮无测试断言「当前面板按钮存在」，因此 Agent/Usage 缺自身未被捕获。补测：对 TokenStatsView 与 popup TitleBar 断言标题栏含全部四面板按钮（含当前面板），Settings 面板无刷新。
- 线索：`.scratch/` 无（playwright 实测 4 面板按钮清单见「现象」，已清理临时 spec）
- 处理：t336
