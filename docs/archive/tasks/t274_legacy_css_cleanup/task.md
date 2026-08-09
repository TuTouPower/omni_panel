---
tid: "t274"
slug: "legacy_css_cleanup"
title: "手写 CSS 清零与图标统一 lucide + web 版一致性 + blueprint 更新"
status: "done"
branch: "t274_legacy_css_cleanup"
worktree: ""
review_level: "full"
diff_anchor: "67e72b977b489aab635d580b21104b3c9229b99b"
depends_on: "t273"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### t274 第一组（用量面板/托盘 CSS 收口，2026-08-09）

- 范围：Popup/Provider/Token/Usage/Trend/Tray 全部 JSX 业务 class → Tailwind v4 utility / ui 组件；
  删除 globals.css 352–1220、2114–2319 区段规则；markdown 规则收编保留。
- 共享类全量迁移：`.window`（PopupView + SettingsView 3 处）、`.net-banner`（SettingsView）、
  `.panel-titlebar`（TokenStatsView + 旧 PanelTitleBar → ui）、`.app-logo/.app-title`
  （popup TitleBar/TrayMenu/TokenStatsView/旧 PanelTitleBar → ui）。
- PanelTitleBar 收口：旧 `components/PanelTitleBar.tsx` 删除，`PanelName` 类型迁至
  `lib/panel-navigation.ts`；ui/PanelTitleBar 增加 panel 形态（品牌区+面板互跳+窗口控制），
  SettingsView/SessionShell/TokenStatsView 统一走该形态，拖拽区内置于组件（`[-webkit-app-region:drag]`）。
- 保留：token/语义变量/基础样式/@utility（glass-menu/shimmer/metric-num/transition-feedback）、
  `.vicon` + vendor-logo 明暗切换规则（Icon.tsx VendorMark 资产）、`@keyframes ctxIn/maDrawer`
  （TrayMenu/抽屉动画引用）、markdown 规则（MarkdownMessage 仍在用）。
- 死规则删除：`.card-menu*/.cm-*/.ctx-*/.statusbar/.sb-*/.chart/.floating-close-btn/.bar-watch/.sp-ic.on`。
- legacy var：TrendSparkline 的 `--blue/--track/--text-3/--card-bg` → 对应语义 token；
  popup 壳层用 `shadow-window dark:shadow-window-dark`、`bg-[var(--color-surface-window)]` 等。
- 测试：单测选择器按「data-testid / 已有语义属性」迁移（globals_css.test 重写为清零白名单守卫、
  provider_account_list_spacing/first_paint_theme 改断言组件 utility）；e2e（web+electron）选择器
  批量替换为 data-testid（popup-titlebar/popup-scroll/popup-scroll-inner/popup-tabs-wrap/app-title/
  collapsible-card/bar-row/bar-fill/card-name/card-grip/card-state/cs-action/error-badge 等）。
- 验证：`pnpm typecheck`、`pnpm lint`、renderer 单测 108 文件 1061 用例全绿、
  `pnpm test` 2542 用例通过（14 个 node 套件文件因环境缺 electron 二进制导入失败，与本次改动无关，
  主仓同样缺）、`pnpm build:web` 通过且产物 CSS 无残留旧类选择器、`.vicon` 保留。
- 遗留（下一步组）：settings/data-source/CPA/account 专属旧类（`.set-*/.ds-*/.acc-*/.ar-*/.cfg-*/.ao-*/.disc-*`
  等）及 `:root/.dark` legacy var 桥接仍在 globals.css，留 t274 第二组。

### t274 第二组（settings/data-source/CPA/account CSS 收口，2026-08-09）

- 范围：SettingsView/settings 各 section/SetRow(新增 SetGroupLabel)/accounts_list、CpaConnectorSettings、
  CpaCard/AccountRow/VendorCard/AliasEditor 全部业务 class → Tailwind v4 utility / ui 组件；
  删除 globals.css 全部 settings/data-source/CPA/account 旧选择器（`.set-*/.ds-*/.dc-*/.dm-*/.cc-sep/
.cpa-*/.cfg-*/.cs-*/.disc-*/.acct-*/.acc-*/.ar-*/.ao-*/.src-tag/.sub-clear` 等）。
- `.vicon` 收口：VendorMark wrapper 改为组件内 utility（`flex shrink-0 items-center justify-center` +
  `[&_svg]:block [&_img]:block`），明暗 logo 切换封装为 `dark:hidden` / `hidden dark:block`（t268 dark 变体）；
  globals.css 删除 `.vicon`/`.vendor-logo-*` 全部规则；wrapper 加 `data-testid="vendor-mark"`。
- Markdown 收口：`MarkdownMessage.tsx` 的 `.markdown-content*` 全部规则删除，改为 ReactMarkdown
  element renderer 内 utility（h1-h4/p/ul/ol/table/th/td/code/pre/blockquote/a；pre 用
  `[&_code]:bg-transparent [&_code]:p-0` 重置块级 code），可见行为对齐旧规则。
- legacy var 桥清零：删除 globals.css `:root/.dark` 第二段 legacy 块（`--win-*/--card-*/--text*/-hairline/
--field-*/--chip-*/--menu-*/--iconbtn*/--desktop/--green/--red/--risk-*/--track/--tab-active/--grid-line/
--radius` 及 shadcn 别名 `--border/--card/--muted/--foreground/--primary-foreground` 等）与语义层兼容桥
  `--blue/--primary/--ring/--focus-ring`；base 样式改 `--color-surface-window`/`--color-on-surface`。
  同步消费：AccountRow/CpaCard 状态色 → `--color-success/--color-risk-critical/--color-on-surface-muted`；
  usage-colors.ts 风险档 → `--color-success/--color-risk-mid/high/critical`；components/Button、Card →
  `--color-*`/`--radius-sm`；settings-view/lib.ts swatch → 语义色；两个 index.html 首帧注释去掉 `--win-bg`。
