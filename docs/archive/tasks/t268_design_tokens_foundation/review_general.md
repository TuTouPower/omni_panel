# Task review t268（reviewer_focus: 通用）

- task：`t268_design_tokens_foundation`
- spec：`docs/tasks/t268_design_tokens_foundation/spec.md`
- diff_anchor：`768765b522734740b27244c40443e687188c5e1d`
- target：`git diff 768765b522734740b27244c40443e687188c5e1d`
- round：1
- reviewed_at：2026-08-09 04:37 UTC+8

> 注：任务消息里的 diff 锚点 `768765b5d32a160d00acbc6d1e64837cef956e14` 是坏 SHA（bad object）；本 prompt 头部锚点 `768765b522734740b27244c40443e687188c5e1d` = HEAD，`git diff` 恰好给出全部 t268 改动（12 文件，+628/-17）。以 prompt 锚点为准审查。

## Findings

### t268_gen_f001 - `--primary-foreground: var(--on-primary)` 引用未定义变量（兼容桥断点）

- 严重度：important
- 锚点：范围「临时兼容桥」AC —— 现存三套强调色入口映射到统一 accent 变量须正确
- 位置：`src/renderer/styles/globals.css:175,200`
- 问题：语义层 `:root` 与 `.dark` 均写 `--primary-foreground: var(--on-primary)`，但全仓 `--on-primary` 无任何定义（仅 @theme 有 `--color-on-primary`，globals.css:13）。`var(--on-primary)` 计算值无效 → `--primary-foreground` 整体 invalid at computed-value time。唯一消费者 `src/renderer/components/Button.tsx:22`（`text-[var(--primary-foreground)]`）取到继承色而非白色；改动前该变量是 `--primary-foreground: #fff`（diff 移除），属兼容桥引入的回归。Button 当前无调用点，缺陷暂隐，但桥接入口本身坏。
- 建议：改为 `var(--color-on-primary)`（或直接 `#fff`）。

### t268_gen_f002 - drift check 未接入任何自动门禁，AC5「手工改动导出区后测试失败」不成立

- 严重度：important
- 锚点：AC5（token 导出脚本与 drift check 落地：手工改动导出区后测试失败）
- 位置：`package.json:33`、`.github/workflows/ci.yml:25,48`、`.husky/pre-commit`、`.husky/pre-push`、`tests/unit/main/scripts/designmd.test.ts:113-124`
- 问题：`designmd:check` 仅是可手动执行的脚本；`pnpm test` / `pnpm check` / pre-commit（lint-staged）/ pre-push（typecheck+test）/ CI（ci.yml 跑 check+test）都不调用它。单测 `check_drift 检测导出区与 DESIGN.md 不一致` 只在临时目录文件上验证函数机制，不校验真实 `DESIGN.md` vs `globals.css`。可复现：手工改导出区一个值 → `pnpm test` 全绿 → 门禁形同虚设，AC5 的可观测结果（手工改动即测试失败）不成立。
- 建议：把 `designmd:check` 接入 `pnpm test`（或 CI），或加一条对真实仓库文件调用 `check_drift()` 的测试。

### t268_gen_f003 - `.dark` 语义块只翻转 7 个 `-dark` token，22 个成对暗色值导出即死

- 严重度：important
- 锚点：AC2（明暗切换后所有窗口底色/文字/边框同步变化）、AC7（语义工具类明暗自动正确）
- 位置：`src/renderer/styles/globals.css:180-203`（`.dark` 覆盖表）vs 9-125（@theme 导出表）
- 问题：@theme 导出 29 个 `--color-*-dark`，`.dark` 语义块只覆盖 surface / surface-window / surface-card / on-surface / on-surface-variant / outline / hairline 共 7 个。未接线：`surface-raised`、`field-bg`、`menu-bg`、`on-surface-muted` 四个语义色，以及 `primary`、`primary-container`、`accent-*`（5）、`chip-active`、`success/warning/error`、`risk-*`（3）、`agent-*`（4）等分类色。后果：暗色下 `bg-surface-raised` / `bg-field-bg` / `bg-menu-bg` / `text-on-surface-muted`（以及 `bg-primary`、`bg-accent-*` 等）渲染亮色值，导出的 `-dark` 值成死代码；「组件无需写 dark:」机制只对 7 个已接线变量成立。当前窗口走旧 `--field-bg`/`--menu-bg`/`--text-3` 等兼容变量仍正常，缺口落在 t270+ 的新 token 消费方。
- 建议：在 `.dark` 语义块补上 `--color-surface-raised`、`--color-field-bg`、`--color-menu-bg`、`--color-on-surface-muted`（值取 `-dark` 对），并决定 primary/accent/分类色是否需要暗色翻转后接线。

