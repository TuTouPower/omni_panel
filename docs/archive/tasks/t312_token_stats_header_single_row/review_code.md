# Task review t312（reviewer_focus: 代码）

- task：`t312_token_stats_header_single_row`
- spec：`docs/tasks/t312_token_stats_header_single_row/spec.md`
- diff_anchor：`e2039aacd962f382f294ea4abc6fb98bb5029d7e`
- target：`git diff e2039aacd962f382f294ea4abc6fb98bb5029d7e`
- round：1
- reviewed_at：2026-08-11 21:58 UTC+8

## Findings

### t312_code_f001 - spec 契约区平台选项「Win」过时，实现为 Local（t308 重构残留）

- 严重度：minor
- 锚点：spec 契约区「范围」第 2 条；spec 过时（实现合理，不计 FAIL）
- 位置：`src/renderer/views/TokenStatsView.tsx:42-46`（PLATFORM_OPTIONS）
- 问题：spec 写「平台筛选（PLATFORM_OPTIONS：全平台/Win/WSL）」，实现为 `all/全平台`、`local/Local`、`wsl/WSL`。`TokenStatsEnv` 类型为 `z.enum(["local", "wsl"])`（`src/shared/types/token-stats.ts:6,167`），无 `win` 枚举；t308 已做 win→local 重构，改造前 HEAD 版本（`git show e2039aac:...TokenStatsView.tsx:39-43`）选项即为 Local。实现与类型定义及改造前行为一致，spec 文字为残留。
- 建议：处置为同步 spec 契约区文字（全平台/Local/WSL），不要求改代码。

### t312_code_f002 - 窗口控制按钮与 PanelTitleBar 面板形态 verbatim 重复

- 严重度：minor
- 锚点：代码质量 DRY；行为缺陷：无（当前行为一致，仅重复）
- 位置：`src/renderer/views/TokenStatsView.tsx:827-866` vs `src/renderer/components/ui/PanelTitleBar.tsx:110-152`
- 问题：改造前面板形态 PanelTitleBar 自带窗口控制（最小化/最大化/关闭 + `!is_web()` 条件 + `window.usageboard.window.*`）；改造为通用 title/actions 形态后，TokenStatsView 将这三按钮连同 is_web 判断、icon、aria-label 共约 26 行 verbatim 复制进 header_actions。当前行为与改造前一致（Agent 面板关闭=window.close；刷新按钮原 is_live 默认 true，无行为差异），但后续 PanelTitleBar 窗口控制演进（如 Usage onClose 覆盖模式推广、新增窗口行为）不会同步到本处，存在修复遗漏风险。
- 建议：将窗口控制按钮组抽为 PanelTitleBar 导出的公共子组件（面板形态与通用形态共用），或由通用形态提供受控的窗口控制 slots，消除重复。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件过大（降级规则，不进 finding 表）：`src/renderer/views/TokenStatsView.tsx` 1074 行（>800 important 阈值，本 task 净增约 316 行，主要来自 header_title/header_actions 两块 JSX）；`tests/unit/renderer/views/token_stats_view.test.tsx` 1034 行（>600 minor 阈值，本 task 净增 27 行）。
    - 导航按钮顺序：改造前面板形态为 Usage→Session→Settings（PanelTitleBar panels 数组过滤），改造后为 Settings→Usage→Session，与 spec 契约区范围描述顺序（刷新/设置/用量面板/会话历史）一致，按 spec 为准，不另出 finding。
    - RangePicker 组件内「📅 自定义」按钮与时间范围下拉「自定义」项双入口并存：spec 非范围「不改 RangePicker 组件本身」约束下的自然结果，非缺陷。
