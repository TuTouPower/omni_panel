# Task review t311（reviewer_focus: 代码）

- task：`t311_web_panel_nav_buttons_middle_click`
- spec：`docs/tasks/t311_web_panel_nav_buttons_middle_click/spec.md`
- diff_anchor：`36245c06c7fb0ceb60a1a931337f6e3a580a7972`
- target：`git diff 36245c06c7fb0ceb60a1a931337f6e3a580a7972`
- round：1
- reviewed_at：2026-08-12 03:10 UTC+8

## Findings

### t311_code_f001 - AC-004 静态前提断言恒真：`hasAttribute("onclick")` 在 React 下永远为 false

- 严重度：important
- 锚点：AC-004（及 spec 可测试性声明「渲染断言（链接无 onClick 拦截、有 href）足以覆盖静态前提」）
- 位置：
    - `tests/unit/renderer/components/PanelTitleBar.test.tsx`（web 态用例内 `expect(el.hasAttribute("onclick")).toBe(false)`）
    - `tests/unit/renderer/views/token_stats_header.test.tsx`（同）
    - `tests/unit/renderer/views/popup_view.test.tsx`（web 标题栏 + EmptyState 两处）
    - `tests/unit/renderer/views/settings_view_general.test.tsx`（web 外链卡片）
- 问题：React 合成事件委托到根容器，DOM 元素从不渲染 `onclick` 属性——无论元素是否挂 onClick 拦截。已实测项目依赖验证（React 19 SSR `renderToString(<a href="#x" onClick={...}>)` → `<a href="#x">link</a>`，无 onclick 属性；客户端委托同理）。因此 4 个测试文件里 6 处 `expect(el.hasAttribute("onclick")).toBe(false)` 恒真、任何实现（包括带 preventDefault 拦截的 `<a onClick>`）都必然通过，AC-004 承诺的「无 onClick 拦截」静态前提实际未被自动化验证。e2e 点击→hash 用例（panel_navigation / popup_view.spec）只对 PanelTitleBar 互跳与 popup 会话链接间接验证了无拦截；about 外链、EmptyState、popup 设置/代理链接没有任何点击透传断言。
- 建议：改为可失败的断言——jsdom 中真实 click 并断言默认导航生效（hash 变化 / hashchange 触发，证明无 preventDefault 拦截），或经 react-test-renderer 断言元素 props 无 `onClick`；至少换用能区分「有无 handler」的技术手段。

### t311_code_f002 - about 卡片类串残留冲突 utility（font-semibold/font-normal、rounded-md/rounded-xl）

- 严重度：minor
- 锚点：行为缺陷——web 端关于页卡片副标题字重回归（400→600）
- 位置：`src/renderer/views/settings-view/sections/about_section.tsx:125-128`（card_class）
- 问题：card_class 拼接了 Button base 类（含 `font-semibold`、`rounded-md`，见 `Button.tsx` base）又追加原卡片类（`rounded-xl ... font-normal`）。桌面分支经 `cn`（twMerge）保留后者无碍；web `<a>` 不经 twMerge，同名 utility 由 CSS 源顺序决胜——已核对构建产物，`font-normal` 规则先于 `.font-semibold`，故 web 端 `<a>` 元素 font-weight 取 semibold，卡片副标题 span（无显式 font-weight，继承元素）由原 font-normal 变 semibold，与桌面端（twMerge 保 font-normal）分叉，属 t311 引入的可见样式回归。rounded-md/rounded-xl 冲突结果碰巧一致（xl 在后胜出），无可见影响但同属复制残留。
- 建议：card_class 只保留意图类（去掉复制自 Button base 的 `font-semibold`/`rounded-md` 等与后续类冲突的部分），统一为单一 font-weight 与 border-radius。

### t311_code_f003 - web 链接样式类字符串三处重复 + about 复制 Button 基类（DRY）