### t268_gen_f004 - 设置页强调色选择器绕过 accent 机制，live 切换不驱动派生 token 与暗色翻转

- 严重度：important
- 锚点：AC3（设置中切换五档强调色……hover/浅底/聚焦环等派生态随动）
- 位置：`src/renderer/views/settings-view/sections/appearance_section.tsx:62-70` vs `src/renderer/lib/theme.ts:51`
- 问题：`apply_accent` 只在 `useTheme` 挂载时调用（theme.ts:51，恢复路径）。设置页强调色 onClick 仍直接 `style.setProperty("--blue", c)`，不调 `apply_accent`。live 路径下 `--accent` 保持默认 `var(--accent-blue)` → `--accent-strong/container/ring`、`--primary`、`--ring`、`--focus-ring` 全部不随所选强调色变化，所选色也无暗色翻转（`--blue` 内联 hex 覆盖 `.dark` 的 `--blue: var(--accent)`）；重启后才由 `apply_accent` 恢复，live 与重启观感不一致。AC3「派生态随动 + 重启保持」只在重启路径成立。本 diff 对 live 切换路径无任何测试（5 条 apply_accent 单测只测函数本身，不测设置→`--blue` 链路）。
- 建议：设置页 onClick 改调 `apply_accent(c)`（或把 `--accent` 的写入口收口到统一函数）。注意范围限制「不迁移未迁移窗口」与 AC3 的张力：若 settings 窗口迁移归 t270，需改 spec 说明 AC3 live 派生随动由 t270 达成，否则 t268 内接线。

### t268_gen_f005 - task.md 导出 token 数（193）与实值（114）不符

- 严重度：minor
- 锚点：文档/配置一致性
- 位置：`docs/tasks/t268_design_tokens_foundation/task.md`（「导出区（193 token）」）vs `src/renderer/styles/globals.css:11-124`
- 问题：@theme 实际 114 行 token（`grep -cE "^\s+--"` = 114），task.md 声称 193。
- 建议：改 task.md 数字，或按实际口径修正。

### t268_gen_f006 - `@custom-variant dark` 缺后代匹配，`dark:*` 工具类对后代元素不生效（潜伏）

- 严重度：minor
- 锚点：行为缺陷（无对应 AC，当前无 `dark:` 用法，潜伏）
- 位置：`src/renderer/styles/globals.css:7`
- 问题：`@custom-variant dark (&:where([data-theme="dark"], .dark));` 只匹配元素自身带属性/类的情况；Tailwind v4 惯用形式是 `(&:where(.dark, .dark *))`。`data-theme` 只设在 `<html>` 上，任何后代组件写 `dark:*` 都不会命中。当前渲染层无 `dark:` 工具类使用（语义变量机制覆盖明暗），故未显形；后续组件若依赖 `dark:*` 会静默失效。
- 建议：补 `.dark *` 后代匹配，或在蓝图注明 dark: 变体不属本任务契约。

### t268_gen_f007 - 测试策略建议的 accent×主题 getComputedStyle 矩阵与恢复路径未覆盖

- 严重度：minor
- 锚点：测试策略（accent×主题矩阵 + 单测断言 config 恢复）
- 位置：`tests/unit/renderer/lib/theme.test.ts:83-122`
- 问题：按 spec 测试策略，应「accent × 主题代表性矩阵（五档 × light/dark）经 getComputedStyle() 断言解析后的实际颜色值」，且启动恢复路径（`useTheme` → `apply_accent(config.accentColor)`）。现有 5 条断言只核对内联 `--accent` 变量字符串，无解析后颜色、无明暗矩阵、无恢复路径测试（AC3 重启保持无测试锚点）。
- 建议：补 `apply_accent` 预设×明暗的 getComputedStyle 断言（如需），或按有意不测/降级说明。

### t268_gen_f008 - designmd 字阶导出注释与实现不符，typography 子属性被静默丢弃

- 严重度：minor
- 锚点：文档/代码一致性
- 位置：`scripts/designmd.ts:58-72`（注释「其余作为 -tracking/-leading/-weight」）
- 问题：`generate_css_tokens` 的 typography 分支只输出 `--text-{name}`（fontSize）与 `--font-{name}`（fontFamily），DESIGN.md front matter 中每级定义的 `fontWeight`/`lineHeight`/`letterSpacing`/`fontFeature` 全部丢弃；函数注释声称会输出 `-tracking/-leading/-weight`，实无。`text-body-md` 只含字号，丢失 1.5 行高与 450 字重，「九级文字全部落地」不完整，且注释误导后续维护。
- 建议：实现 `--text-{name}--font-weight/--line-height/--letter-spacing` 导出（Tailwind v4 支持），或修正注释并记入 spec 处置。

