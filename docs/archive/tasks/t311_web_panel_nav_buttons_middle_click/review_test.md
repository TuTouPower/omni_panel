# Task review t311（reviewer_focus: 测试）

- task：`t311_web_panel_nav_buttons_middle_click`
- spec：`docs/tasks/t311_web_panel_nav_buttons_middle_click/spec.md`
- diff_anchor：`36245c06c7fb0ceb60a1a931337f6e3a580a7972`
- target：`git diff 36245c06c7fb0ceb60a1a931337f6e3a580a7972`
- round：1
- reviewed_at：2026-08-12 03:10 UTC+8

## Findings

### t311_test_f001 - 恒真断言：`hasAttribute("onclick")` 在 React 下永远为 false，「无 onClick 拦截」静态前提无单测证据

- 严重度：important
- 锚点：AC-004 静态前提「链接无 onClick 拦截」的断言无效；危险模式「恒真断言」
- 位置：
    - `tests/unit/renderer/components/PanelTitleBar.test.tsx:65-67`（usage/agent/session 循环）
    - `tests/unit/renderer/views/popup_view.test.tsx:398-400`（设置/代理/会话循环）
    - `tests/unit/renderer/views/settings_view_general.test.tsx:352`（7 外链卡循环）
    - `tests/unit/renderer/views/token_stats_header.test.tsx:379-381`（三互跳循环）
- 问题：`expect(el.hasAttribute("onclick")).toBe(false)` 想验证「链接无 onClick 拦截」（AC-004 静态前提）。但 React 合成事件（JSX `onClick`）经事件委托绑定，不渲染为 DOM attribute——已用项目内 react@19.2.6 + jsdom 实渲染探针验证：带 `onClick` 的 `<a>` 渲染后 `hasAttribute("onclick")` 恒为 `false`。因此该断言对任何实现（无论链接有没有加 onClick+preventDefault 拦截）恒 PASS，属于恒真断言；AC-004 静态前提中「无 onClick 拦截」这一半在单测层看似覆盖、实际未验证，无法捕获将来给链接加 onClick 拦截的回归。
- 建议：删除这些恒真断言（保留 href/target/rel/tagName 真断言）。「无 JS 拦截」的有效证据在 e2e 层已存在（左键点击后 hash 切换、onFocus 无分发——panel_navigation.spec.ts / popup_view.spec.ts 新用例实跑通过），若仍需单测层证据，可用行为断言替代（jsdom 不实现锚点默认导航，需配合手动设置 location.hash 后点击断言未被 preventDefault 拦截），或明示由实现审阅支撑，不作自动测试证据。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（round 1）
- 改测方向复核：无「迁就实现」的改测。逐项核对：
    - `PanelTitleBar.test.tsx:49-50`（web 窗口控制用例内 button→link）：核心语义「web 不渲染窗口控制」不变，附带断言随形态迁移，符合 AC 语义变化；
    - `popup_view.test.tsx:381-408`（t307 web 渲染用例改写为三 link 断言）：t307 AC-001「显示 button」→ t311「显示 link + href」，spec 语义变化驱动，注释说明充分；
    - `popup_view.test.tsx` t307 AC-002「点击会话按钮调 open」用例整体删除：web 会话入口改原生链接后 open 桥不再被调（d036 前提消失），新语义由 e2e「左键进 #session + onFocus 未收到分发」替代，删除合法；
    - `popup_view.spec.ts` t307 两用例（可见性 button→link、dispatch 用例删除替换）同上，合法；
    - `panel_navigation.spec.ts` 互跳/隐藏断言 button→link：web 下控件形态随 spec 变更，断言跟随新形态，合法；
    - `popup_page.ts clickSettings` / `app_lifecycle.spec.ts` 改 `getByTitle("设置")` 跨态定位：electron/web 共用页面对象，title 两态一致，不改变断言对象语义，合法。
