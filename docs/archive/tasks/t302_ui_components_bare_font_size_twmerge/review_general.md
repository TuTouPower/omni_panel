# Task review t302（reviewer_focus: 通用）

- task：`t302_ui_components_bare_font_size_twmerge`
- spec：`docs/tasks/t302_ui_components_bare_font_size_twmerge/spec.md`
- diff_anchor：`2e3f7322b192405b6f2489f0130bb2122135fb40`
- target：`git diff 2e3f7322b192405b6f2489f0130bb2122135fb40`
- round：1
- reviewed_at：2026-08-11 10:55 UTC+8
  reviewed_scope: 206b4d3c7af163af

## 验证范围

- diff 覆盖 62 文件（含 task.md / e2e spec / ui.test.tsx）= 59 个源码文件，与 spec 范围一致。
- 逐 hunk 复核 ui/、session-library/、session-shell/、workspace/、views/、forms/、add_account/、token-stats/ 等全部替换：均为 `text-<token>` → `text-[length:var(--text-<token>)]` 机械替换，周边类名与 cn() 字符串拼接结构完整，无嵌套错误、无漏改。
- 全量 length 形式引用 247 处（body-md 42 / body-sm 67 / label-md 104 / label-caps 13 / title-sm 13 / title-md 4 / title-lg 3 / display-num 1），逐一核对 `--text-*` var 均在 globals.css `@theme` 定义（无 `--text-label-sm`，确认 label-sm 为失效类）。
- 独立 grep（`text-(body|label|display|title|code)-` 全仓）确认除 `text-label-sm`（11 处，存量失效类）外无裸自定义字号类残留。
- `cn()` 定义 = `twMerge(clsx(...))`（`src/renderer/lib/utils.ts:4`），Input/Textarea/Select/SecretInput/PanelTitleBar 均走 cn()，AC-001 渲染断言真实触达 twMerge 合并路径。
- `pnpm test` 全量复跑：253 files passed / 1 skipped，2859 tests passed（AC-003 独立确认，与实施笔记一致）。
- `pnpm typecheck`：0 错误。
- e2e 选择器 `.text-\[length\:var\(--text-title-sm\)\]` 用真实 Chromium 验证命中 Dialog 标题 length 类，转义正确。

## Findings

### t302_gen_f001 - AC-002 门禁与 spec 字面 grep 模式的差异（label-sm 保留 + regex 白名单收窄 + 行级守卫）