## 结论

- 前轮 finding 复核（Round 1）：无
- 本轮新发现：8 条（important 4：f001-f004；minor 4：f005-f008）
- 未进表的提示：
    - `--color-primary` 等 @theme 色与语义层 `--accent-*` 存在两套并行值（DESIGN.md 本身定义两处，非 bug）；@theme 的 `bg-primary` 在暗色不翻转，已并入 f003。
    - `apply_accent` 对 3 位 hex（`#fff`）视为非法回落 blue：可辩护（spec 未定义短 hex），未单列。
    - `designmd` `main()` 仅识别 `--format=css-tailwind` 等号形式（`--format css-tailwind` 空格形式落 usage 报错）：文档用法即等号形式，未单列。
    - 字体 4 个 woff2（Inter Variable latin 48KB/52KB、JetBrains Mono latin 400/700 各 21KB）与 @font-face 路径 `../assets/fonts/` 一致；AC6 属 [deploy] 人工验证，未列 finding。
- 总体判断：核心机制（@theme 导出 + drift check 函数、apply_accent 映射、字体接入、语义工具类）落地且 14 条测试全绿、真实 drift check 通过；但存在 4 个未解决的 important：兼容桥 `--primary-foreground` 悬空引用、drift 门禁未接入自动流水线（AC5 不成立）、`.dark` 暗色翻转覆盖不全（22 个 `-dark` 值导出即死，AC2/AC7 缺口）、live 强调色切换不驱动派生/暗色（AC3 仅重启路径成立）。判 FAIL。
- 系统性 follow-up：无（均为本 task 内修复项；若 settings 窗口接线确属范围外，建议改 spec 将 AC3 live 派生随动移交 t270）。

verdict: FAIL

## Round 2 (2026-08-09)

Round 2 复核（对照处置表 Round 1 各「已修」项 + 当前代码 + 单测 + 编译产物）：

- t268_gen_f001 已修。globals.css:176,218 均改 `--primary-foreground: var(--color-on-primary)`，`--color-on-primary` 于 @theme 导出（globals.css:14 = #ffffff）；全仓无 `--on-primary` 残留；编译产物 `--primary-foreground:var(--color-on-primary)` 且 `--color-on-primary:#fff` 可解析。
- t268_gen_f002 已修。designmd.test.ts:133-137 新增「真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）」单测，`check_drift()` 走默认路径（真实 DESIGN.md + 真实 globals.css），手工改动导出区即失败；随 `pnpm test`（node 项目）执行，实测 6 条全绿；CLI `designmd:check` 亦 passed。
- t268_gen_f003 部分修复（未全修）。`.dark` 语义块现覆盖 23/29 个 `-dark` 值：surface 全族（含 surface-raised）、field-bg/menu-bg/on-surface-muted、chip-active、primary-container、success/warning/error、risk-*×3、agent-*×4 全部接线（编译产物 dark 覆盖集 = 23 处，实测）；但 `--color-primary` 与 5 个 `--color-accent-*` 仍未接线——对应 6 个 `-dark` 导出值（primary-dark、accent-{blue,purple,teal,orange,red}-dark）仍为死代码，`bg-primary`/`bg-accent-*` 工具类暗色下仍渲染亮色值（f003 点名的 22 项中 16 项已覆盖、6 项未覆盖；原后果逐字成立）。task.md 处置「补全全部 22 个暗色覆盖」不实，且无「品牌色不翻转」的决定记录。→ 详见新增 t268_gen_f009。
- t268_gen_f004 已修。appearance_section.tsx:73 onClick 改调 `apply_accent(c)`（import 于 :5）；`--accent` 全仓唯一写入口收敛到 apply_accent（theme.ts:36），派生 strong/container/ring（color-mix）与兼容桥 `--blue`/`--primary` 随动，预设色暗色经 `.dark` 的 `--accent-blue:#5b8dff` 等翻转；save_config 并行保存。
- t268_gen_f005 已修。task.md:25 记为「导出区（114 token）」，与实测 `grep -cE "^\s+--"` = 114 一致。
- t268_gen_f006 已修。globals.css:8 `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *))`，属性与类两组后代匹配齐备；`build:web` 通过，Tailwind v4 正常编译。
- t268_gen_f007 已修（降级说明）。theme.test.ts:122-144 补五档 accent × light/dark 矩阵；断言停在 DOM 变量层（与 spec「可测试性声明：断言 DOM 变量值」一致），jsdom 不解析样式表 var()/color-mix，getComputedStyle 解析色不可行，:137-138 注释记录降级理由。残留 minor：启动恢复路径（useTheme→apply_accent(config.accentColor)）仍无直接断言。
- t268_gen_f008 已修。designmd.ts:111-112 注释改为「fontWeight/lineHeight/letterSpacing 等子属性当前不导出」，与实现（仅 --text-_ fontSize + --font-_ family）一致。