- 语义测试锚点：AccountRow/CpaCard 行 `data-testid="account-row"` + `data-mode`（direct/cpa-source/cpa-child），
  卡片 `data-testid="account-card"`，列表 `accounts-list`，vendor 名 `account-vendor`，状态 `account-status`；
  CpaConnectorSettings 行 `cfg-row`/`cfg-scope-row`/`cfg-vendor`；SetRow `set-row`；VendorMark `vendor-mark`。
  单测（icon/cpa*card/cpa_connector_settings/settings_view*\*/globals_css/usage-colors/button 等）与
  e2e（web+electron）选择器全部迁到 data-testid/语义属性；globals_css.test 守卫清单扩展第二组旧类 +
  legacy var 清零断言。
- 验证：`pnpm typecheck`、`pnpm lint`、`pnpm format:check`（触及文件）通过；renderer 单测 108 文件 1059 用例
  全绿（smoke 13 用例含）；`pnpm test` 238 文件 2547 用例通过（14 个 node 套件仍因环境缺 electron 二进制
  导入失败，与本次改动无关，主仓同样缺）；`pnpm build:web` 通过且产物 CSS 无旧类选择器，`dark:hidden`/
  `[&:not(:first-child)]`/`shadow-card` 均编译。

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

### Round 1 (2026-08-09 23:30 UTC+8)

| finding_id     | severity  | status | rationale                                                      | fix_ref                                                                                                                                                                                                                                                                                                                          |
| -------------- | --------- | ------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t274_code_f001 | important | 已修   | architecture.md 已同步样式迁移最终态，确认无须同步其它样式条目 | docs/blueprint/architecture.md:75-79                                                                                                                                                                                                                                                                                             |
| t274_code_f002 | minor     | 已修   | 两个无引用旧手绘 SVG 素材已删除                                | src/renderer/assets/ui/clock-fast-forward.svg; src/renderer/assets/ui/message-chat-square.svg                                                                                                                                                                                                                                    |
| t274_code_f003 | minor     | 已修   | 卡片拖拽悬停死字段与调用残留已清理，真实重排回调保留           | src/renderer/components/ProviderCard.tsx:35-40; src/renderer/components/ProviderOverview.tsx:40-49; src/renderer/components/ProviderAccountList.tsx:8-17; src/renderer/components/ProviderAccountRow.tsx:17-27; src/renderer/components/UpcomingResetCard.tsx:8-18; src/renderer/views/popup-view/UpcomingResetCardSlot.tsx:8-17 |
| t274_test_f001 | important | 已修   | scheduler e2e 改为等待刷新 SVG 的 animate-spin 出现并消失      | tests/e2e/web/scheduler.spec.ts:45-51                                                                                                                                                                                                                                                                                            |
| t274_test_f002 | minor     | 已修   | globals.css 清零守卫改为顶层 selector 白名单                   | tests/unit/renderer/globals_css.test.ts:16-61                                                                                                                                                                                                                                                                                    |
| t274_test_f003 | minor     | 已修   | 增加 lucide 映射来源与旧手绘素材引用守卫                       | tests/unit/renderer/components/icon.test.tsx:55-89                                                                                                                                                                                                                                                                               |
| t274_test_f004 | minor     | 已修   | critical 状态测试改断言 CollapsibleCard data-status 属性       | tests/unit/renderer/components/provider_account_row.test.tsx:117-125                                                                                                                                                                                                                                                             |

### Round 2 (2026-08-09 23:36 UTC+8)

- code/test 均无新 finding；Round 1 的 7 条 finding 已全部修复并经复审确认。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：自动化验收满足；AC 3 `[deploy]` 的人工视觉逐屏对照未执行。
- 证据：
    - `pnpm typecheck`、`pnpm lint`、`pnpm deadcode`、`pnpm arch`、`pnpm designmd:check`、`pnpm build` 通过。
    - `pnpm test` 退出码为 0：252 个 test files，2753 passed，2 skipped。
    - Web E2E 使用 `E2E=1 E2E_HEADLESS=1 MOCK_FIXTURE=synthetic xvfb-run -a` 无头运行，65 passed；scheduler 专项 4 passed。
    - Electron E2E 使用 `E2E=1 E2E_HEADLESS=1 xvfb-run -a` 无头运行，54 passed、8 skipped；跳过项为既有 headless 门控测试。
    - `pnpm package` 的 electron-vite/Vite/electron-builder 构建阶段成功并生成 `artifacts/linux-unpacked/omni_panel`；Linux 启动包装脚本误用 macOS 路径的问题已登记为 `p104`。直接对 Linux 产物运行 `E2E=1 E2E_HEADLESS=1 xvfb-run -a pnpm test:packaged`，4 passed。
    - `pnpm check` 的 typecheck/lint 通过；format:check 仍被 anchor 既有文件、当前 review 产物及 task 文档格式共同阻断，t274 触及源码与测试文件已单独通过格式检查。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 全局 CSS、操作图标与 Web/Desktop 主题交互完成收口；无头 Web、Electron、packaged E2E 通过，Round 2 code/test review 均 PASS；Linux packaged 启动脚本路径问题登记为 `p104`。
