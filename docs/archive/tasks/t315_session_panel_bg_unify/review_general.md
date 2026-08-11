# Task review t315（reviewer_focus: 通用）

- task：`t315_session_panel_bg_unify`
- spec：`docs/tasks/t315_session_panel_bg_unify/spec.md`
- diff_anchor：`0373cbc6eac0a255d2acc873f95dc890a45820e2`
- target：`git diff 0373cbc6eac0a255d2acc873f95dc890a45820e2`
- round：1
- reviewed_at：2026-08-12 01:06 UTC+8

## Findings

### t315_gen_f001 - SessionPane 头部操作按钮 hover 背景在 raised 底色上不可见（明暗双主题）

- 严重度：minor
- 锚点：行为缺陷（视觉回归，非 AC 违反）
- 位置：`src/renderer/components/workspace/SessionPane.tsx:113`（pane 底色 `bg-[var(--color-surface-raised)]`）；`SessionPane.tsx:149/158/167/176/185`（`conversation-action` 按钮 `hover:bg-[var(--color-surface-raised)]`）
- 问题：本 diff 把 pane 底色从 surface-window 改为 surface-raised 后，头部 5 个 action 按钮（大纲/全选/清空/聚焦/关闭）hover 背景仍为 surface-raised——raised-on-raised，明暗双主题下 hover 均无背景高亮，仅剩 muted→variant 的浅文字色变化。改造前 pane 为 window 底、raised hover 可见，属本 diff 直接引入的回归。
- 建议：头部 action hover 改用与 pane 底色可辨的混合色（如 SessionRow 已采用的 `hover:bg-[color-mix(in_srgb,var(--color-surface-raised)_88%,var(--color-on-surface))]`）。

### t315_gen_f002 - 消息区行内代码片背景与 pane 新底色同色，代码块区分丢失

- 严重度：minor
- 锚点：行为缺陷（视觉回归）
- 位置：`src/renderer/components/workspace/MarkdownMessage.tsx:47`（行内 `code` 用 `bg-[var(--color-surface-raised)]`）+ `SessionPane.tsx:113`（pane 底色改 raised）
- 问题：工作台消息区内 Markdown 行内代码片背景为 surface-raised，与 pane 新底色同色，明暗双主题下代码片不再与正文可辨（改造前 pane 为 window 底、raised 代码片可见）。会话库预览（SessionPreview，window 底）不受影响。
- 建议：行内代码片改用 surface-window/surface-card 或其它与 raised 可辨的 token；或列入后续样式微调。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - light 下根白 #ffffff 与卡片 raised #f1f4f9 对比度约 1.08:1，靠 outline 边框维持边界，可辨性偏弱；token 值来自 DESIGN.md 且为 spec 明示选项（surface-raised），像素级视觉一致已声明有意不测，不作 finding。
    - SessionRail 侧栏保留 `bg-surface`（light #e7eaf1 / dark #0c0e13）未随根背景改 window：属刻意两级对比。AC-001「不再整屏灰底」指根容器，rail 不违反任何 AC；灰侧栏在白根上视觉成立，建议合并前人工确认 dark 下侧栏与窗口层次符合预期。
    - designmd drift 门禁（tests/unit/main/scripts/designmd.test.ts）失败为存量问题（本 diff 未触及 globals.css / DESIGN.md，锚点提交即存在），非本 diff 引入。
- 总体判断：AC 全部实现，测试触达可观察行为且全绿；2 条 minor 视觉回归不阻断。
- 系统性 follow-up：无

### AC 复验披露

- AC-001（re_verified）：源码核验 SessionShell 根/顶栏 surface-window（SessionShell.tsx:20-21）+ SessionShell.test.tsx:195-208 断言 + e2e computed 根背景断言（web 10/10 通过）。
- AC-002（re_verified）：4 个单测文件新增断言全绿（90/90）+ e2e computed 断言 `pane_bg !== shell_bg`、`card_bg !== library_bg`（两色可辨）。
- AC-003（re_verified，light 侧）：WorkspaceView.test.tsx 断言网格 `gap-px`/`bg-outline`/`p-px` 保留 + e2e computed 两色；dark 像素观感依赖 token 翻转机制（globals.css `data-theme` 覆盖为通用既有机制），未在 dark 下实际渲染验证。
- AC-004（re_verified）：4 个相关单测文件 90/90 通过；web e2e session_panel.spec.ts 10/10 通过（含新增 t315 用例）；typecheck、eslint 干净。designmd drift 为存量失败，非本 diff 引入。
- coverage = 4 / 4（AC-003 dark 像素观感部分为 trust_prior，依赖 globals.css 既有 token 翻转机制）

reviewed_scope: 46ffe6d3fc3fcc4f

verdict: PASS

## Round 2 (2026-08-12 01:20 UTC+8)

## Findings

### t315_gen_f003 - f002 修不彻底：行内 code 改 field-bg 后与 pane raised 底仍不可辨（明暗双主题）