- 严重度：minor
- 锚点：代码质量（DRY，verbatim 重复）
- 位置：`src/renderer/components/ui/PanelTitleBar.tsx:107-111`、`src/renderer/views/popup-view/TitleBar.tsx:34-38`、`src/renderer/views/TokenStatsView.tsx:795-800/826-831/857-862`（同串内联三次）
- 问题：同一 icon 链接样式串在 3 文件重复（TokenStatsView 内 3 份字面量）；about_section 的 card_class 直接复制 Button base/variant 类串。后续 Button 基类调整（hover/focus/圆角）时链接样式不会同步，存在行为/外观分叉隐患。本次无已观测缺陷，按 verbatim 重复评 minor。
- 建议：抽公共样式常量（如 `src/renderer/components/ui/` 下 icon-link 样式）或在 Button 侧提供 asChild/link 变体，消除三处重复；about 卡片配色类保留复制但有注释指向 Button 变体。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：3 条（important 1、minor 2）
- 未进表的提示：
    - 文件过大：`src/renderer/views/TokenStatsView.tsx` 1090 行（基线 1034，本 task 净增 +56），≥ 800 阈值，见降级规则不进 finding 表。其余触及文件均低于阈值。
    - 复杂度：无函数达阈值（新增分支均为单层 is_web 条件 + 每臂直渲染）。
    - 范围外观察：`tests/e2e/pages/popup_page.ts:23` 与 `app_lifecycle.spec.ts` 定位从 `getByRole("button")` 改 `getByTitle("设置")`，web/桌面 title 两态一致，跨态定位成立；t307 两个旧语义用例整体删除并写明理由，符合测试纪律。
- 总体判断：实现与 6 条 AC 的静态面（href/target/rel/桌面 button）全部到位、82 条单测绿灯、路由挂载核对一致，但 AC-004 静态前提的关键断言恒真（f001），自动化覆盖承诺未兑现，存在 1 条未解决 important，verdict FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`——PanelTitleBar.test.tsx / token_stats_header.test.tsx 断言 web 态 link href `#usage`/`#session`/`#setting` 且桌面态 button；`src/renderer/hooks/use-route.ts` VALID_ROUTES 与 `App.tsx` 路由挂载（usage/agent/session/setting）逐行核对；4 文件 82 单测实际运行通过。e2e panel_navigation 用例代码审读（未运行 web 服务器）。
- AC-002：`re_verified`——popup_view.test.tsx 断言 web 态设置/代理/会话 link href `#setting`/`#agent`/`#session`、桌面态 button 仍走桥方法（settings.open）；TitleBar.tsx 分支逐行核对。
- AC-003：`re_verified`——settings_view_general.test.tsx 断言 7 卡 target `_blank` / rel `noopener noreferrer` / href 与 ABOUT_URLS 一致、「检查更新」保持 button；桌面 window.open 分支代码核对。
- AC-004：`trust_prior`——[deploy] 真实中键/Ctrl+Click 为浏览器原生行为，依赖 e2e 点击→hash 用例（panel_navigation、popup_view.spec）作为间接证据，本轮未实际运行 e2e；且其单元层静态断言恒真（见 f001），该前提实际未被自动化验证。
- AC-005：`re_verified`——四组件测试断言桌面态 tagName BUTTON / 无 href / onClick 保留（navigate 桥、settings.open、window.open）；真实桌面运行态 `trust_prior`（依赖既有桌面测试体系）。
- AC-006：`re_verified`——popup_view.test.tsx EmptyState 用例断言 web `<a href="#setting">`、桌面 button 点击调 settings.open；EmptyState.tsx 分支逐行核对。

coverage = 5 / 6（AC-004 为 trust_prior，占比 1/6 ≤ 30%）

verdict: FAIL

## Round 2 (2026-08-12 03:15 UTC+8)

- round：2
- reviewed_at：2026-08-12 03:25 UTC+8
  reviewed_scope: 6744edb9cc0328e8

### 前轮 finding 复核

