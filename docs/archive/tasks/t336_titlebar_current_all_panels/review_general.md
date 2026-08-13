# Task review t336（reviewer_focus: 通用）

- task：`t336_titlebar_current_all_panels`
- spec：`docs/tasks/t336_titlebar_current_all_panels/spec.md`
- diff_anchor：`d2a7cad8a1e16651e3688bc42f45d96c2f02c696`
- target：`git diff d2a7cad8a1e16651e3688bc42f45d96c2f02c696`
- round：1
- reviewed_at：2026-08-13 03:45 UTC+8

## Findings

### t336_gen_f001 - token_stats_header 新断言触发 unbound-method lint error，破坏 pnpm lint/check 门禁

- 严重度：minor
- 锚点：AC-004 补测（断言本身有效，无 AC 缺口）
- 位置：`tests/unit/renderer/views/token_stats_header.test.tsx:363`
- 问题：新增 `expect(window.usageboard.tokenStats.open).toHaveBeenCalled();` 直接在 `as unknown as typeof window.usageboard` 强转对象上取方法。TS 将 `tokenStats.open` 视为真实桥方法（带 `this`），触发 `@typescript-eslint/unbound-method`，`npx eslint ... --max-warnings=0` 实测报 1 error，`pnpm lint` 与 `pnpm check` 门禁会失败。断言本身有效且已通过（点击 Agent 自身按钮 → navigate("Agent") → tokenStats.open），非假断言。
- 建议：与同文件其余断言一致，在 mock 中抽局部 `const open_agent = vi.fn();`，用 `expect(open_agent).toHaveBeenCalled();`。改动仅测试局部，行为不变。

### t336_gen_f002 - TitleBar 新用量 `<a>` 行超 printWidth，破坏 pnpm format:check

- 严重度：minor
- 锚点：AC-002 实现（渲染正确，仅格式）
- 位置：`src/renderer/views/popup-view/TitleBar.tsx:82`
- 问题：新增 `{is_web() ? (<a className={ICON_LINK_CLS} title="用量面板" aria-label="用量面板" href="#usage">` 单行超过仓库 `.prettierrc` printWidth=100；`npx prettier --check` 实测 WARN，`pnpm format:check` 门禁失败（HEAD 版该文件通过，确认系本次引入）。
- 建议：对改动文件跑 `prettier --write`（该 `<a>` 拆多行）。

### t336_gen_f003 - popup_view 按钮序断言数组可单行，prettier 需折叠，破坏 format:check

- 严重度：minor
- 锚点：AC-002 断言（断言有效，仅格式）
- 位置：`tests/unit/renderer/views/popup_view.test.tsx:351-357`
- 问题：5 元素数组字面量折叠后 <100 字符，prettier 期望单行；实测 WARN，HEAD 版通过，系本次引入。
- 建议：`prettier --write`。

### t336_gen_f004 - token_stats_header 注释被并入 expect 行，破坏 format:check

- 严重度：minor
- 锚点：无 AC 违反（纯格式）
- 位置：`tests/unit/renderer/views/token_stats_header.test.tsx:394`
- 问题：原独立注释行 `// 刷新按钮与四个下拉保持原控件形态。` 被并入上一行 `expect(open_history).not.toHaveBeenCalled();` 尾部（多余空格），prettier 需归一；实测 WARN，HEAD 版通过，系本次引入。
- 建议：`prettier --write`（注释恢复独立行）。

### t336_gen_f005 - panel_navigation.spec 文件头注释过期，与新增 AC-003 断言矛盾

- 严重度：minor
- 锚点：AC-003 测试（行为正确，文档不一致）
- 位置：`tests/e2e/web/panel_navigation.spec.ts:5-8`
- 问题：文件头注释仍写「用量面板（PopupView）无标题栏（与桌面一致，托盘面板不承载互跳），故不回跳 agent」；本 diff 新增 AC-003 测试（:56-64）断言 `[data-testid=popup-titlebar]` 可见且含 4 枚链接，直接与之矛盾。注释系历史遗留，但被本 diff 的测试做实为错误。
- 建议：更新文件头注释，说明 usage 面板标题栏含 4 面板链接（含用量自身），e2e 互跳链不回跳 agent 仅为链覆盖边界。

## 结论

