# Task review t283（reviewer_focus: 通用）

- task：`t283_ui_component_theme_blackbox_check`
- spec：`docs/tasks/t283_ui_component_theme_blackbox_check/spec.md`
- diff_anchor：`db02c7118c8403acadcb7114856220225f79d3f3`
- target：`git diff db02c7118c8403acadcb7114856220225f79d3f3`
- round：1
- reviewed_at：2026-08-10 22:25 UTC+8

## Findings

### t283_gen_f001 - 暗色 token 调暗使非按钮 accent 文字对比跌破 4.5（聊天链接 4.42、卡片 4.03、container 浅底 3.3），AC-001「对比失效」未守住且 e2e 无覆盖

- 严重度：important
- 锚点：AC-001（暗色下关键页面无对比失效）；e2e 自身验收线「正文级（body/label 字级）≥ 4.5」（ui_component_theme.spec.ts:11）
- 位置：`DESIGN.md:49-55,70` + `src/renderer/styles/globals.css:55-61`（token 值）；受影响消费点 `src/renderer/components/workspace/MarkdownMessage.tsx:62`、`src/renderer/components/DeviceLoginSection.tsx:184`、`src/renderer/components/ProviderNav.tsx:27`、`src/renderer/components/ProviderCard.tsx:167`、`src/renderer/components/workspace/PaneMessageRow.tsx:107`；背景源 `src/renderer/components/workspace/SessionPane.tsx:113`（聊天 pane bg=surface-window）、`src/renderer/views/SettingsView.tsx:397`（设置 shell bg=surface-window）
- 问题：改动只按「白字 vs accent」一个场景选值（新值 vs #fff = 3.90/4.39/3.35/3.20/3.76，按钮场景全部过 3.0 线），但暗色下 accent 同时是**文字色**（链接、激活态、badge）与**浅底容器**（primary-container 16%/12% accent 混合）的唯一来源。实算暗色各表面（WCAG 相对亮度，同 spec 内公式）：
    - accent 蓝 #4a7bf0 on surface-window #181b22 = **4.42**（旧 #5b8dff = 5.50）；on card #1f232c = **4.03**（旧 5.02）；on 16% container over card = **3.32**
    - accent 紫 #7a5ff5 on surface-window = **3.93**（旧 #9a80ff ≈ 5.67）；on card = **3.58**（旧 5.17）
    - 实际渲染：聊天 markdown 链接与设置页 DeviceLogin 链接落在 surface-window 底（4.42）、ProviderNav 激活 tab accent-on-container（3.64）、ProviderCard 账号数 badge accent-on-12%-mix（3.47）——均为正文/label 字号（非大字），按 e2e 自身 4.5 线全部不达标；蓝/紫两项由改动前 ≥4.5 跌破 4.5，属本 diff 引入的回归。e2e 取样（Switch/Select/Input/Checkbox/Button/Segmented/Dialog）无一使用 accent 文字 on 暗底，且聊天/用量概览页未取样，故 74 例全绿而回归不可见。
- 建议：e2e 增加 accent 文字 on 暗底断言（如聊天链接、ProviderNav 激活 tab、count badge，两态），或以 4.5 线反推 token（恢复蓝至约 #5b8dff 或调亮暗底），并在 DESIGN.md 记录权衡（按钮白字 3.0 线与正文 accent 文字 4.5 线不可兼得时的取舍）。

### t283_gen_f002 - DESIGN.md token 数值变更无 rationale，且动机数值与实算不符