- 严重度：minor
- 锚点：行为缺陷（f002 视觉回归未消除）
- 位置：`src/renderer/components/workspace/MarkdownMessage.tsx:47`（code `bg-[var(--color-field-bg)]`）+ `SessionPane.tsx:113`（pane 底 `bg-[var(--color-surface-raised)]`）
- 问题：行内 code 背景由 surface-raised 改为 field-bg，但衬底（pane 新底色 raised）未变。token 实值（globals.css）：light 下 raised #f1f4f9 vs field-bg #f6f8fb 对比 ≈1.04:1、dark 下 #262b34 vs #20242c ≈1.09:1，均低于可辨阈值；行内 code 无边框，可辨性完全依赖 bg 差。f002「代码片与正文可辨」目标未达成，仅从完全同色变为近似同色（pre 块同用 field-bg 但有 outline 边框兜底，不受此判影响）。
- 建议：行内 code 加细边框（`border border-[var(--color-outline)]`）或改用与 raised 更可辨的 token；与 f004 的 th 一并统一处理。

### t315_gen_f004 - 表格表头 th bg=surface-raised 与 pane raised 底同色（Round 1 遗漏的同源回归）

- 严重度：minor
- 锚点：行为缺陷（视觉回归，与 f002 同源）
- 位置：`src/renderer/components/workspace/MarkdownMessage.tsx:39`
- 问题：th 表头背景 surface-raised，t315 将 pane 底色改为 raised 后同色（改造前 pane 为 window 底、th raised 可见）。表头与表体仅靠 outline 边框与字重区分，th 的 bg 高亮失效。消息表格透传 pane raised 底（PaneMessageRow 无背景、`conversation-message-scroll` 无背景类）。
- 建议：th 改 field-bg 或与 f003 行内 code 统一方案。

## 结论

- 前轮 finding 复核：
    - f001：已消除。diff 证实 6 处 hover 已改 `color-mix(in_srgb, var(--color-surface-raised) 88%, var(--color-on-surface))`（SessionPane.tsx:149/158/167/176/185/279），与 SessionRow.tsx:33 既有模式完全一致；light 混合色 ≈#d8dce2（vs raised ≈1.25:1）、dark ≈#3d424b（vs raised ≈1.41:1），明暗均可见，且不再 raised-on-raised。
    - f002：修不彻底。改 field-bg 方向对，但该 token 与 raised 在明暗双主题下仍近同色，行内 code 无边框辅助，问题实质未消除（详见 f003）。
- 本轮新发现：2 条（f003、f004，均 minor）
- 未进表的提示：
    - field-bg 是表单输入语义 token（Input/Select/Textarea 共用），用于行内代码片语义略偏，属风格问题，不单独出 finding。
    - 本轮重跑 SessionPane/MarkdownMessage/SessionShell 单测 29/29 通过（与 implementer 自述一致）；typecheck/lint 未重跑（改动仅 className 字符串，vitest 编译已覆盖）。
    - SessionPane 已无其它 `hover:bg-surface-raised` 残留（grep 全文件确认）。
- 总体判断：f001 修复到位；f002 修不彻底但为视觉级 minor，不违反任何 AC（AC-002 两色可辨已由 e2e 断言 card≠library 覆盖）。无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验披露

- AC-001 / AC-002 / AC-004（re_verified）：Round 1 复验结论不变；本轮修复仅涉及样式字符串，已重跑 3 个相关单测文件 29/29 通过。
- AC-003（re_verified，light 侧 / trust_prior，dark 像素观感）：同 Round 1，dark 依赖 globals.css 既有 token 翻转机制，未实际渲染验证。
- coverage = 4 / 4

reviewed_scope: 1fff8cb3a8e3aabe

verdict: PASS

## Round 3 (2026-08-12 01:30 UTC+8)

## Findings

### t315_gen_f005 - pre 代码块内 code 新增 outline 内框（f003 修复波及块级 code，双框嵌套）

- 严重度：minor
- 锚点：行为缺陷（视觉瑕疵，本轮修复引入）
- 位置：`src/renderer/components/workspace/MarkdownMessage.tsx:47`（code 新增 `border`）+ `MarkdownMessage.tsx:52`（pre `[&_code]` 未覆盖 border）
- 问题：react-markdown fenced code block 渲染 `pre > code`，两组件共用本文件 `code`/`pre` 自定义组件。本轮给 code（47 行）加 `border border-[var(--color-outline)]` 后，pre 块内 code 也带上边框；而 pre 的 `[&_code]:bg-transparent [&_code]:p-0`（52 行）只覆盖 bg/padding，未覆盖 border。结果 pre 代码块（自身已有 `border outline`）内部围绕代码内容出现第二个 1px outline 内框（明暗双主题均可见：light outline #e6eaf1、dark #2a2f3a），距文字约 5px（`px-[5px]` 生效）。修复前 code 无 border，pre 块为单框；本轮统一在 code 组件加边框的设计未区分行内/块级场景。
- 建议：pre 的 `[&_code]` 选择器追加 `border-0`（与既有 `bg-transparent`/`p-0` 并列），行内 code 保留边框。

