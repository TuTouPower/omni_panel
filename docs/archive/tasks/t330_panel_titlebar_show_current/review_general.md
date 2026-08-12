# Task review t330（reviewer_focus: 通用）

- task：`t330_panel_titlebar_show_current`
- spec：`docs/tasks/t330_panel_titlebar_show_current/spec.md`
- diff_anchor：`8423d7f26e7c17ea2715a1ab4919df64fd065bcf`
- target：`git diff 8423d7f26e7c17ea2715a1ab4919df64fd065bcf`
- round：1
- reviewed_at：2026-08-13 00:01 UTC+8

## Findings

### t330_gen_f001 - web e2e 遗留断言仍断言「当前面板按钮隐藏」，与新契约矛盾且将失败

- 严重度：important
- 锚点：AC-002（Session 面板标题栏恒定显示含自身四按钮）、AC-004（相关测试全绿：web 态与桌面态）
- 位置：`tests/e2e/web/panel_navigation.spec.ts:45`（测试标题行 34「当前面板对应互跳入口按桌面规则隐藏」）
- 问题：`panel_navigation.spec.ts:45` 在 `/#session` 上断言 `page.getByRole("link", { name: "Session面板" }).toHaveCount(0)`，即旧「当前面板按钮隐藏」语义。t330 移除 `.filter((p) => p !== panel)` 后，SessionShell（`panel="Session"`，`SessionShell.tsx:62`）在 web 态将四面板全部渲染为 `<a>` 链接（含 `Session面板`，href `#session`，`PanelTitleBar.tsx:163-175`）。该断言现在与 AC-002 直接矛盾，运行 `pnpm test:e2e:web`（Playwright web 项目）必然失败——已实测确认（Expected 0，Received 1）。注意 `pnpm test`（vitest，2988 passed）不包含 Playwright e2e，实施侧「测试全绿」声明未覆盖此文件。同行同文件 `:38`（Agent 面板上 `Agent面板` count 0）仍有效——Agent 面板走 TokenStatsView 自定义按钮组，属 t330 非范围，无需改。
- 建议：改 `panel_navigation.spec.ts:45` 为 `toHaveCount(1)`，并将测试标题（第 34 行）改为与新语义一致（如「当前面板对应互跳入口恒定显示」）；按新契约核对该测试剩余断言。

### t330_gen_f002 - AC-001/AC-002 措辞「四个面板各自标题栏均显示四按钮」与实际范围不符

- 严重度：minor
- 锚点：AC-001/AC-002 措辞 vs 范围/非范围（不改 TokenStatsView / popup TitleBar）；处置为改 spec，不计 FAIL
- 位置：`docs/tasks/t330_panel_titlebar_show_current/spec.md`（AC-001/AC-002 文本）
- 问题：契约区 AC-001/AC-002 写「四个面板（Usage/Agent/Session/Settings）各自标题栏均恒定显示四个按钮（含自身）」，但实际只有 Session（`SessionShell.tsx:62`）与 Settings（`SettingsView.tsx:424`）使用面板形态 PanelTitleBar；Usage 面板（PopupView）用自有标题栏、Agent 面板（TokenStatsView）用通用形态 title/actions 自定义按钮组，均不渲染四面板按钮，且 非范围 明确不改动。实现正确遵循 非范围（仅改 PanelTitleBar.tsx 的 filter），但 AC 文本比实际范围宽，易误导后续任务。
- 建议：将 AC-001/AC-002 措辞收窄为「面板形态标题栏（Session/Settings）各恒定显示四按钮」，并在 spec 标注 Usage/Agent 面板不在本机制内；属 spec 修订，非代码缺陷。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（round 1）
- 本轮新发现：2 条（1 important + 1 minor）
- 未进表的提示：
    - 桌面端点自身幂等性已核实：Session 自点 → `history_window_controller.open_or_focus`（`index.ts:509`），Settings 自点 → `createOrFocusSettings`（`index.ts:824-840`），均幂等聚焦；Usage 面板（PopupView）无面板形态按钮，不存在「点 Usage 按钮触发 `tray.open_panel → open_or_toggle` 隐藏面板」的路径，故 spec 风险段担心的副作用不可达。
    - web 端点自身：`use-route.ts` 监听 `hashchange`，同 hash 赋值不触发事件 → 无重渲染、无空白；页面无 `id="usage"` 等元素，无滚动副作用。
    - 范围外观察：`panel_navigation.spec.ts:38`（Agent 面板无 `Agent面板` 链接）与 popup 自有标题栏均为非范围，保持不变正确。
    - 预存死注释 `PanelTitleBar.tsx:86-87`「四面板（Settings/Session/Agent）」本就漏列 Usage，非本 task 引入，未列入 finding。
- 总体判断：核心实现（filter 移除、恒定四按钮、顺序、自身幂等）正确且单测覆盖到位；遗留 1 条 web e2e 旧语义断言未同步更新，将导致 web e2e 失败，需修复后方可合入。
- 系统性 follow-up：无（无需新建 task）。

### AC 复验方式

