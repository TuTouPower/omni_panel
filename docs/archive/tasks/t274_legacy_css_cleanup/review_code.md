# Task review t274（reviewer_focus: 代码）

- task：`t274_legacy_css_cleanup`
- spec：`docs/tasks/t274_legacy_css_cleanup/spec.md`
- diff_anchor：`67e72b977b489aab635d580b21104b3c9229b99b`
- target：`git diff 67e72b977b489aab635d580b21104b3c9229b99b`
- round：1
- reviewed_at：2026-08-09 22:52 UTC+8

## Findings

### t274_code_f001 - AC 5 未满足：blueprint 样式表述与 t274 后现状不一致（兼容桥/迁移完成态未更新）

- 严重度：important
- 锚点：AC 5「blueprint 与 AGENTS.md 中样式相关表述与现状一致，无失效引用」；spec 范围「更新 `docs/blueprint/` 相关条目（样式架构、约定、测试命令受影响处）与 `AGENTS.md` 中受影响表述」及 Finalization 清单（architecture.md 样式体系最终态条目）
- 位置：`docs/blueprint/architecture.md:75`、`docs/blueprint/architecture.md:79`
- 问题：t274 是全部窗口迁移与 CSS 收口的完成 task，但 diff 中 `docs/blueprint/`、`AGENTS.md`、`DESIGN.md` 零变更。architecture.md 两处当前状态描述已失效：
    - :75 仍称 t268 语义层含「兼容桥」「后续窗口迁移（t270-273）消费这些 token」——legacy var 兼容桥（`--win-bg`/`--blue`/`--primary`/`--ring`/`--text-*` 等）已由本 task 第二组删除（globals_css.test.ts:122-133 断言不残留），全部窗口迁移已完成（t274 为最后一个）。
    - :79 仍称「现有手写组件保留至对应窗口迁移（t270-273）时替换」——t270-274 全部完成后 globals.css 已无任何业务选择器（本轮 grep `^\.[a-z]` 仅剩 `.dark`），「保留至迁移时替换」的过渡表述无对应现状。
    - testing.md / conventions.md 样式相关条目亦未按 Finalization 清单检查更新。
- 建议：architecture.md 两节改为最终态（token 层只保留语义 token + @utility + base，无兼容桥；组件层表述「全部窗口已迁移、无手写组件类残留」），并核对 conventions.md 样式约定 / testing.md 测试命令是否有受影响的表述需要同步。

### t274_code_f002 - 旧手绘图标素材文件未删（AC 2 收口不彻底）

- 严重度：minor
- 锚点：AC 2「旧手绘图标实现已删除且无残留引用」
- 位置：`src/renderer/assets/ui/clock-fast-forward.svg`、`src/renderer/assets/ui/message-chat-square.svg`
- 问题：两文件为 77b9984d 引入的旧手绘图标素材，全仓无任何引用（grep 仅 Icon.tsx 注释提及文件名，`chat_square`/`clock_forward` 已改用 lucide `MessageSquare`/`ClockArrowUp`）。AC 2「无残留引用」满足，但「删除手绘 SVG 图标集」的收口目标下，死素材文件应一并清理。
- 建议：删除两个无引用 svg（若无需保留历史素材）。

### t274_code_f003 - dragOver 死 prop 清理不彻底（interface 与调用方残留）

- 严重度：minor
- 锚点：代码质量「死代码：未使用的变量/参数」
- 位置：interface 残留 `src/renderer/components/ProviderCard.tsx:36`、`src/renderer/components/UpcomingResetCard.tsx:15`、`src/renderer/components/ProviderAccountRow.tsx:24`；调用残留 `src/renderer/components/ProviderOverview.tsx:127`、`src/renderer/components/ProviderAccountList.tsx:137`、`src/renderer/views/popup-view/UpcomingResetCardSlot.tsx:44`
- 问题：三个组件删除了 `dragOver` 参数解构与 `.drag-over` 样式拼接，但 props interface 仍声明该字段、调用方仍传参。旧 globals.css 无 card 级 `.drag-over` 规则（仅 `.tab.drag-over`，ProviderNav 已保留 outline 版本），故删除无行为变化，但属清理不彻底（死字段 + 死传参）。若有意保留卡片拖拽悬停高亮反馈，则属于视觉反馈被静默移除，需另行确认。
- 建议：删 interface 字段与三处调用传参；或若有意恢复卡片拖拽悬停高亮，补回样式并保留 prop。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（1 important + 2 minor）
- 未进表的提示：
    - 文件过大（命中阈值且本 task 净增，按规则只列此处）：`CpaConnectorSettings.tsx` 524 行（净增 +61）、`src/web/usageboard-web.ts` 544 行（净增 +50）、`SettingsView.tsx` 756 行（净增 +12）、`PopupView.tsx` 957 行（净增 +13）；`TokenStatsView.tsx` 927 行已超阈值但本 task 净减，不触发。
    - 复杂度：未发现新增 ≥15 分支函数；web 桥 `theme.set`/`apply_theme_dom` 均线性。
    - 范围外观察：
        - `Icon name="alert_circle"`（`components/WebLoginSection.tsx:75`、`components/DeviceLoginSection.tsx:210`）：新旧 UI_ICONS 均无此 key，渲染空 SVG，属既有问题（t274 前后行为一致，非本 task 回归）；登录窗文件不在本 diff 内，未处理。
        - workspace/session-library 组件内仍有无样式死类名（`conversation-*`/`history-*`/`selection-*`/`preview-*`/`library-*`、`token-stats` 等），globals.css 无对应规则，无行为影响；t272/t273 迁移遗留，非本 task 范围。
        - web 版 theme 为 system 档时不实时跟随 OS 主题变化（桌面 nativeTheme 会）；spec 仅要求切换即时生效 + 刷新保持，未覆盖 OS 运行时切换，属合理降级，建议在 web 桥注释中明确该差异。
        - `tests/e2e/packaged/smoke.spec.ts` linux 二进制名 `omni-panel` → `omni_panel`：实测 `artifacts/linux-unpacked/omni_panel`（electron-builder 默认取 package.json name），属修正长期失效路径，为 AC 4 `pnpm test:packaged` 门禁必要修复，虽超出 CSS 范围但可辩护。