- **t311_code_f001（code+test，important）→ 已消除**。6 处 `hasAttribute("onclick")` 恒真断言全部删除，替换为可失败断言：点击链接断言对应 open 桥未被调用——PanelTitleBar.test.tsx（`usage.click()` → `onNavigate` 未调用）、token_stats_header.test.tsx（`usage_link.click()` → `open_tray_panel`、`session_link.click()` → `open_history` 未调用）、popup_view.test.tsx 标题栏（`agent_link.click()` → `token_stats_open`、`session_link.click()` → `session_history_open` 未调用）+ EmptyState web 用例（`add_link.click()` → `settings.open` 未调用）、settings_view_general.test.tsx（7 卡 `link.click()` 后 `window.open` spy 未调用）。任一实现误在 `<a>` 挂 onClick 都会触发对应 mock 使断言失败，可失败成立；实测 4 测试文件 82 用例复跑全绿（12/13/26/31）。真实浏览器「无拦截」证据在 web e2e：panel_navigation.spec 3 段 link 点击 → hash poll 断言，popup_view.spec 会话链接点击后 hash=#session 且 onFocus 分发数组为空（`toEqual([])`，顺带实证 d036「空 loc 分发」前提随 t311 消失——已核对 src 内 `sessionHistory.open` 全部 6 个调用点均非路由挂载路径）。消除完整。
- **t311_code_f002（minor）→ 已消除**。about_section card_class 现仅意图类（`rounded-xl`/`font-normal`/flex 布局/聚焦环），删除 Button base 复制的 `font-semibold`/`rounded-md`；与 Button.tsx base 逐项核对，web `<a>` 不再带冲突 utility；桌面分支经 cn/twMerge 结果与旧版等价（card_class 内复制的变体背景类与 Button variants 值相同，无可见变化）。
- **t311_code_f003（minor）→ 已消除**。`src/renderer/components/ui/icon-link.ts` 导出 ICON_LINK_CLS，PanelTitleBar（1 处）、popup TitleBar（2 处）、TokenStatsView（3 处）共 5 处替换为常量引用，原内联串删除。

### 本轮新发现

### t311_code_f004 - f003 替换引入非 prettier 格式，`pnpm format:check` 门禁失败

- 严重度：minor
- 锚点：可观测缺陷——`pnpm format:check`（`pnpm check` 门禁之一）失败
- 位置：`src/renderer/views/TokenStatsView.tsx:797 / 824 / 849`（`className={\nICON_LINK_CLS\n}` 三处）
- 问题：f003 修复在 TokenStatsView 的 3 处 `<a>` 上生成 `className={` 换行后接无缩进 `ICON_LINK_CLS` 的多行写法，非 prettier 输出（其余两文件为单行 `className={ICON_LINK_CLS}`）。实测 `pnpm exec prettier --check` 仅该文件报警，`pnpm format:check` 失败；implementer 报告只声称 typecheck/lint 通过，未覆盖 format:check。
- 建议：三处改为单行 `className={ICON_LINK_CLS}`（或对全仓 `pnpm format` 后复核 diff）。

## 结论

- 前轮 finding 复核：f001/f002/f003 全部以 diff 与复跑核实消除（见上）。
- 本轮新发现：1 条（minor 1）
- 未进表的提示：
    - 文件过大：`TokenStatsView.tsx` 1079 行仍 ≥ 800 阈值，但本 task 净增已由 Round 1 的 +56 转为 −11（ICON_LINK_CLS 抽取），不满足「本 task 净增」出 finding 条件。
    - 复杂度：无新增达阈值函数。
    - 范围外观察：popup_view.spec 删除 t307 旧语义用例且写明理由（测试纪律合规）；TokenStatsView 第三处（Session）web 分支缺 t311 注释、另两处有（风格性不一致，不出 finding）；icon-link.ts/about_section 注释引用 finding 编号（t311_code_f003/f002），无害。
- 总体判断：前轮唯一 blocker（f001）及其余 minor 全部真修，本轮新发现仅 1 条 minor 格式门禁问题，无未解决 critical/important，verdict PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 2）

- AC-001/002/003/005/006：`re_verified`——4 测试文件 82 用例实际复跑通过（PanelTitleBar 12 / token_stats_header 13 / popup_view 26 / settings_view_general 31），href/target/rel/桌面 button 断言逐条核对；e2e panel_navigation/popup_view.spec 用例代码审读（未运行 web 服务器）。
- AC-004：`trust_prior`——[deploy] 真实中键/Ctrl+Click 为浏览器原生行为；静态前提「无 onClick 拦截」现由可失败单测断言 + e2e 点击→hash 断言（panel_navigation 3 段、popup_view 会话链接 hash=#session）覆盖，e2e 本轮未实际运行。

coverage = 5 / 6（AC-004 为 trust_prior，占比 1/6 ≤ 30%）

verdict: PASS

## Round 3 (2026-08-12 03:30 UTC+8)

- round：3
- reviewed_at：2026-08-12 03:40 UTC+8
  reviewed_scope: fe7fb1597585e666

### 前轮 finding 复核

