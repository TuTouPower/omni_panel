# Task review t313（reviewer_focus: 通用）

- task：`t313_panel_buttons_and_session_route_rename`
- spec：`docs/tasks/t313_panel_buttons_and_session_route_rename/spec.md`
- diff_anchor：`5732998b98dd6af8a95de86dfaa4994efe25a27f`
- target：`git diff 5732998b98dd6af8a95de86dfaa4994efe25a27f`
- round：1
- reviewed_at：2026-08-11 23:50 UTC+8

## Findings

### t313_gen_f001 - 全量 pnpm test 存在 1 个既有失败（designmd drift 门禁），AC-005「全量测试通过」在基线上已不成立

- 严重度：minor
- 锚点：AC-005（「全量 `pnpm test` + `pnpm lint` 通过」）
- 位置：`tests/unit/main/scripts/designmd.test.ts:129`；`DESIGN.md:402`（本 task 改动行）；`src/renderer/styles/globals.css:10-144`（导出区）
- 问题：全量 `npx vitest run` 结果 `2919 passed / 9 skipped / 1 failed`，唯一失败为「真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）」（`check_drift()` 返回 false）。复验：用 `git show HEAD:DESIGN.md` + `git show HEAD:src/renderer/styles/globals.css` 调 `check_drift` 同样返回 false——drift 在 diff_anchor（5732998，t313 实施前）即已存在；t313 对 DESIGN.md 仅改正文 402 行窗口目录表（front matter 无差异），globals.css 未动。非本 task 引入的回归，AC-005 的「全量测试通过」字面要求无法由本 task 独立达成。
- 建议：登记 follow-up（核对 DESIGN.md front matter 与 globals.css 导出区差异并跑 `designmd export` 同步）；task.md 处置表记录该基线失败与处置，不要求 t313 改代码。

### t313_gen_f002 - task.md「history 零残留」自述与事实不符（内部模块名残留，spec 非范围豁免）

- 严重度：minor
- 锚点：AC-005 边界（「src 与 tests/e2e 中作为会话面板标识/类名的位点」）+ implementer 自述（task.md:31「`grep '"history"|#history|history-' src/ tests/e2e/` 零残留」）
- 位置：`src/main/core/main-panel/history-window-controller.ts:14`（`createLogger("history-window")`）、`src/main/index.ts:71`（`create_history_window_controller` import）、`tests/unit/main/core/main-panel/history-window-controller.test.ts`
- 问题：`grep '"history"|#history|history-' src/ tests/e2e/` 实际命中 `history-window-controller`（src/main）与 `history-window` 日志名，task.md 的「零残留」claim 不成立。但 spec 非范围已声明「session-history IPC 模块、session-locator 等内部命名不动」，AC-005 措辞限定「会话面板标识/类名的位点」——`history-window-controller` 是内部模块命名（非 CSS 类名/路由标识），不违反 AC-005。`history-*` CSS 类名与 `#history`/`"history"` 路由字面量已零残留（grep 复核确认）。
- 建议：改 task.md 自述措辞（限定 CSS 类名/路由标识），或按 spec 非范围条款豁免；不要求改代码。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：Round 1 无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    1. **TokenStatsView 扩展（implementer 自述偏离）**：`TokenStatsView.tsx:812` Agent 面板头部「Usage」按钮 icon `dashboard`→`clock_forward`。判断：**合理，无需回退**。理由：(a) 同语义——用量入口按钮统一时钟快进，与 AC-006 精神一致，视觉统一；(b) 必要性——本 task 删除 `UI_ICONS.dashboard` 条目（`Icon.tsx`），若不动此调用点会落入「未知 name → 空 SVG」分支渲染空白图标（可观测退化）；(c) 无残留——grep 确认 src 无其它 `Icon name="dashboard"` 引用，`LayoutDashboard` import 已删。TokenStatsView 头部按钮顺序（设置→用量→会话+窗口控制）与统一序一致。
    2. **chat_square 与 t274 守卫测试兼容性（prompt 点名）**：兼容。t274 守卫 2 用例（`icon.test.tsx`「Icon 来源守卫」）未修改且通过：UI_ICONS 块内大写标识符全来自 lucide import；`ICON_SOURCE` 不含 `message-chat-square`/`clock-fast-forward`/`assets/ui` 禁词。`ChatSquareIcon` 走 `Icon()` 顶部独立分支（`Icon.tsx:158`），不进入 UI_ICONS 映射，守卫正则天然绕过；新 AC-007 断言（特征 path `M10 15L6.92474 18.1137` + 非 lucide MessageSquare path）通过。popup 会话按钮（`TitleBar.tsx:108`）、托盘入口（`TrayMenu.tsx:75`）、Agent 头部（`TokenStatsView.tsx:824`）、PanelTitleBar Session 按钮共用该分支，同步生效。
    3. 基线 drift 详情见 f001。
    4. e2e（electron/web）在本环境未运行，改动为机械同步且与源码选择器逐一核对一致，低风险（trust_prior）。
    5. AC-003 右上角布局的实际视觉观感无 e2e 快照验证，单测以 className 断言近似（trust_prior 部分）。
- 总体判断：AC-001~008 全部达成；2 条 minor 均为文档/基线层面问题，无 t313 引入的 critical / important，可 PASS。
- 系统性 follow-up：无现成 task（已 `task.py list` 检索）。建议标题「DESIGN.md 导出区 drift 修复（designmd drift 门禁）」，slug `designmd_export_drift_fix`，backlog。

### AC 复验披露

- AC-001：`re_verified` —— `PanelTitleBar.test.tsx` 三新断言（固定序/设置无刷新/刷新首位）+ 源码 `panels` 数组与 `panel !== "Settings"` 条件核对，测试通过。
- AC-002：`re_verified` —— `popup_view.test.tsx` 新断言（`["刷新","设置","代理面板","会话历史"]`）+ `TitleBar.tsx:54-110` 顺序核对，通过。
- AC-003：部分 `re_verified`（`SessionShell.test.tsx` className 断言：topbar relative / titlebar flex-1 / tabs absolute 居中 + no-drag，通过）；视觉实际位置 `trust_prior`（无 e2e 视觉断言）。
- AC-004：`re_verified` —— `window_manager.test.ts`（URL 含 `#session`）、`route_values.test.ts`、`usageboard-web.test.ts`（hash 断言）、`App.tsx`/`use-route.ts` 源码核对，全部通过。
- AC-005：部分 `re_verified` —— `history-*` CSS 类名与 `#history`/`"history"` 路由字面量零残留（grep `src/`、`tests/` 复核）；lint 全量通过；单测 2919 通过。`trust_prior`/失败项 —— 全量测试 1 失败（designmd drift，基线问题，见 f001）；e2e 未运行（选择器已逐一核对）。
- AC-006：`re_verified` —— `PanelTitleBar.test.tsx` clock_forward 特征 path 断言 + 无 rect 断言，通过。
- AC-007：`re_verified` —— `icon.test.tsx` 手绘 path 断言 + t274 守卫兼容（见结论段 2），通过。
- AC-008：`re_verified` —— `settings_view_general.test.tsx` 无返回按钮断言 + `SettingsView.tsx` 无返回按钮/goBack 残留（grep 全库），通过。

coverage = 6 / 8（AC-003、AC-005 各含 trust_prior 部分；trust_prior 占比 25%）

reviewed_scope: a40b4c0c32f883d9

verdict: PASS