- 总体判断：实现主体（CSS 清零、图标 lucide 化、web 版主题/accent 补齐与测试）质量良好，typecheck 与 280 个相关单测通过；但 spec 明示的 blueprint 同步更新（AC 5）完全未做，architecture.md 存在明确失效表述，未解决 important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-09 23:35 UTC+8)

- task：`t274_legacy_css_cleanup`
- spec：`docs/tasks/t274_legacy_css_cleanup/spec.md`
- diff_anchor：`67e72b977b489aab635d580b21104b3c9229b99b`
- target：`git diff 67e72b977b489aab635d580b21104b3c9229b99b`
- round：2
- reviewed_at：2026-08-09 23:35 UTC+8

## Findings

（本轮无新 finding）

## 结论

- 前轮 finding 复核：
    - `t274_code_f001`（important）：**已消除**。`docs/blueprint/architecture.md` 设计 token 层 / 组件层两节已改为最终态：globals 只保留 token + 基础 + keyframes + `@utility`、legacy 兼容桥已清除、全部窗口已迁移、无手写组件类残留（:75 / :79）。`conventions.md` / `testing.md` / `AGENTS.md` 无失效的当前态样式迁移表述；`decisions.md` 014 中「兼容桥…删除归 t272/t273」属决策时点历史记录，非当前态描述，不重开 AC 5。
    - `t274_code_f002`（minor）：**已消除**。`src/renderer/assets/ui/clock-fast-forward.svg`、`message-chat-square.svg` 已删除；`assets/ui/` 目录空；`Icon.tsx` 中 `clock_forward`/`chat_square` 映射 lucide；测试断言不再引用旧素材路径。
    - `t274_code_f003`（minor）：**已消除**。`ProviderCard` / `UpcomingResetCard` / `ProviderAccountRow` interface 与解构已去掉 `dragOver`；`ProviderOverview` / `ProviderAccountList` / `UpcomingResetCardSlot` / `PopupView` / `use_dnd_handlers` 已去掉 `overProvider`/`overId` 与对应传参；`src/` 内无 `dragOver` 残留。ProviderNav tab 级 `overProvider` + outline 反馈保留（有样式、有行为），不属死字段。
- 本轮新发现：0 条
- 未进表的提示：
    - 文件过大（命中阈值且本 task 净增，按规则只列此处）：`CpaConnectorSettings.tsx` 524 行、`src/web/usageboard-web.ts` 544 行、`SettingsView.tsx` 756 行；`PopupView.tsx` 947 行、`TokenStatsView.tsx` 927 行本轮净减或持平，不额外触发。
    - 复杂度：`theme.set` / `apply_theme_dom` / `config.save` 通知路径均线性；无新增 ≥15 分支函数。
    - 范围外观察（同 R1，未引入回归）：
        - `Icon name="alert_circle"`（登录相关组件）仍无 UI_ICONS key，渲染空 SVG；本 task 前后一致，非 t274 回归。
        - workspace/session-library 无样式死类名（`conversation-*`/`history-*`/`token-stats` 等）仍在，globals 无对应规则，无行为影响。
        - web `theme.set('system')` 不订阅 OS `prefers-color-scheme` 运行时变化；spec 仅要求切换即时生效 + 刷新保持，合理降级。
        - `decisions.md` 014 兼容桥子决策仍写历史删除归属，属 ADR 时点叙述，architecture 已是权威当前态。
    - AC 抽查：globals 业务选择器仅 `.dark`；`src/` 无 `var(--win-bg|--blue|--risk-*)` 残留；操作图标走 lucide；vendor logo/mark 与 sparkline 保留；web theme/accent 经 bridge 本地应用 + onThemeChange/onConfigChange 广播。
- 总体判断：Round 1 全部 finding 已由 diff 核实消除；本轮无新 critical/important/minor，PASS。
- 系统性 follow-up：无

verdict: PASS