- AC 复验方式：
    - AC-001：`re_verified`。代码结构 TokenStatsView.tsx:651-876（单行 PanelTitleBar title/actions 含 logo/标题/刷新时间/四 Select/四按钮），断言见 tests/unit/renderer/views/token_stats_header.test.tsx:135-201。
    - AC-002：`re_verified`。测试断言 get_dashboard 实参 agent:"claude-code"/platform:"wsl"（token_stats_header.test.tsx:220-244）。
    - AC-003：`re_verified`。7d 断言窗口 7×24h 且 gran=day（:246-260）；自定义 fireEvent.change 弹出真实 RangePicker、应用后查询且下拉保持 custom（:262-281）。
    - AC-004：`re_verified`。navigate 映射 panel-navigation.ts:6-23（Settings→settings.open、Usage→tray.open_panel、Session→sessionHistory.open），测试断言三 mock 被调（:283-305）；刷新按钮触发重查。
    - AC-005：`re_verified`。重跑 `npx vitest run tests/unit/renderer/views/token_stats_header.test.tsx tests/unit/renderer/views/token_stats_view.test.tsx`：42 passed（9+33）。
    - coverage = 5 / 5
- 总体判断：实现完整覆盖 AC-001~005，查询逻辑/save_prefs/其他面板未动，RangePicker 受控改造向后兼容；无未解决 critical / important，仅 2 条 minor（1 条 spec 过时文字处置）。
- 系统性 follow-up：无

reviewed_scope: 0b1e647840714af2

verdict: PASS

## Round 2 (2026-08-11 21:45 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t312_code_f001（spec 平台选项文字过时，minor）——已消除。** `git diff e2039aac` 确认 `docs/tasks/t312_token_stats_header_single_row/spec.md` 契约区「范围」第 2 条已改为「平台筛选（PLATFORM_OPTIONS：全平台/Local/WSL——t308 后 env 枚举为 local|wsl）」，与实现 `PLATFORM_OPTIONS`（`all`/`local`/`wsl`）及 `TokenStatsEnv = z.enum(["local","wsl"])` 一致。按原建议处置为改 spec，实现侧无需改动。
- **t312_code_f002（窗口控制按钮 verbatim 重复，minor）——已消除。** diff 确认四处证据：
    - `src/renderer/components/ui/PanelTitleBar.tsx:35-80` 新增导出 `WindowControls({ onClose? })`：is_web 自守卫（web 返回 null）、onClose 覆盖、缺省 `window.usageboard.window.close()`；
    - 面板形态原 ~26 行按钮块替换为 `{!is_web() && (onClose ? <WindowControls onClose={onClose}/> : <WindowControls />)}`（:162-167）；
    - `src/renderer/views/TokenStatsView.tsx:826` header_actions 使用 `<WindowControls />`，TokenStatsView 中 `is_web` 已无引用（grep 无命中）；
    - `src/renderer/components/ui/index.ts` 导出 `WindowControls`。
    - 行为核对：三处调用点（SessionShell `panel="Session"`、SettingsView `panel="Settings"`、TokenStatsView 通用形态）关闭按钮均保持改造前语义（无 onClose → `window.close`），无回归。

### 本轮新发现

### t312_code_f003 - f002 修复引入冗余三元与双层 is_web 守卫

- 严重度：minor
- 锚点：代码质量（DRY/控制流冗余）；行为缺陷：无（两分支渲染与缺省 onClick 语义完全等价，已验证）
- 位置：`src/renderer/components/ui/PanelTitleBar.tsx:162-167`
- 问题：f002 修复把面板形态按钮块替换为 `{!is_web() && (onClose ? <WindowControls onClose={onClose} /> : <WindowControls />)}`。`WindowControls` 已内置 `if (is_web()) return null`（:36）且 `onClose` 可选、内部以 `onClose ?? (() => window.usageboard.window.close())` 回退，故外层 `!is_web()` 守卫与 `onClose ? A : B` 三元均冗余：整个表达式可径直写作 `<WindowControls onClose={onClose} />`。无行为差异，属修复未收干净的冗余（非缺陷）。
- 建议：化简为 `<WindowControls onClose={onClose} />`，删除外层 `!is_web()` 与三元。

## 结论