- 本轮新发现：1 条
- 未进表的提示：
    - `TokenStatsView` header 的 Settings/Usage 链接与 popup「代理面板」链接的**点击**未在 e2e 覆盖（仅单测 href 断言 + 同类链接 e2e hash 切换）；同构渲染，属可选扩展 case，不阻断；
    - web 空态「添加服务」入口点击（#setting）无独立 e2e（需空插件列表 fixture）；静态断言（a + href + 无拦截）+ 同类链接 e2e hash 切换可接受，属可选扩展；
    - about 外链 `target="_blank"` 新标签打开为浏览器原生行为，静态属性断言覆盖，测试策略未要求 e2e；
    - 全量单测 256/257 文件通过，唯一失败 `designmd.test.ts`（DESIGN.md/globals.css 导出区漂移门禁）为存量失败，t311 diff 未触碰相关文件，与本 task 无关；
    - 恒真断言 f001 不掩盖当前实现正确性：5 位点源码确认 web 分支 `<a>` 均无 onClick，桌面分支保持 Button + 桥调用。

### AC 复验方式

- AC-001：re_verified。`token_stats_header.test.tsx:363-387` web 用例断言三 link href（#setting/#usage/#session）+ `panel_navigation.spec.ts` 实跑 Agent→Session 左键点击 hash=#session 且 session-shell 挂载；实现源码 `TokenStatsView.tsx:791-881` is_web 分支确认。
- AC-002：re_verified。`popup_view.test.tsx:381-408` 三 link href 断言 + e2e `popup_view.spec.ts` 设置链接点击进 #setting、会话链接点击进 #session 实跑全绿；`TitleBar.tsx:82-120` is_web 分支确认。
- AC-003：re_verified。`settings_view_general.test.tsx:330-360` 断言 7 外链卡 tagName/href/target/rel + update 卡保持 BUTTON，实跑全绿；`about_section.tsx` 源码确认。
- AC-004：re_verified（静态前提部分）。href 真断言 + e2e 左键点击 hash 切换（无 preventDefault 拦截）实跑全绿；真实中键/Ctrl+Click 新开标签页为浏览器原生行为，属 [deploy]（可测试性声明标注），trust_prior——依赖浏览器原生语义，非 agent 可自证。静态前提另一半「无 onClick」依赖恒真断言（f001），单测证据无效，行为证据由 e2e 承担。
- AC-005：re_verified。4 类桌面入口均有用例并实跑全绿：PanelTitleBar 桌面态 tagName/href 断言 + 既有 onNavigate 用例、popup 桌面态 open 桥既有用例、about 桌面态新增 window.open spy 用例、EmptyState 桌面态新增 settings.open 用例；实现源码桌面分支确认。
- AC-006：re_verified（渲染部分）。`popup_view.test.tsx:410-425` web 空态断言 a + href=#setting，实跑全绿；「左键进入设置面板」依赖浏览器原生 a 锚点语义（同类链接 e2e hash 切换已证），真实点击无独立用例，属可选扩展。
- coverage = 6/6（AC-004 真实中键/Ctrl+Click、AC-006 左键原生导航部分为 trust_prior，依赖浏览器原生语义，占比低于 30%）

- 系统性 follow-up：无

verdict: FAIL
reviewed_scope: cc986c06566daa57

## Round 2 (2026-08-12 03:15 UTC+8)

## Findings

本轮无新 finding（前轮 blocker 复核见结论段）。

## 结论

- 前轮 finding 复核（以 diff 与实跑为准，不采信处置表）：
    - t311_test_f001（important，恒真 `hasAttribute("onclick")` 断言）：**已消除，真修**。6 处恒真断言全部移除（grep 当前 7 个改动测试文件无残留），替换为可失败的行为断言：点击链接断言对应 open 桥未被调——PanelTitleBar.test.tsx:70（usage.click → onNavigate 未调）、popup_view.test.tsx:404/406（agent/session link 点击 → token_stats_open/session_history_open 未调）、popup_view.test.tsx:433（空态 add_link 点击 → settings.open 未调）、settings_view_general.test.tsx:349-357（7 外链卡循环点击 → window.open spy 未调）、token_stats_header.test.tsx:383/385（usage/session link 点击 → open_tray_panel/open_history 未调）。React 19 合成事件经根委托捕获 `HTMLElement.click()` 派发的冒泡 click，若 `<a>` 误挂 onClick 会真实触发对应桥——断言可失败，语义强于原恒真断言，**非「修成另一种弱化形式」**。真实浏览器「无拦截」证据由 e2e 承担：popup_view.spec.ts:91-113 注册 onFocus 订阅者后点击会话历史链接，hash 切 `#session` + session-shell 挂载后断言 `received` 为 `[]`——若实现保留 open 桥调用会收到 `[{source:"",env:"",session_id:""}]` 而失败（t311 前该用例断言正是该对象），可失败负断言成立。独立复验：4 个单测文件 82 用例实跑全绿（本次 reviewer 重跑 `pnpm vitest run` 4 文件 2.10s 全过）。
    - t311_code_f001（important，code 轴同源恒真断言）：与上同修复面，已消除。
    - t311_code_f002（minor，about 卡片字重/圆角回归）：已消除。`about_section.tsx:122-129` card_class 只保留意图类（update/非 update 配色 + 布局/字号类），Button base 复制的 `font-semibold`/`rounded-md` 已移除（grep card_class 内无这两类；`:150` 标题 span 的 font-semibold 为意图类保留）；web `<a>` 经 `:171` `${card_class} no-underline` 不再字重回归。样式复验非测试 reviewer 主责，代码层确认。
    - t311_code_f003（minor，样式串三处重复）：已消除。`src/renderer/components/ui/icon-link.ts` 导出 `ICON_LINK_CLS`，PanelTitleBar.tsx:100、TitleBar.tsx:33、TokenStatsView.tsx:16 三文件引用（TokenStatsView 内 3 处字面量消除）。