- AC-001（四面板各渲染四按钮含当前面板）：`re_verified`。逐面板读实现 + 单测：`PanelTitleBar.test.tsx:19-25`（Session 面板四按钮含自身）；跑 `npx vitest run tests/unit/renderer/components/PanelTitleBar.test.tsx` 14 passed。注意 Agent/Usage 非面板形态见 f002。
- AC-002（顺序固定「设置 用量 代理 会话」）：`re_verified`。`panels = ["Settings","Usage","Agent","Session"]`（`PanelTitleBar.tsx:102`）与 t313 序一致；单测 `:101-118` 对 Usage/Settings 两面板断言全四按钮顺序。
- AC-003（点击自身幂等）：`re_verified`（组件/逻辑层）。单测 `:27-34` 断言点击自身调用 `onNavigate("Usage")` 不抛错；桌面侧已读 `index.ts:509/824` open_or_focus / createOrFocusSettings 幂等聚焦。桌面 Electron 实机交互态为 `trust_prior`（依赖实施侧行为，组件层已覆盖）。
- AC-004（相关测试全绿）：`re_verified`（单测层 + 单条 web e2e 实测）——PanelTitleBar 单测 14 passed、`tsc --noEmit` exit 0、全量 `pnpm test` 2988 passed（实施侧声明）；实测跑 `MOCK_FIXTURE=synthetic playwright test --project=web -g "当前面板对应互跳入口按桌面规则隐藏"`，该 e2e 在 `panel_navigation.spec.ts:45` 失败（Expected 0，Received 1，`Session面板` 链接）——即 f001 已用执行确认，AC-004「web 态全绿」不成立。

coverage = 4 / 4（单测与单条关键 web e2e 均已实测；全量 web e2e 套件未跑，f001 表明其中该文件存在失败断言）

reviewed_scope: 2808726cd65ba464

verdict: FAIL

## Round 2 (2026-08-13 00:20 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t330_gen_f001（important）—— 已修**。`tests/e2e/web/panel_navigation.spec.ts:46` 已改为 `toHaveCount(1)`（原 :45 count 0），并附注释「t330: 取消当前面板隐藏机制，Session 面板显示自身切换按钮」；测试标题（:34）同步改为「面板切换入口恒定显示（t330 取消当前面板隐藏；Agent 面板走自定义按钮组）」。实测 `MOCK_FIXTURE=synthetic npx playwright test --config=playwright.config.ts --project=web tests/e2e/web/panel_navigation.spec.ts`：4 passed，此前失败的「面板切换入口恒定显示」用例通过。Agent 面板断言（:38 `Agent面板` count 0）保持——已核实 `TokenStatsView.tsx:862-866` 用 PanelTitleBar **actions 形态**（`actions={header_actions}` + `data-panel-titlebar="Agent"`），非面板形态，不渲染 `Agent面板` 自链，属非范围，保留正确。断言为强断言（count 1），非弱化，符合新契约 AC-002。
- **t330_gen_f002（minor）—— 已修**。`spec.md` AC-001/002 措辞收窄：AC-001「面板形态标题栏（Session/Settings，用 PanelTitleBar panel 形态）渲染全部四个切换按钮…不再隐藏当前面板按钮」；AC-002「Session/Settings 面板标题栏恒定显示四个按钮（含自身），按钮顺序固定「设置 用量 代理 会话」（t313）；Usage/Agent 面板不走 PanelTitleBar 面板形态（非范围）」。已核实与实现一致：面板形态仅 Session（`SessionShell.tsx:63 panel="Session"`）与 Settings（`SettingsView.tsx:395/406/425 panel="Settings"`）；TokenStatsView 走 actions 形态。该措辞即 f002 建议的收窄方向，契约区 drift 系 reviewer 请求的 spec 修订，非未经确认的需求变更，不判 blocking。

### 本轮新发现

0 条。

### 复核验证记录

- PanelTitleBar 实现：`PanelTitleBar.tsx:154` 由 `.filter((p) => p !== panel).map(...)` 改为 `panels.map(...)`，`panels`（:102）= `["Settings","Usage","Agent","Session"]`，web 分支 `<a>`（:167-175）、桌面分支 `<Button>`（:177-191），分支重构等价、顺序不变。
- 残留旧语义断言扫描：全仓 grep `toHaveCount(0)` / `queryBy*` 面板按钮，除 `panel_navigation.spec.ts:38`（Agent 非范围，有意保留）与 min/max/close（不相关）外，无其他遗留；electron e2e 无面板按钮计数断言。
- 全量 `npx vitest run`：258 files passed | 1 skipped，2988 tests passed | 9 skipped；`npx tsc --noEmit` exit 0；PanelTitleBar.test.tsx 14 passed。
- 新单测补充到位：`PanelTitleBar.test.tsx` 新增 AC-003 自身点击用例（:26-33），原「排除当前面板」顺序断言改为含自身四枚（:101-118 与 :121-135）。

### AC 复验方式

- AC-001（Session/Settings 面板标题栏四按钮含自身）：`re_verified`。web e2e「面板切换入口恒定显示」在 `/#session` 断言 `Session面板`/`Usage面板`/`Agent面板`/`Settings面板` 各 count 1 且实测通过；单测 `PanelTitleBar.test.tsx` 断言面板形态含自身按钮。
- AC-002（顺序固定「设置 用量 代理 会话」）：`re_verified`。`panels` 常量序一致；单测顺序断言 `["Settings面板","Usage面板","Agent面板","Session面板"]` 通过。
- AC-003（点击自身不抛错/幂等）：`re_verified`。单测「点击当前面板自身按钮调用 onNavigate 不抛错」通过；桌面幂等逻辑（open_or_focus / createOrFocusSettings）Round 1 已核实未变。
- AC-004（相关测试全绿）：`re_verified`。全量 vitest 2988 passed、panel_navigation e2e 4 passed、tsc exit 0，均本轮独立重跑。

coverage = 4 / 4

### 结论

- 前轮 finding 复核：f001 已修（diff 核实 + e2e 实测通过）、f002 已修（spec 文本与实现一致）。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：两个 Round 1 finding 均已按要求修复，spec 收窄准确，无遗留 critical / important。
- 系统性 follow-up：无。

reviewed_scope: 4ce5180cfc822fd7

verdict: PASS