- 前轮 finding 复核：t312_code_f001 已消除（spec 契约区文字同步）；t312_code_f002 已消除（WindowControls 抽取并双形态共用）。均以 diff 核实，未采信处置表自称。测试侧 t312_test_f001/f002 属 test reviewer 轴，本报告仅信息性核对：diff 形态（刷新测试拆事件 pending/reject 两确定路径、30d 挂载用例、SessionTable mock 反映 `rows[0].session_id`）与处置描述一致，正式复核待 review_test.md Round 2。
- 本轮新发现：1 条（t312_code_f003，minor）
- 未进表的提示：
    - 文件过大（降级规则，不进 finding 表）：`src/renderer/views/TokenStatsView.tsx` 1034 行（>800 important 阈值；自 anchor 942 行净增 92 行，f002 修复后较 Round 1 的 1074 行减少 40 行）；`tests/unit/renderer/views/token_stats_view.test.tsx` 1034 行（>600 minor 阈值，anchor 1033 行，净增 1 行）。其余触及文件（PanelTitleBar 179 行、RangePicker 139 行、token_stats_header.test.tsx 364 行）均未超阈值。
    - 全量 `vitest run`：2912 passed / 1 failed / 9 skipped，唯一失败为存量 `tests/unit/main/scripts/designmd.test.ts:129` drift 门禁（t312 未动 DESIGN.md/globals.css，与本次 diff 无关）；typecheck 0 error、eslint（涉及 6 文件）0 warning。
- AC 复验方式（Round 2）：
    - AC-001：`re_verified`。重跑 `tests/unit/renderer/views/token_stats_header.test.tsx`（12/12 通过），含标题栏单行、四 Select、四按钮、刷新中标记在标题栏内断言（:137-204）；代码核对 TokenStatsView.tsx:650-831。
    - AC-002：`re_verified`。工具/平台下拉选择断言 get_dashboard 实参 `agent:"claude-code"`/`platform:"wsl"`（header 测试 :223-247 + view 测试 10 处 selectOptions 适配）。
    - AC-003：`re_verified`。7d 窗口 7×24h + gran day（header :249-263）；30d 挂载默认窗口 + 下拉值「30d」（:265-275）；自定义弹出真实 RangePicker、应用后查询且下拉保持 custom（:277-296）。
    - AC-004：`re_verified`。导航三 mock 断言（:350-363）；刷新按钮 fresh 缓存不重复请求 / 事件重取 reject 后点刷新重新请求上屏两确定路径（:298-348）。
    - AC-005：`re_verified`。重跑全量 vitest：2912 passed，唯一失败为与 t312 无关的存量 designmd drift。
    - coverage = 5 / 5
- 总体判断：前轮 2 条 minor 均真修（f001 改 spec、f002 抽组件），无未解决 critical / important；本轮 1 条新 minor（冗余三元，非阻断），不影响验收。
- 系统性 follow-up：无

reviewed_scope: 1b70c897e5bb3a9e

verdict: PASS

## Round 3 (2026-08-11 21:55 UTC+8)

### 前轮 finding 复核（以 diff 为准）

- **t312_code_f003（f002 修复留下冗余三元 + 双层 is_web 守卫，minor）——已消除。** `git diff e2039aac` 确认 `src/renderer/components/ui/PanelTitleBar.tsx:166` 面板形态现为 `<WindowControls onClose={onClose} />`，外层 `!is_web()` 守卫与 `onClose ? <WindowControls onClose={onClose} /> : <WindowControls />` 三元均已删除。WindowControls 内置守卫与回退齐全：`if (is_web()) return null`（:40）、`onClose ?? (() => window.usageboard.window.close())`（:73-78），修复前后行为等价——web 模式不渲染（`PanelTitleBar.test.tsx`「web 模式不渲染窗口控制按钮」通过）、缺省关闭语义保留（SessionShell/SettingsView/TokenStatsView 三调用点均无 onClose → `window.close`）。props 类型显式 `onClose?: (() => void) | undefined`（:38）：tsconfig `exactOptionalPropertyTypes: true` 下，PanelTitleBar 自身可选 `onClose` 解构后类型含 `undefined`，传透至 WindowControls 必须显式声明 `| undefined`，typecheck 0 error 证实该声明必要而非冗余。