Round 2 新增 finding：

- t268_gen_f009（minor，潜伏）：`--color-primary` + 5 个 `--color-accent-*` 在 `.dark` 块未接线，6 个 `-dark` 导出值成死代码，`bg-primary`/`bg-accent-*` 工具类暗色下仍渲染亮色值，与已接线语义层 `--accent`/`--primary`（暗色翻转）不一致。编译产物 dark 覆盖集 = 23，缺 primary 与 accent-{blue,purple,teal,orange,red}。无当前消费方（Button 走 `bg-[var(--primary)]`，随语义层翻转），AC2/AC7 对在用色成立，故非 important。修复：`.dark` 补 6 行 `var(--color-*-dark)`，或记录品牌色不翻转决定并说明 `-dark` 值处置；同时纠正 task.md「补全全部 22 个暗色覆盖」表述。

黑盒/回归复核：单测 16/16 绿（theme 10 + designmd 6，含真实 drift 门禁）；`designmd:check` passed；`build:web` 成功；编译产物含 `--color-surface:#e7eaf1`（light）/`--color-surface:var(--color-surface-dark)`（dark 覆盖）、`--accent:var(--accent-blue)`（light #3d7afd / dark #5b8dff）、`--primary-foreground:var(--color-on-primary)`（解析 #fff）、Inter Variable @font-face。未发现修复引入回归（既有窗口走旧兼容变量不受新 `--color-*` 覆盖影响）。

verdict: FAIL

> 注：FAIL 仅因 f003 部分未闭合（6 个 `-dark` 值死代码 + task.md 声称不实，见 t268_gen_f009，minor-潜伏）。补 6 行接线并纠正表述即可闭合；其余 7 条已修。

## Round 3 (2026-08-09)

复核 f009 结果（已修）：

- **t268_gen_f009 已修**。globals.css `.dark` 块（:205-211）现接线 `--color-primary: var(--color-primary-dark)` + `--color-primary-container` + 5 个 `--color-accent-{blue,purple,teal,orange,red}: var(--color-accent-{...}-dark)`。全部 29 个 `-dark` 导出值（@theme :55-83）均被 `.dark` 块恰好引用一次（逐项 grep 各 `var(--color-*-dark)` 引用数 = 1，29/29 无死代码）。
- **dark 解析验证（构建产物）**：`pnpm build:web` 成功；编译产物 `.dark,[data-theme=dark]{...}` 规则内 `--color-*:var(--color-*-dark)` 引用共 29 条，含 `--color-primary:var(--color-primary-dark)`（→#5b8dff）与 5 个 accent 全对；`--color-primary-dark:#5b8dff`、`--color-accent-blue-dark:#5b8dff` 等定义在 @theme 导出 :root。工具类 `.bg-primary{background-color:var(--color-primary)}` 暗色下解析 #5b8dff（f009 目标达成，`bg-accent-*` 机制同源）。light 下 `--color-primary:#3d7afd` 不变。
- **task.md 处置表一致性**：f009 行（task.md:61）「dark 块补 --color-primary + 5 个 --color-accent-* 接线」与实现一致；f003 行「补全全部 22 个暗色覆盖」所指 22 项（surface-raised/field-bg/menu-bg/on-surface-muted/chip-active/primary/primary-container/accent-*×5/success/warning/error/risk-*×3/agent-*×4）现已全部接线，表述属实。

Round 2 已修项回归复核（均未破坏）：

- f001：`:root` 与 `.dark` 均 `--primary-foreground: var(--color-on-primary)`（globals.css:176,224）；全仓无 `--on-primary` 残留（`grep` 0 命中）。
- f002：designmd.test.ts:133-137「真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）」仍在，`check_drift()` 走真实文件；`designmd:check` passed。
- f003：上文已证 29/29 接线，Round 2 遗留的 6 项（primary + 5 accent）闭合。
- f004：appearance_section.tsx:73 `apply_accent(c)` 未回退。
- f005：task.md:25 记为「114 token」。
- f006：globals.css:8 `@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *, .dark, .dark *))` 后代匹配完好。
- f007：theme.test.ts 五档 accent × light/dark 矩阵在；theme 10 条 + designmd 6 条共 16/16 绿；全量 `pnpm test` 2726 passed（2 skipped）。
- f008：designmd.ts:111-112 注释与实现（仅 --text-_ fontSize + --font-_ family）一致。

Round 3 新增 finding：无。round2 遗留的 minor（启动恢复路径 useTheme→apply_accent 无直接断言）非本 round 范围，维持 Round 2 记录。

verdict: PASS