- 改测方向复核：无「迁就实现」改测。本轮修复方向为把恒真断言替换为更强的可失败行为断言，方向与 TDD 一致。
- 本轮新发现：0 条
- 未进表的提示：
    - PanelTitleBar.test.tsx 桌面态用例 `expect(usage.hasAttribute("href")).toBe(false)`（:82 附近）：BUTTON 元素恒无 href，属冗余恒真式断言，但非 AC 证据（tagName BUTTON 已承载语义），建议删除，不阻断；
    - token_stats_header web 用例未对 Settings 链接点击断言（open_tray_panel 负断言仅覆盖 usage_link）、popup_view web 用例未对设置链接点击断言（settings.open 负断言仅覆盖空态入口）；同构渲染共享同一 `is_web()` 分支且 e2e 已覆盖设置链接左键进 `#setting`（popup_view.spec.ts:64-71），属可选扩展；
    - TokenStatsView header 与 popup「代理面板」链接点击仍无独立 e2e（Round 1 已披露，无变化）。
- 总体判断：f001 恒真断言 6 处全部替换为可失败行为断言并经单测实跑验证，AC-004 静态前提在单测（桥未调负断言）与 e2e（hash 切换 + onFocus 零分发）双层证据成立；无未解决 critical/important。

### AC 复验方式（本轮）

- AC-001/002/003/005/006：re_verified——4 单测文件 82 用例本轮独立实跑全绿（`pnpm vitest run` 4 文件，2.10s）；href/target/rel/tagName 断言 + 桌面正反行为断言（window.open 实调参数、settings.open 实调、web 桥未调负断言）。
- AC-004：静态前提部分 re_verified（unit 负向点击断言实跑全绿）；真实浏览器证据（e2e hash 切换 + onFocus 订阅收到 `[]`）本轮未起 web 服务器，trust_prior，依赖实施侧已产出并声称通过的 e2e 结果；真实中键/Ctrl+Click 新开标签页为浏览器原生语义，[deploy] trust_prior。
- coverage = 6/6；trust_prior 占比 1/6 ≤ 30%。

- 系统性 follow-up：无

verdict: PASS
reviewed_scope: 6744edb9cc0328e8

## Round 3 (2026-08-12 03:30 UTC+8)

- round：3
- reviewed_at：2026-08-12 03:40 UTC+8
  reviewed_scope: fe7fb1597585e666

指纹说明：Round 2 后变更 = code 侧 f004 修复（TokenStatsView 三处 prettier 格式 + git checkout 还原-重建 web 分支），测试断言零改动；按 `check_review_status.py` 同口径重算当前 diff 指纹为 `fe7fb1597585e666`。

### 前轮 finding 复核

t311_test_f001（important）/ code f001-f004 结论维持（Round 2/3 已核）。本轮 diff 未触碰测试断言（TokenStatsView 重建后 token_stats_header.test.tsx web 三断言仍与实现逐字对应，13/13 复跑绿）。

### 本轮新发现

无（0 条）。

### 结论（Round 3）

- 测试断言本轮零改动；全量验证沿用 Round 2（4 测试文件 82 用例全绿、全量 2936 passed / 1 存量 designmd）。
- 总体判断：无未解决 critical/important/minor，PASS。
- 系统性 follow-up：无。

verdict: PASS