## 结论

- 前轮 finding 复核（以 diff 为准）：
    - f001：维持 Round 2 结论（已消除）。本轮未再改动 SessionPane hover，6 处 `color-mix` 仍与 SessionRow 既有模式一致。
    - f003：已消除。`MarkdownMessage.tsx:47` 行内 code 现为 `bg-[var(--color-field-bg)] + border border-[var(--color-outline)]`，与 f003 建议（加细边框兜底）完全一致；行内 code 在 pane raised 底上由边框提供明确边界，不再依赖近同色的 bg 差。修复副作用即 f005（块级 code 波及），但不构成「修不彻底」。
    - f004：已消除。`MarkdownMessage.tsx:39` th bg 由 surface-raised 改为 field-bg，按 f004 建议路径执行；th 原有 `border outline` 兜底，表头与表体区分由边框+字重维持，与行内 code 方案统一。
- 本轮新发现：1 条（f005，minor）
- 未进表的提示：
    - th（field-bg）与 td（透 pane raised 底）底色仍近同色，属 f004 建议路径的已知结果，表头靠边框+字重可辨，不重复出 finding。
    - 本轮重跑 MarkdownMessage/SessionPane 单测 20/20 通过（与 implementer 自述一致）；lint/typecheck 未重跑（改动仅 className 字符串，vitest 编译已覆盖，同 Round 2 判断）。
- 总体判断：f003/f004 均按建议路径真修（diff 证实）；f005 为本轮新增 minor 视觉瑕疵。无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验披露

- AC-001 / AC-002 / AC-004（re_verified）：Round 1/2 复验结论不变；本轮修复仅涉 MarkdownMessage 样式字符串，已重跑 2 个相关单测文件 20/20 通过。
- AC-003（re_verified，light 侧 / trust_prior，dark 像素观感）：同前两轮，dark 依赖 globals.css 既有 token 翻转机制，未实际渲染验证。
- coverage = 4 / 4

reviewed_scope: 928a26b29a5a4cba

verdict: PASS

## Round 4 (2026-08-12 01:40 UTC+8)

## Findings

本轮无新 finding（f005 复核为真修，见结论）。

## 结论

- 前轮 finding 复核（以 diff 为准）：
    - f005：已消除（真修）。diff 证实 `MarkdownMessage.tsx:52` pre 的 `[&_code]` 追加 `border-0`，与既有 `bg-transparent`/`p-0` 并列。机制核验：Tailwind 任意变体生成 `.\[\&_code\]\:border-0 code { border-width: 0 }`，特异性 (0,1,1) > code 自身 `.border` (0,1,0)，且与同文件自 t274 起生效的 `bg-transparent`/`p-0` 覆盖模式完全一致，pre 块内 code 边框确定移除；行内 code 不在 pre 内，保留 border+field-bg。react-markdown fenced block 渲染 `pre > code`，pre 内不存在其它 inline code 可被误伤。pre 块回到 f003 前状态（单外框、透明底、无内边距），双框嵌套消除，无修复副作用。
    - f001 / f003 / f004：维持 Round 3 结论（已消除）。本轮 diff 未再触及 SessionPane hover、SessionRow、th、行内 code（其余源文件 mtime 均在 Round 3 前，自 Round 3 后仅 MarkdownMessage.tsx 变更）。
- 本轮新发现：0 条
- 未进表的提示：
    - 编译产物本地不可直接核验（out/renderer 无构建输出、node_modules/.vite 仅有 vitest 缓存）：`[&_code]:border-0` 的 CSS 生成按 Tailwind 标准机制核验（与同文件既有 `[&_code]:bg-transparent`/`p-0` 同模式，该模式此前已生效），未实跑 Tailwind 编译确认生成规则；合并前可人工抽查 pre 代码块渲染为单框。
    - 本机 stat mtime 与报告轮次时间存在偏差（review_general.md mtime 显示早于内容中 Round 3 时间戳），判断为 WSL 文件系统时钟/缓存问题，审查结论以 diff 内容为准。
    - 本轮实跑 MarkdownMessage 6/6 + SessionPane 14/14 = 20/20 通过（与 implementer 自述一致）；lint/typecheck 未重跑（改动仅 className 字符串，vitest 编译已覆盖，同前轮判断）。
- 总体判断：f005 按建议路径真修且未引入新问题（仅 pre 一行）；无未解决 critical/important。
- 系统性 follow-up：无

### AC 复验披露

- AC-001 / AC-002 / AC-004（re_verified）：Round 1-3 复验结论不变；本轮修复仅涉 MarkdownMessage 一行 className 字符串，已重跑 MarkdownMessage/SessionPane 单测 20/20 通过。
- AC-003（re_verified，light 侧 / trust_prior，dark 像素观感）：同前轮，dark 依赖 globals.css 既有 token 翻转机制，未实际渲染验证。
- coverage = 4 / 4

reviewed_scope: 23313e5ca4339b3b

verdict: PASS