- 严重度：minor
- 锚点：AC-002（「全仓 grep `text-(body|label|display|title)-` 无命中，或全部以 `text-[length:var(--text-*)]` 形式出现」未字面满足）
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx`（AC-002 测试 regex 与 `!line.includes("text-[length:")` 守卫）；保留的裸 `text-label-sm` 位点 `src/renderer/views/TokenStatsView.tsx:595,603,607,614,618,657,663,671`、`src/renderer/components/token-stats/SessionTable.tsx:246,252`、`src/renderer/components/ui/Segmented.tsx:41`
- 问题：
    - (a) spec AC-002 grep 模式字面命中保留的 11 处 `text-label-sm`。实现显式排除并登记 pending，理由为无 `--text-label-sm` token（Tailwind v4 不生成该字号类，视觉零影响）。已独立核实 globals.css `@theme` 无 `--text-label-sm`，且 label-sm 不成 CSS，无 twMerge 吞色行为影响——该排除合理，但 spec 字面要求未满足。
    - (b) 门禁 regex 白名单 `body-md|body-sm|label-md|label-caps|title-sm|title-md|title-lg|display-num` 比 spec 模式窄：未含 `code-md`（`--text-code-md` 已定义 token，当前零使用，grep 核实无裸 `text-code-md`）。若未来引入裸 `text-code-md`，门禁不拦截。
    - (c) 守卫 `!line.includes("text-[length:")` 为行级判断：同一行既有裸类又有 length 形式时整行被跳过，产生漏报可能。
    - 当前源码经独立全仓 grep 确认无裸类残留（除 label-sm），门禁**真实**通过，非恒真/空断言。
- 建议：行为无需改动。处置二选一：在 spec AC-002 注明 label-sm 为「存量失效类（无 token，Tailwind 不生成字号类）」的排除依据，或将该条目登记为「已登记遗留，接受」。门禁 regex 建议补 `code-md`、守卫改为类级匹配以消除 (c)。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（本轮为第 1 轮）
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - ListRow subtitle 用静态源码断言而非渲染断言（`ui.test.tsx`）：subtitle className 为静态字面量、不经 cn()/twMerge，源码文本即渲染 class 属性，行为等价，可接受。
    - Badge.tsx 改动（label-caps/label-md → length 形式）：Badge 的 `cn()` 内 `text-label-caps` 与 `text-[var(--color-on-primary)]` 并存，属 d032 机制适用；改动仅为字号类形式，与 t301 的 Badge 配色对齐正交、不冲突——机制范围内越界合理，非范围守住。
    - `docs/blueprint/decisions.md` 尚未补记「自定义字号类一律 `text-[length:var(--text-*)]`」为组件库约定（spec Finalization 清单项）。属收尾动作，非本 diff 缺陷。
    - `text-code-md` token 在 `@theme` 定义但源码零使用，属存量，非本 task 引入。
- 总体判断：59 文件批量类名替换机械一致、无裸类残留（除已登记 label-sm）、长度形式 var 全部指向已定义 token、AC-001 渲染断言真实触达 twMerge、AC-002 门禁真实通过、AC-003 全绿、e2e 选择器经真实浏览器验证。未发现 critical/important；仅 1 条 spec 字面对齐的 minor。
- 系统性 follow-up：无（label-sm 处置已登记 pending，非本 task 引入，无新缺口）

verdict: PASS

## Round 2 (2026-08-11 10:52 UTC+8)

reviewed_scope: 7c3755bee17b0598

### 前轮 finding 复核（以 diff 与代码为准，不采信实施笔记自述）

- **t302_gen_f001（minor）**：已修复，修复经独立负控模拟 + 实测验证。
    - (b) code-md 纳入：`bare` regex 扩为 `text-(body|label|display|title|code)-(md|sm|lg|xs|xl|num|2xl|3xl|caps)\b`。负控模拟确认裸 `text-code-md` 现被 FLAGGED（修复前不在白名单、不拦截）。
    - (c) 行级守卫消除：改为 `line.replace(length_form, "")` 先剥离 length 形式再查裸类。负控确认单 length 形式行不再漏报、纯裸类行正确捕获。token 级剥离为必要——`--text-body-md` 子串会命中 `bare` regex（`text-body-md` 无需 `text-[` 前缀），剥离后才不误报。
    - 新增 `//` 注释行跳过（`line.trimStart().startsWith("//")`）：Button.tsx:28 的 d032 说明注释含 `--text-body-md` 子串，实测被正确跳过。
    - (a) label-sm 排除保留：仍为 `!stripped.includes("text-label-sm")` 行级排除；已核实 11 处 label-sm 均为该行唯一裸类（含 SessionTable.tsx:252 尾类 `text-label-sm"`），无同线其它裸类被遮蔽；负控确认 `label-sm + length 形式` 行正确放行。
    - 实测 `ui.test.tsx` 24 tests 全绿（含 AC-001 与 AC-002）。

### 本轮新发现

- **t302_gen_f002（minor）**：AC-002 剥离未带 `/g` 标志的潜在误报。
    - 位置：`tests/unit/renderer/components/ui/ui.test.tsx`（AC-002 测试 `const stripped = line.replace(length_form, "")`）
    - 问题：`replace` 无 `/g` 只剥离首个 length 形式。若未来某行含两个 length 形式类（如 `text-[length:var(--text-body-md)] text-[length:var(--text-body-sm)]`），第二个的 `--text-body-sm` 子串会命中 `bare` regex → 误报（负控模拟 `two length forms → FLAGGED:text-body-sm`）。当前源码 0 行含双 length 形式（grep 核实），测试真实通过；误报方向比漏报安全，不阻断。
    - 建议：`line.replace(length_form, /g)` 加全局标志。

### 未进表的提示

- 无

### 总体判断

f001 三要素 (b)(c) 已真实修复，修复未引入当前生效的新问题；仅新增 1 条潜在误报方向的 minor 健壮性提示。无未解决 critical/important。

### 系统性 follow-up

- 无

verdict: PASS

## Round 3 (2026-08-11 10:54 UTC+8)

reviewed_scope: 0a0586e4a6da5f10

### 前轮 finding 复核（以 diff 与代码为准）

- **t302_gen_f002（minor）**：已修复。`length_form` regex 于 `tests/unit/renderer/components/ui/ui.test.tsx:327` 加 `/g` 标志。负控模拟验证：
    - 双 length 形式行 `text-[length:var(--text-body-md)] text-[length:var(--text-body-sm)]` 现 `ok`（修复前 FLAGGED:text-body-sm）；
    - 三 length 形式行亦 `ok`；
    - 裸 `text-code-md` / `text-body-md` 仍正确 FLAGGED（不因 `/g` 弱化检测）；
    - 单 length 形式、label-sm 排除行为不变。
    - 实测 `ui.test.tsx` 24 tests 全绿。修复消除了 f002 潜在误报，未引入新问题。

### 本轮新发现

- 无。

### 指纹变化与文档改动复核

- 指纹 `7c3755…`（Round 2）→ `0a0586…`（本轮），来源为 implementer 在 Round 2 后新增两处文档改动，均已复核：
    - `docs/blueprint/decisions.md` 增补决策 015「自定义字号类一律用 `text-[length:var(--text-*)]` 显式形式」：符合 spec Finalization 清单「如有需要补记该约定」；内容与实现一致（t298+t302 落地、p127 登记 label-sm）。
    - `docs/specs/ui_component_theme_contrast.md` 将「Button 组件字号类须用显式…」推广为「自定义字号类须用显式…（全仓 cn() 组合与 className 统一）」：与 t302 实际实施范围一致，非范围扩张。
    - 两者均为文档级、与代码改动一致、无矛盾表述，PASS 有效性不受影响。

### 未进表的提示

- 无。

### 总体判断

f001、f002 均真实修复并经独立负控 + 实测复核；文档改动（decisions.md 015 / spec 推广）为 spec 既定 Finalization 项与范围一致表述。无未解决 critical/important，无 minor。

### 系统性 follow-up

- 无

verdict: PASS

## Round 4 (2026-08-11 10:56 UTC+8)

reviewed_scope: 206b4d3c7af163af

### 复核

- 指纹 `0a0586…`（Round 3）→ `206b4d3c…`（本轮），来源为 implementer 收尾更新 `docs/specs_index.md` 单行：`ui-component-theme-contrast` 行 task 清单 `t283，t298` → `t283，t298，t302`。
- 判定：specs_index.md 为 task 收尾期维护的 spec 注册表（CLAUDE.md「task 收尾时更新」），性质同被指纹排除的 tasks_index.json；单行改动仅为把 t302 追加到已复核过的 `ui-component-theme-contrast` spec（其正文已在 Round 3 复核为范围一致）的 task 列表，机械、与实现范围一致、无矛盾、不影响任何 AC 或代码行为。属流程收尾文件，不影响 PASS 有效性。
- 实测指纹 `206b4d3c7af163af` 已稳定（无其它并发改动）。

### 本轮新发现

- 无。

### 未进表的提示

- 无。

### 总体判断

f001、f002 已在前轮复核修复；本轮仅 specs_index 收尾注册表单行追加，与实现一致、不构成 PASS 有效性问题。无未解决 critical/important，无 minor。

### 系统性 follow-up

- 无

verdict: PASS