- 本轮新发现：5 条（均 minor，非阻断）
- 未进表的提示：
    - 全量 `pnpm test` 首轮 2989 passed / 1 failed，重跑 exit=0（2990 passed / 9 skipped）。首轮失败测试详情被截断未定位到；失败不在 t336 改动的 3 个测试文件（定向跑 55/55 稳定通过），判断为既有环境/时序 flaky，非本次回归。建议留意，若复现再建 task。
    - 无死代码/未用 import 引入（diff 仅用已有 is_web/ICON_LINK_CLS/navigate/window.usageboard，未新增 import）；TokenStatsView 新增 Agent 自身按钮顺序 Settings/Usage/Agent/Session 正确，icon=chart，web `<a href="#agent">`、桌面 `navigate("Agent")`→`tokenStats.open()` 与 panel-navigation.ts:12-14 映射一致；TitleBar 用量自身按钮位置 刷新/用量/设置/代理/会话 正确，icon=clock_forward，web `<a href="#usage">`、桌面 `tray.open_panel()`（与 use_panel_navigation "Usage" 分支一致）。t313 固定序、web 互跳 href、Settings 无刷新（PanelTitleBar 未动）均保持。
- 总体判断：实现与测试符合 spec 契约区 4 条 AC，行为正确、断言有效；无 critical/important。5 条 minor 均为格式/文档/局部 lint，但会拉红 `pnpm check`（lint + format:check），建议 implementer 处置阶段一并修复。
- AC 复验方式：
    - AC-001：`re_verified`——单测 `token_stats_header.test.tsx` AC-001 单行容器含 agentBtn（:152）、AC-004 点击断言 `tokenStats.open`（:363）；源码 `TokenStatsView.tsx:833-850`；e2e agent 面板链接 count=1。
    - AC-002：`re_verified`——单测 `popup_view.test.tsx:351-357` 按钮序 刷新/用量/设置/代理/会话、web 链接 href=#usage（:394-396）；源码 `TitleBar.tsx:81-98`。
    - AC-003：`re_verified`——e2e agent（:41-44）/session（:49-53）/usage（:60-63）各面板 4 链接恒定 + `PanelTitleBar.test.tsx`「设置面板四按钮恒在且刷新恒不渲染」（:110-117）钉住「仅设置无刷新」。
    - AC-004：`re_verified`——定向 3 文件 55 passed、web e2e 5 passed、全量重跑 2990 passed；typecheck 无错。
    - coverage = 4 / 4
- 系统性 follow-up：无

reviewed_scope: 490a023b96985584

verdict: PASS

## Round 2 (2026-08-13 03:50 UTC+8)

### 前轮 finding 复核（以 `git diff HEAD` 为准）

| finding_id    | 前轮状态 | 复核结论 | 证据                                                                                                                                                                                                                                                                             |
| ------------- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| t336_gen_f001 | minor    | 已修     | `tests/unit/renderer/views/token_stats_header.test.tsx:95` 新增 `const open_token_stats = vi.fn();`，`:114` `open: open_token_stats`，`:363` 改 `expect(open_token_stats).toHaveBeenCalled();`。t336 涉及 5 文件 `eslint --max-warnings=0` 实测 0 error（unbound-method 消除）。 |
| t336_gen_f002 | minor    | 已修     | `src/renderer/views/popup-view/TitleBar.tsx:82-87` `<a>` 拆多行，`prettier --check` 实测 5 文件全过。                                                                                                                                                                            |
| t336_gen_f003 | minor    | 已修     | `tests/unit/renderer/views/popup_view.test.tsx:351` 数组折叠单行，prettier 过。                                                                                                                                                                                                  |
| t336_gen_f004 | minor    | 已修     | `tests/unit/renderer/views/token_stats_header.test.tsx:394` 注释归位，prettier 过。                                                                                                                                                                                              |
| t336_gen_f005 | minor    | 已修     | `tests/e2e/web/panel_navigation.spec.ts:5-8` 文件头注释改为「用量面板（PopupView TitleBar）t336 起也承载自身『用量面板』按钮与互跳」，与新增 AC-003 断言一致。                                                                                                                   |

### 本轮复核

- 修复未引入新问题：TitleBar `<a>` 拆分仅 JSX 换行（语义不变）；token_stats_header 改动仅 spy 命名 + 注释。
- 复验命令（re_verified）：
    - `eslint`（5 改动文件）0 error
    - `prettier --check`（5 改动文件）clean
    - 定向单测 3 文件 55 passed
    - web e2e panel_navigation 5 passed
    - `check_review_status.py --task-dir docs/tasks/t336_titlebar_current_all_panels`：`general_verdict=PASS`、`review_scope=ok`
- 本轮新发现：0 条
- 未进表的提示：无
- AC 复验：AC-001~004 均 `re_verified`，证据沿用 Round 1（实现与断言未变），本轮复核确认无回归。
- 系统性 follow-up：无

reviewed_scope: 677834e32f535bad

verdict: PASS