### 本轮新发现

无（0 条）。

### 修复引入问题扫描

- 无死代码：PanelTitleBar.tsx 的 `is_web` import 仍被 WindowControls 使用（:40）；TokenStatsView 无 `is_web` 残留引用，窗口控制由 `<WindowControls />`（:826）统一。
- 全量复验：`npx vitest run` 2912 passed / 1 failed / 9 skipped，唯一失败为存量 `tests/unit/main/scripts/designmd.test.ts` AC5 drift 门禁（t312 未触及 DESIGN.md/globals.css，与本次 diff 无关，与 Round 2 同）；标题栏相关 3 文件（PanelTitleBar.test.tsx 6 + token_stats_header.test.tsx 12 + token_stats_view.test.tsx 33）51 passed；`tsc --noEmit` 0 error；eslint 涉及文件 0 warning。

## 结论

- 前轮 finding 复核：t312_code_f001 已消除（spec 契约区文字同步，Round 2 已核）；t312_code_f002 已消除（WindowControls 抽取并双形态共用，Round 2 已核）；t312_code_f003 已消除（本轮 diff 核实：三元与双层守卫删除、props 类型补 `| undefined`）。
- 本轮新发现：0 条
- 未进表的提示：
    - 源码注释引用审查编号：`PanelTitleBar.tsx:32` 注释含「t312_code_f002」，为 f002 修复遗留的流程溯源标记，非本轮新增；审查完结后该编号对源码读者无意义，随手清理即可，不进 finding。
    - 文件过大（降级规则，Round 2 已记录，本轮 f003 修复未净增）：`src/renderer/views/TokenStatsView.tsx` 1034 行、`tests/unit/renderer/views/token_stats_view.test.tsx` 1034 行；PanelTitleBar.tsx 178 行未超阈值。
- AC 复验方式（Round 3）：
    - AC-001/AC-004（标题栏按钮渲染与窗口控制）：`re_verified`。f003 修复后重跑 PanelTitleBar.test.tsx 6/6（含 web 模式隐藏窗口控制按钮断言）、token_stats_header.test.tsx 12/12。
    - AC-002/AC-003/AC-005：`re_verified`。全量 vitest 2912 passed（唯一失败为无关存量 designmd drift），与 Round 2 一致；本轮 diff 仅动 PanelTitleBar.tsx 面板形态窗口控制段，查询/筛选/save_prefs 路径未触及。
    - coverage = 5 / 5
- 总体判断：f003 修复彻底（三元与双层守卫删除、props 类型补 `| undefined` 必要且 typecheck 通过），未发现修复引入的新问题，无未解决 critical / important；verdict 维持 PASS。
- 系统性 follow-up：无

reviewed_scope: 2b97d0eba77c1345

verdict: PASS

## Round 4 (2026-08-11 22:00 UTC+8)

- round：4
- reviewed_at：2026-08-11 22:00 UTC+8
  reviewed_scope: 5b4df3aadbd8d856

指纹说明：Round 3 后唯一变更 = `PanelTitleBar.tsx` WindowControls 注释清理（移除「t312_code_f002」审查编号溯源标记，reviewer Round 3 结论段提示项）。无代码行为变化。按 `check_review_status.py` 同口径重算当前 diff 指纹为 `5b4df3aadbd8d856`。

### 前轮 finding 复核

f001/f002/f003 结论维持（注释清理仅删流程溯源文本，不影响实现）。本轮无代码行为变更。

### 本轮新发现

无（0 条）。

### 结论（Round 4）

- 注释清理为 reviewer Round 3 提示项落实，无行为影响；全量验证沿用 Round 3（2912 passed / 1 存量 designmd / 9 skipped；typecheck、lint 通过）。
- 总体判断：无未解决 critical/important/minor，PASS。
- 系统性 follow-up：无。

verdict: PASS