- 严重度：minor
- 锚点：文档/配置一致性（改动本身无出处，无法追溯）
- 位置：`DESIGN.md:49-55,70`
- 问题：front matter 七个 `-dark` 值变更（5b8dff→4a7bf0、9a80ff→7a5ff5、2cc9bd→0f9d93、ff9d5c→e07123、ff6b6b→ef4444、error-dark 同、primary-container-dark 同）在 diff 中无任何配套正文说明，DESIGN 是长期真相文档，数值变更不可追溯。实算复核：旧 primary-blue 白字 3.14（本已 ≥3.0），唯一真正跌破 3.0 线的是旧 error-red（2.78）；新 primary-dark 白字 3.90 恰与 DESIGN.md:376 既有陈述「约 3.9:1」吻合。若收尾报告引用「2.65:1 < 3.0」作动机（该数在仓库中无出处、与任何实算值均不符），会误导后续维护。
- 建议：在 DESIGN.md 正文或收尾报告记录真实计算依据：error-red 2.78→3.76 为修复跌破线项；blue 3.14→3.90 为对齐正文「约 3.9:1」品牌陈述。

### t283_gen_f003 - globals.css 导出区外新增多余空行

- 严重度：minor
- 锚点：diff 洁净度
- 位置：`src/renderer/styles/globals.css:129`
- 问题：`designmd-export:end`（127 行）与 t268 语义层注释（130 行）之间凭空多出一空行，与本次语义改动无关，属手改噪音。
- 建议：删除该空行。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（1 important、2 minor）
- 未进表的提示：
    - AC-003/AC-004 为 `[deploy]` 人工对照。当前差异记录仅以 p110~p113 存在（Switch 尺寸/on 色、Badge count 配色、Progress 尺寸、Button 字重矛盾 4 项）；spec 背景列举的 Button 圆角、MenuItem hover、SecretInput 显隐图标、Dialog 入场动画未见对照记录（若对照后无差异，收尾报告须明示）。收尾报告尚未写（task 未 finish），属过程性缺口，不构成 finding。
    - token 值调整处于 spec 非范围「设计 token 体系变更」边界，但属「差异项修复（样式级调整）」内的值级修正，且修复了 front matter 与正文 3.9:1 声称的矛盾，倾向合理；建议 spec 上下文区或收尾报告补一句说明。
    - p114（repo_template JS 未收录致 lint 全量失败）为存量问题（5229b98e sync 引入，主仓同现），登记 pending 处置正确。
    - 验证复核（本人实测）：新 spec 4/4 绿（真读 `getComputedStyle`、明暗两态全覆盖、bg-luminance 证明主题真实切换、Switch 受控轮询防过渡起点误读）；全量 web e2e 74 passed（MOCK_FIXTURE=synthetic，清代理 env）；新 spec eslint 干净；`designmd:check` drift check 通过（导出区 10-127 行未被手改，token 变化与 DESIGN.md 一致）；`pnpm typecheck` 通过。对比度阈值（正文 4.5 / 按钮与 Segmented 3.0）与 DESIGN 大字 3.0 验收线一致。
- 总体判断：e2e 与门禁本身可信、真绿，但 token 调暗在暗色下把多处正文级 accent 文字（链接/激活态/badge）对比从 ≥4.5 拉低到 3.3~4.4，违反 AC-001 且无测试覆盖，需修复后重审。
- 系统性 follow-up：无（本 finding 属 t283 自身修复范围）

verdict: FAIL

## Round 2 (2026-08-10 22:41 UTC+8)

## Findings

本轮无新 finding 进表（见结论段提示）。

## 结论

