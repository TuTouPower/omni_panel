---
tid: "t252"
slug: "unified_panel_window_controls"
title: "四面板统一标题栏：品牌区、自绘控制区与去原生菜单栏"
status: "active"
branch: "t252_unified_panel_window_controls"
worktree: "../omni_usage_t252"
review_level: "full"
diff_anchor: "79ad78c63e629882fa62571617da932d13649e2c"
depends_on: ""
conflicts_with: "t259"
schedule_status: "pending_clarification"
note: "merged from t253"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

### Step 1（SPIKE s023）

- `{doctor_cmd}` 无独立命令。
- SPIKE：去原生菜单后编辑快捷键可用性——全仓无 Menu.setApplicationMenu/before-input-event；settings（frame:false）长期可用证明 Chromium 内置处理编辑快捷键。无需补救。报告 `docs/spikes/s023_frameless_edit_shortcuts/report.md`。
- preflight `--require-verified` PASS。

### Step 2/3（实现）

- `window-manager.ts`：agent/history 改 `frame:false` + `titleBarStyle:hidden`（AC4 无边框）；加 `PANEL_TITLES` 映射 + `win.setTitle`（AC9 系统标题）。Round 1 修复：`page-title-updated` preventDefault + 重设 setTitle，防止 index.html `<title>` 覆盖系统标题。
- IPC 泛化：新增 `WINDOW_MINIMIZE/MAXIMIZE/CLOSE` 通道，handler 按 `event.sender` 经 `BrowserWindow.fromWebContents` 路由（AC1 复用）；preload 加 `window_methods`（window.usageboard.window）暴露四面板；web 端 no-op。Round 1 修复：删 settings 专用 `SETTINGS_MINIMIZE/MAXIMIZE/CLOSE` 与 preload `settings.minimize/maximize/close`（spec 要求泛化，旧组件 `components/TitleBar.tsx` 一并删除）。
- 新增 `PanelTitleBar` 组件（品牌 `Omni Panel - <面板名>` + 刷新/面板切换/min/max/close + 拖拽区），`onClose` 可覆盖（用量隐藏到托盘）；Icon 加 dashboard/minus/maximize。Round 1 修复：三面板接入 `onNavigate`（`use_panel_navigation`：桌面 window.open / web hash）+ `onRefresh`（Agent `loadData`、Settings `use_config.reload`、Session `useWorkspaceColumns.refresh_all`），移除 TokenStatsView header 与 SessionShell shell-actions 的内容区重复跳转按钮；`--bg-panel` 改全局 `--win-bg`（f006）。
- 接入：settings 顶部 PanelTitleBar（删旧 TitleBar 与 sh-title，保留 back）；agent 顶部 PanelTitleBar；session 顶部 PanelTitleBar（删 shell-brand 与 shell-actions）；popup 保留自绘 TitleBar，品牌改 `Omni Panel - Usage` + 加窗口控制。Round 1 修复：popup 非浮动 close 改 `onHidePanel`（隐藏到托盘，不销毁窗口）。
- AC6：`theme.ts` 加 `useGlobalTheme`（读 config.theme + onThemeChange 返回 "dark"|"light"）；TokenStatsView 改用之，删独立 usage-theme 存储/readSavedTheme/saveTheme/THEME_OPTIONS/Segmented 主题切换。Round 1 修复：TokenStatsView 补 `useTheme()` 同步 `data-theme`（f004）。
- 测试适配：popup/settings test utils 加 window mock（删 settings.minimize/maximize/close）；token_stats_view 加 onThemeChange + aliases once 断言基准化；window_manager mock 加 setTitle + AC9 断言；smoke 品牌文案改 `Omni Panel - Usage`；SessionShell 顶栏跳转测试改测 PanelTitleBar 切换图标；token_stats_view 会话历史按钮测试改测 Session 面板图标。
- 完整套件：245 files / 2631 passed / 1 skipped 全绿。

### Step 4（黑盒）

- electron e2e：Round 1 修复后完整套件 41 passed / 4 skipped 全绿（AC10 满足），含新增 `panel_window_controls.spec.ts` 5 项（AC3 min/max + 用量隐藏、AC4 menuBarVisible false、AC5 拖拽区 DOM、AC7 copy/paste、AC9 系统标题）。此前完整套件 3 failed（secrets_persistence / tray_menu_actions / panel_window_bounds）均为环境 flaky——单跑与重跑全过，非 t252 回归。
- 打包 smoke：`pnpm package` 产 `artifacts/win-unpacked/OmniPanel.exe`，`pnpm test:packaged` 4 passed。修了 smoke.spec.ts 两处品牌断言 `toContainText("OmniPanel")` → `"Omni Panel"`（t252 品牌文案带空格，原断言误用连续子串）。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-08 09:35 UTC+8)

双路 review（code + test）均 FAIL，全部 finding 已处置。修复后单测 2631 passed / electron e2e 41 passed / 打包 smoke 4 passed / typecheck + lint 全绿。

