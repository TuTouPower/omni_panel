# Task review t269（reviewer_focus: 通用）

- task：`t269_ui_component_library`
- spec：`docs/tasks/t269_ui_component_library/spec.md`
- diff_anchor：`9d8a7066e441b17644b594a1678e26917573d351`
- target：`git diff 9d8a7066e441b17644b594a1678e26917573d351`
- round：1
- reviewed_at：2026-08-09 05:27 UTC+8

## Findings

### t269_gen_f001 - @utility 覆盖不足：KPI 数字与交互反馈过渡缺失

- 严重度：important
- 锚点：spec 契约区「范围」§「复合模式沉淀为 @utility：毛玻璃菜单、KPI 数字、骨架屏、交互反馈过渡」（要求 4 个，仅实现 2 个）；DESIGN.md Motion §「交互反馈…沉淀为 @utility transition-feedback」、Tailwind 架构 §（示例含 `metric-num`）
- 位置：`src/renderer/styles/globals.css:4111-4134`（仅 glass-menu/shimmer）；`src/renderer/components/ui/Kpi.tsx:14`；`src/renderer/components/ui/Button.tsx:15`
- 问题：t269 只新增 `glass-menu`（毛玻璃菜单）与 `shimmer`（骨架屏）两个 `@utility`。「KPI 数字」（DESIGN 命名 `metric-num`）与「交互反馈过渡」（DESIGN 命名 `transition-feedback`）未实现。后果可观测：交互组件各自硬编码异构 transition 字面量——Button `transition-[background-color,color,border-color]`、Segmented/Switch `transition-colors`，无统一反馈过渡；Kpi 逐实例手搓数字样式，且缺 `tabular-nums`（见 f005）。两处均为契约区明列的交付物、DESIGN 硬性要求。
- 建议：补 `@utility metric-num`（display-num + tabular-nums + tracking）与 `@utility transition-feedback`（DESIGN `{motion.feedback}` 120ms 曲线），并让 Button/Segmented/Switch/MenuItem 消费 `transition-feedback`，Kpi 消费 `metric-num`。

### t269_gen_f002 - Progress 风险阶梯阈值与 DESIGN risk-current 不一致

- 严重度：important
- 锚点：AC4「两形态共用风险阶梯填充色」；DESIGN.md Colors § risk-current「绿 → 黄 >60% → 橙 >85% → 红 ≥95%」；依赖与约束确认 DESIGN 为形态权威
- 位置：`src/renderer/components/ui/Progress.tsx:5-8`
- 问题：`risk_color` 用 `>=0.9 critical / >=0.7 high / >=0.5 mid / else success`，而 DESIGN 与既有实现 `src/renderer/lib/usage-colors.ts:26-29`（`risk_current_level`）均为 `>=95 red / >85 orange / >60 yellow / else green`。阈值整体右偏且分档不同：62% 显示 risk-high（橙）而按方案应为黄；88% 显示 critical（红）而应为橙；50% 显示 mid（黄）而应为绿。task.md 盘点明确 ui/Progress 为 usage-bar 迁移目标，迁移后 50–95% 区间可见风险色全部漂移。测试仅断言 value=0.3→success（两方案一致），未覆盖分歧区间。
- 建议：将阈值改为 `>0.6 yellow(mid) / >0.85 orange(high) / >=0.95 red(critical)`，与 `risk_current_level` 对齐。

### t269_gen_f003 - Dialog 遮罩散落字面量 `bg-black/40` 且缺 blur(3px)