- **t311_code_f004（minor）→ 已消除**。以 diff 与实测核实：
    - prettier 合规：`pnpm exec prettier --check` 对 TokenStatsView.tsx 及全部触及源码/测试（PanelTitleBar.tsx / TitleBar.tsx / EmptyState.tsx / about_section.tsx / icon-link.ts / token_stats_header.test.tsx）全部通过，`pnpm format:check` 不再报该文件。三处 `<a>` 中 Settings/Session 为 prettier 多行格式、Usage 为单行（≤80 列），均为标准输出。
    - web 分支完整：`TokenStatsView.tsx` diff 显示三互跳按钮重建齐全——`<a className={ICON_LINK_CLS} href="#setting">`（Settings 面板）、`href="#usage"`（Usage 面板）、`href="#session"`（Session 面板），title/aria-label 均保留，与 token_stats_header.test.tsx web 用例三断言（getByRole("link") + href）逐字对应；桌面分支 `<Button onClick={() => navigate("Settings"/"Usage"/"Session")}>` 与 diff 移除行逐字一致；`ICON_LINK_CLS`、`is_web` 两 import 在位且均被使用，无残留 import。
    - 无 t311 改动遗漏：TokenStatsView 内 t311 改动面即「两 import + 三按钮块」，重建后全部在位；其余触及文件 diff 与 Round 2 核验状态一致，`git checkout --` 未波及其它文件（git status 亦证实仅 TokenStatsView.tsx 属本轮重建面）。
    - 实测复跑：`vitest run` token_stats_header.test.tsx 13/13 通过；`pnpm typecheck` 通过。
    - 差异说明：重建后三处 web `<a>` 分支不带 t311 注释（原实现 Settings/Usage 两处有注释、Session 无，Round 2 已记为风格性不一致）；常量语义已在 icon-link.ts 文件头注释说明，纯注释差异无行为影响，不构成 finding。

### 本轮新发现

无（0 条；下一可用编号 t311_code_f005）。

## 结论

- 前轮 finding 复核：f004 以 diff 逐字核对、`prettier --check`、82 单测复跑、typecheck 四方证据核实消除，无遗留（见上）。
- 本轮新发现：0 条。
- 未进表的提示：
    - 文件过大：`TokenStatsView.tsx` 1064 行（基线 1034，本 task 净增 +30），≥ 800 阈值，属既有文件膨胀，按降级规则不进 finding 表；重建未改变该结论。
    - 复杂度：无新增达阈值函数（三处均为单层 `is_web()` 条件 + 每臂直渲染）。
    - 范围外观察：无。
- 总体判断：f004（prettier 门禁失败）真修；`git checkout` 还原-重建过程未遗漏任何 t311 改动、未引入新问题，其余文件与 Round 2 核验状态一致，无未解决 critical/important，verdict PASS。
- 系统性 follow-up：无

### AC 复验方式（Round 3）

- AC-001：`re_verified`——TokenStatsView 重建后三链接 href `#setting`/`#usage`/`#session` 与 token_stats_header.test.tsx 断言逐字一致，13/13 用例实际复跑通过；桌面 Button 分支与移除行逐字核对。
- AC-002：`re_verified`——popup_view.test.tsx 26/26 实际复跑通过（web 设置/代理/会话 link href `#setting`/`#agent`/`#session` 断言 + 桌面 button 桥调用断言）；TitleBar.tsx 分支 diff 核对与 Round 2 一致。
- AC-003：`re_verified`——settings_view_general.test.tsx 31/31 实际复跑通过（7 卡 target/rel/href 断言 + 点击不触发 window.open）。
- AC-004：`trust_prior`——[deploy] 真实中键/Ctrl+Click 为浏览器原生行为，需人工环境；静态前提「无 onClick 拦截」由 4 测试文件 82 用例的可失败断言（点击 link 不触发对应 open 桥）实际复跑覆盖，e2e 点击→hash 用例本轮未运行（与 Round 1/2 同）。
- AC-005：`re_verified`——PanelTitleBar.test.tsx 12/12 + popup_view 26/26 + settings_view_general 31/31 + token_stats_header 13/13 复跑，桌面态 tagName BUTTON / 无 href / onClick 保留断言全覆盖。
- AC-006：`re_verified`——popup_view.test.tsx EmptyState web 用例（`<a href="#setting">` + 点击不调 settings.open）随 26/26 复跑通过。

coverage = 5 / 6（AC-004 为 trust_prior，占比 1/6 ≤ 30%）

verdict: PASS