| finding_id     | severity  | status | rationale                                                                                                                                                                                                         | fix_ref                       |
| -------------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| t252_code_f001 | important | 已修   | 三面板 PanelTitleBar 接 onNavigate（`use_panel_navigation`：桌面 window.open / web hash）+ onRefresh（Agent loadData、Settings reload、Session refresh_all）；移除 TokenStatsView/SessionShell 内容区重复跳转按钮 | lib/panel-navigation.ts       |
| t252_code_f002 | important | 已修   | 删 SettingsView 旧 TitleBar 3 处 + `.settings-titlebar`/`.sh-title` CSS；删 `SETTINGS_MINIMIZE/MAXIMIZE/CLOSE` IPC + preload/web/类型；删 `components/TitleBar.tsx`                                               | ipc.ts / SettingsView.tsx     |
| t252_code_f003 | important | 已修   | popup 非浮动 close 改 `onHidePanel`（隐藏到托盘，t194 语义保留不销毁）                                                                                                                                            | popup-view/TitleBar.tsx       |
| t252_code_f004 | important | 已修   | TokenStatsView 补 `useTheme()` 同步 `data-theme`（AC6 实时跟随）                                                                                                                                                  | TokenStatsView.tsx            |
| t252_code_f005 | important | 已修   | `page-title-updated` preventDefault + 重设 setTitle（AC9 系统标题）                                                                                                                                               | window-manager.ts             |
| t252_code_f006 | minor     | 已修   | `.panel-titlebar` background 改全局 `--win-bg`（agent/settings 窗口原本无 --bg-panel）                                                                                                                            | globals.css                   |
| t252_test_f001 | important | 已修   | 新增 PanelTitleBar 组件测试（品牌/图标隐藏/onNavigate/onRefresh/is_web）                                                                                                                                          | PanelTitleBar.test.tsx        |
| t252_test_f002 | important | 已修   | 通用窗口控制行为由新 e2e 覆盖（agent min/max、popup 隐藏）                                                                                                                                                        | panel_window_controls.spec.ts |
| t252_test_f003 | important | 已修   | e2e 断言 menuBarVisible false + 标题栏拖拽区 DOM；双击最大化 OS 行为见 spec 可测试性声明豁免                                                                                                                      | panel_window_controls.spec.ts |
| t252_test_f004 | important | 已修   | 新增 theme.test（useGlobalTheme/useTheme data-theme 跟随 + system 解析）+ TokenStatsView web 分支断言                                                                                                             | theme.test.ts                 |
| t252_test_f005 | important | 已修   | AC7 copy/paste 编辑快捷键 e2e（agent 窗口）                                                                                                                                                                       | panel_window_controls.spec.ts |
| t252_test_f006 | minor     | 已修   | window_manager 断言 `setTitle` 收到面板标题                                                                                                                                                                       | window_manager.test.ts        |
| t252_test_f007 | minor     | 已修   | aliases 断言基准化保留：useGlobalTheme 增一次 config.get 归因合理，核心「filters 不 reread config」语义仍断言                                                                                                     | token_stats_view.test.tsx     |

### Round 2 (2026-08-08 09:55 UTC+8)

双路 review 复核 Round 1 修复，verdict 均 PASS。剩 minor 全部处置。

| finding_id     | severity | status | rationale                                                                                                                      | fix_ref                       |
| -------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| t252_code_f007 | minor    | 遗留   | web 端 `sessionHistory.open` 不设 location.hash，web 模式 Session 切换不切页（桌面正确）。web 次表面，专职网页端同步 task 处理 | t259                          |
| t252_test_f008 | minor    | 已修   | 新增 agent 窗口「关闭」→ 窗口销毁 e2e（window.close 经通用 WINDOW_CLOSE 路由）                                                 | panel_window_controls.spec.ts |
| t252_test_f009 | minor    | 已修   | 用量隐藏 e2e 定位改 `#usage`（原 `index.html` 片段可能误匹配多窗口）                                                           | panel_window_controls.spec.ts |
| t252_test_f010 | minor    | 已修   | spec 可测试性声明修订：双击最大化与拖拽同为 OS 原生机制，Playwright 无法模拟，以拖拽区 DOM 断言替代                            | spec.md                       |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：单测 2631 passed；electron e2e 完整套件 41 passed + panel_window_controls 6 项（AC3 min/max/close 销毁 + 用量隐藏、AC4 menuBarVisible false、AC5 拖拽区 DOM、AC7 copy/paste、AC9 getTitle）；打包 smoke 4 passed；typecheck + lint 全绿。AC1/AC2/AC3/AC4/AC5(拖拽区)/AC6/AC7/AC8/AC9/AC10 均有测试或 DOM 断言支撑；AC5 双击最大化由 spec 可测试性声明豁免（OS 原生机制）。

### Reviewer verdict

`full`：

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- 四面板统一标题栏落地：通用窗口控制 IPC 按 sender 路由、PanelTitleBar 统一接入（onNavigate/onRefresh）、去 settings 专用窗口控制、AC9 系统标题 + AC6 主题跟随修复；双路 review 两轮后 PASS，全测试套件绿。