- 严重度：important
- 锚点：spec 契约区「范围」§「不写散落于 token 外的字面量」；DESIGN.md Elevation §「对话框遮罩用 blur(3px) 的轻压暗」；既有模式 `.acct-dialog-scrim`（`globals.css:2738-2746`）用 `color-mix(in srgb, var(--text) 26%, transparent)` + `blur(3px)`
- 位置：`src/renderer/components/ui/Dialog.tsx:29`
- 问题：遮罩为硬编码 `bg-black/40`（黑色 40% 透明度字面量），非语义 token，且无 DESIGN 规定的 `blur(3px)`。暗色主题下纯黑 40% 遮罩比既有「文字色 26% + 模糊」模式明显更重、更硬，视觉与既有对话框遮罩模式不一致。非一次性例外，未按 Do's「arbitrary value 需在评审中说明」留痕。
- 建议：遮罩改语义化（复用/新增 scrim 类 token 的 color-mix），并补 `backdrop-blur-[3px]` 或沿用 `acct-dialog-scrim` 的 blur(3px)。

### t269_gen_f004 - 测试缺声明的两层验证（Tailwind 构建 grep + computed-style 明暗抽查）

- 严重度：important
- 锚点：AC3「全部组件在明暗主题下无需 dark: 类即渲染正确（测试断言语义类名，黑盒抽查暗色渲染）」；spec 上下文区测试策略「类名之外补充两层验证：Tailwind 构建产物 grep…代表性组件经 getComputedStyle() 在 light/dark 下断言解析值」
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx:1-216`
- 问题：ui.test.tsx 19 用例全部只断言 className 字符串。两处已批准的第二层验证均未实现：无 Tailwind 构建产物 grep（组件用到的每个工具类确实生成）；无任何 getComputedStyle / 暗色渲染黑盒抽查。组件代码层确无 `dark:`（已核对），t268 的 designmd drift 也不覆盖这些工具类/解析值。AC3「黑盒抽查暗色渲染」的验证缺口留白。注意：我侧向编译过 Tailwind 产物，确认 `glass-menu`/`shimmer`/`text-[var(--color-on-primary)]` 等类均正常生成——缺的是把该检查写进测试，而非产物本身有问题。
- 建议：补一层构建产物 grep（或复用现有 `globals_css.test.ts` 模式对编译产物断言 `glass-menu`/`shimmer`/代表性类生成），并对代表性组件在 light/dark 下做 computed-style 断言（或 e2e 黑盒）。

### t269_gen_f005 - Kpi 缺 tabular-nums

- 严重度：important
- 锚点：DESIGN.md Typography §「display-num…必须 tabular-nums」；Do's §「用 tabular-nums 渲染一切会变化的数字」（依赖与约束确认 Do's 为形态权威）
- 位置：`src/renderer/components/ui/Kpi.tsx:14`
- 问题：KPI 大数字类为 `font-display-num text-display-num font-bold tracking-tight text-[var(--color-on-surface)]`，无 `tabular-nums`。可观测：KPI 数值刷新（如 9→10、1→12）时宽度跳动，违背本应用「数字不跳位」核心行为；面板焦点数字正属 DESIGN 明示「必须」tabluar-nums 的对象。
- 建议：类名加 `tabular-nums`（若落成 f001 的 `metric-num` @utility，一并内聚）。

### t269_gen_f006 - 多组件视觉细节与 DESIGN Components 节不符（AC5 deploy 人工对照簇）

- 严重度：minor
- 锚点：AC5「组件视觉与 DESIGN.md Components 节一致，人工抽查确认。[deploy]」
- 位置：`Switch.tsx:21-25`、`Button.tsx:15-22`、`Badge.tsx:20-40`、`Menu.tsx:31`、`SecretInput.tsx:33-39`、`Progress.tsx:24/50`、`Dialog.tsx`（缺入场动画）
- 问题：均属可读码确认、AC5 人工对照范畴的视觉偏差：
    - Switch `h-5 w-9`（36×20）vs DESIGN 38×22；on 态 `bg-[var(--color-accent)]` vs DESIGN「开启态绿色」（既有 `.sw[data-on="1"]` 用 `var(--green)`）。
    - Button `font-medium`（500）vs DESIGN 字重 600；小号档沿用 `rounded-md`（10px）vs DESIGN sm 圆角 `sm`（8px）。
    - Badge count 实心 accent 底 + `on-primary` 白字 vs DESIGN「12% 派生浅底 + 强调色字」；label 形态彩点标签 vs DESIGN「灰底 surface-raised + label-caps 第三级文字色」。
    - MenuItem hover `surface-raised` vs DESIGN「菜单项整行 hover 蓝底白字」。
    - SecretInput 显隐用 emoji 👁/🙈 vs DESIGN 图标统一 lucide-react。
    - Progress 细线 `h-1`（4px）vs DESIGN 6px；胶囊 `h-6`（24px）vs DESIGN 22px；Dialog 缺 160ms 上浮淡入入场动画。
- 建议：迁移窗口前按 DESIGN Components 对齐（或逐条记录为遗留并标注）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（本轮为 Round 1）
- 本轮新发现：6 条（5 important + 1 minor）
- 未进表的提示：@utility 编译产物经 postcss 实测正常生成（glass-menu/shimmer/text-[var] 类均命中）；组件无 `dark:` 变体；盘点清单与 DESIGN Components 节 18 形态一一对应（AC1 满足）；task.md 合并决策逐条留痕；19 用例全部真实断言（无恒真/删 expect/.skip/mock 误用），ui.test.tsx 通过（19/19）。
- 总体判断：核心组件形态与盘点覆盖完成度高、测试断言可信，但 5 条未解决 important（@utility 交付缺 2/4、Progress 风险阶梯阈值漂移、Dialog 遮罩字面量+缺 blur、两层验证缺测、Kpi 缺 tabular-nums）构成 FAIL。
- 系统性 follow-up：无（各缺口均限本 task 内修复，无需跨 task）。

verdict: FAIL

## Round 2 (2026-08-09)

对照当前工作区与 `git diff 9d8a7066e441b17644b594a1678e26917573d351` 逐条复核处置：

- **f001**（@utility metric-num / transition-feedback）：部分已修。globals.css:4142-4155 新增 `metric-num`（font-display-num + tabular-nums + -0.02em）与 `transition-feedback`（引用既有 `--motion-feedback` 120ms / `--motion-easing`），均属本 task diff 内新增。残留：Button.tsx:14 仍 `transition-[background-color,color,border-color]`、Segmented.tsx:30 / Switch.tsx:17 仍 `transition-colors`（150ms 默认），未消费 transition-feedback → 见 f007。
- **f002**（Progress 风险阈值）：已修。risk_color 改 `>=0.95 critical / >0.85 high / >0.6 mid / else success`，消费 `--color-risk-critical/high/mid`；与 usage-colors.ts `risk_current_level`（>=95 red / >85 orange / >60 yellow / else green）各边界完全一致。
- **f003**（Dialog 遮罩）：部分已修。Dialog.tsx:26 已补 `backdrop-blur-[3px]`（DESIGN.md Elevation「blur(3px) 轻压暗」）。残留：遮罩仍硬编码 `bg-black/40` 字面量，未按既有 `.acct-dialog-scrim`（color-mix(in srgb, var(--text) 26%, transparent)）语义化，违反 spec.md:18「不写散落于 token 外的字面量」→ 见 f008。
- **f004**（构建产物 grep）：部分已修。新增 describe「ui 组件库构建产物（t269 AC4）」，grep `out/renderer/assets/index-*.css`，断言 4 个 @utility（glass-menu/shimmer/metric-num/transition-feedback）+ 5 个转义 arbitrary 类（`bg-\[var\(--color-primary\)\]` 等，`()`/`[]` 均正确转义）；实测 fresh build 产物全部命中、测试通过（20/20）。残留：f004 建议第二层 computed-style 明暗黑盒抽查未实现 → 见 f009。
- **f005**（Kpi 用 metric-num）：已修。Kpi.tsx:14 类名含 `metric-num`（tabular-nums 等宽数字）。
- **f006**（视觉细节登记）：已修（登记）。docs/pending.md p098 已登记，内容覆盖 f006 全项（Switch 尺寸/on 色、Button 字重/圆角、Badge 配色、MenuItem hover、SecretInput 显隐图标、Progress 粗细、Dialog 入场动画），处理未开。

修复未破坏核对：ui.test.tsx 20/20（含构建 grep 用例）；全量单测 2746 passed / 2 skipped；typecheck 0、lint 0；fresh `pnpm build` 成功，renderer CSS 产物含 metric-num / transition-feedback 及全部转义 arbitrary 类。

**Round 2 新增 finding（均为 minor，不阻断）**：

- **t269_gen_f007**（minor，f001 残留）：`transition-feedback` @utility 已交付但未被消费——Button/Segmented/Switch 仍硬编码异构 transition 字面量（150ms 默认），与 DESIGN.md:472「hover/press/toggle 用 `{motion.feedback}` 120ms」时效不一致，f001「无统一反馈过渡」后果仍在。
- **t269_gen_f008**（minor，f003 残留）：Dialog 遮罩 blur(3px) 已补，但 `bg-black/40` 硬编码字面量保留，未语义化 color-mix（spec.md:18 契约）；暗色主题下仍比既有 scrim 模式更重。
- **t269_gen_f009**（minor，f004 残留）：构建产物 grep 已落地；computed-style 明暗黑盒抽查（AC3 第二层）仍未实现，组件暗色渲染无解析值断言。

verdict: PASS

## Round 3 (2026-08-09)

对照工作区当前代码 + `git diff 9d8a7066` + fresh build 复核 f007-f009：

- **f007**（Button/Segmented/Switch 消费 transition-feedback）：已修。Button.tsx:14、Segmented.tsx:30、Switch.tsx:17 均改为 `transition-feedback`；globals.css:4149 `@utility transition-feedback`（120ms `--motion-feedback` + easing）已交付。f001 残留的异构 transition 字面量（`transition-colors` / `transition-[background-color,...]`）三组件内均无残留。
- **f008**（Dialog 遮罩 color-mix 语义化）：已修。Dialog.tsx:26 改 `bg-[color-mix(in_srgb,var(--color-on-surface)_40%,transparent)] backdrop-blur-[3px]`——语义 token（on-surface）驱动，无 `bg-black/40` 字面量（全 `ui/` 目录 grep `black/40` 零命中），spec.md:18「不写散落于 token 外的字面量」满足；blur(3px) 与既有 `acct-dialog-scrim` 模式一致。
- **f009**（computed 明暗黑盒抽查）：未修（处置过度声明）。task.md 处置表标「已修」，rationale「computed 明暗抽查由黑盒（electron e2e 暗色渲染）覆盖，jsdom 不解析 CSS 变量」。核对事实：t269 diff 内**无任何** e2e 新增渲染 ui 组件；全仓库唯一引用 `components/ui` 的是单测 `ui.test.tsx`；组件未被应用消费（`src/renderer/` 除 `components/ui/` 外零 import，task.md 亦载明「ui/ 为统一库供 t270 起迁移消费」），故任何 app 级 e2e 均无法渲染这些组件；现存唯一暗色 e2e `tests/e2e/web/popup_theme.spec.ts` 仅断言根节点 `data-theme` 属性、非 t269 diff 内、不触碰组件。即「黑盒覆盖」目前无实现。「jsdom 不解析 CSS 变量」方向性成立（jsdom 不级联构建产物 CSS，getComputedStyle 无解析值），但正确处置应为登记「遗留」（minor 不阻断，fix_ref 指向 pending 条目或 t270 消费后的 e2e），而非标「已修」。

**Round 3 新增 finding**：无（f009 本身即残留，未另起新编号；处置准确性见上）。

验证：fresh `pnpm build` 成功，`out/renderer/assets/index-*.css` 含 `transition-feedback`/`metric-num` 及全部转义 arbitrary 类；`ui.test.tsx` 20/20（构建 grep 用例在产物在场时实际执行）。

verdict: PASS（f009 为 minor 残留，按规则不阻断；建议将处置状态由「已修」更正为「遗留」+ pending 条目）