- 前轮 finding 复核（以 `git diff db02c7118c8403acadcb7114856220225f79d3f3` 与实测为准，不采信处置表自述）：
    - **t283_gen_f001（important）：已消除**。
        - (a) 修复成立：实测 tailwind-merge v3.6.0，修复前 `twMerge("text-[var(--color-on-primary)]", "text-label-md")` 输出仅 `"text-label-md"`（字号类被归入与颜色冲突的组，on-primary 被吞）→ 修复后 `text-[length:var(--text-label-md)]` 与 on-primary 共存（`"text-[var(--color-on-primary)] text-[length:var(--text-label-md)]"`）。`--text-label-md: 11.5px` 存在于 @theme（globals.css:96），arbitrary length 形式语义等价且消除歧义。2.65:1 依据复核成立：修复前 sm 主按钮文字 fallback 继承 on-surface-dark #e9ecf3 on primary #5b8dff = 2.65（独立复算一致）；修复后白字 #fff on #5b8dff = 3.13 ≥ 3.0。
        - (b) token 撤销：`git diff db02c711 -- DESIGN.md` 为空（front matter 回原值 5b8dff/9a80ff/2cc9bd/ff9d5c/ff6b6b）；globals.css 导出区 token 值同步一致（57-61 行）。on-primary 恒为 #ffffff（globals.css:14，明暗共用）。
        - (c) `.dark` 块五档 accent 已改 token 引用（globals.css:184-188 `--accent-blue: var(--color-accent-blue-dark)` 等），对应 token 定义存在（57-61 行）且值与原 hex 相同 → 纯机制修复，无行为变化。
        - (d) 新对比问题：无。accent 文字 on 暗底回 anchor 基线：blue on surface-window 5.50、purple 5.67、blue on card 5.02（独立复算一致），全部 ≥ 4.5；白字 on primary 3.13 ≥ 3.0。
    - **t283_gen_f002（minor）：已消除**。token 调暗已全部撤销（DESIGN.md 与 globals.css 无调暗残留）；保留的 `.dark` 硬编码→token 引用改动值语义不变；2.65 实测依据成立（见 f001），rationale 与代码一致。
    - **t283_gen_f003（minor）：已消除**。导出区 `designmd-export:end` 后与 t268 语义层注释间恢复单空行，与 anchor 一致；当前 globals.css 相对 anchor 仅 .dark 块一处 hunk。
- 本轮新发现：0 条（进表）
- 未进表的提示（基线既有，非本 diff 引入）：
    1. **standard 按钮 `text-body-md` 同样被 tailwind-merge 吞**：实测 `twMerge("text-body-md", "text-[var(--color-on-primary)]")` 输出仅 on-primary（text-body-md 消失），与 sm 同类问题——t269 既有基线（anchor 版本 base 即含 text-body-md），非 t283 引入；影响为 standard 按钮字号 fallback 到继承值（对比度不受影响，e2e 不可见）。建议 follow-up 将 base 字号统一改 `text-[length:var(--text-body-md)]`，标题建议 `fix_button_text_body_md_swallow`，不阻断。
    2. **danger 按钮暗色白字 2.78 < 3.0**（#fff on error-dark #ff6b6b，独立复算一致）：anchor 基线（t268 token 值），非 t283 修复引入；e2e 未取样 danger 按钮故不红。建议登记 pending，不阻断。
    3. e2e 未新增 accent 文字 on 暗底断言：撤销 token 调暗后回 anchor 基线（5.50/5.67 ≥ 4.5），无需新增断言即守住 AC-001，属可接受修复路径。
- 验证（本人实测）：`pnpm typecheck` 通过；`pnpm exec eslint`（ui_component_theme.spec.ts + Button.tsx）干净；`pnpm designmd:check` drift passed。全量单测 2833 passed / 全量 web e2e 74 passed（MOCK_FIXTURE=synthetic）采信实施方报告并注明：spec 相对 Round 1 未变，断言在修复前后均为真（primary 白字 3.90→3.13 均 ≥3.0；修复仅动 sm 字号类与 .dark 语义等价引用），结果不受修复影响。e2e 逻辑复核（非假绿）：`sample_contrast` 真读 getComputedStyle 前景 + 祖先链最近非透明背景 + WCAG 相对亮度公式；明暗两态 for 全覆盖；Switch 受控轮询（aria-checked 等待 + track 底色 poll 防过渡起点误读）；Dialog 可见 + 卡片底非透明 + 标题 4.5；Segmented 取 `[aria-pressed="true"]` 选中块 3.0；`page_background_luminance`（dark<0.05 / light>0.5）证明主题真实切换。阈值（正文 4.5 / 按钮与 Segmented 3.0）与 DESIGN 大字验收线一致。
- 总体判断：三 finding 处置均成立，e2e 可信真绿，无未解决 critical / important。
- 系统性 follow-up：无（见结论段两条建议，不阻断）

verdict: PASS
