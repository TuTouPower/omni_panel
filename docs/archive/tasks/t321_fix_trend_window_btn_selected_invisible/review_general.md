# Task review t321（reviewer_focus: 通用）

- task：`t321_fix_trend_window_btn_selected_invisible`
- spec：`docs/tasks/t321_fix_trend_window_btn_selected_invisible/spec.md`
- diff_anchor：`022b83e82d8981de43d6294504e800564a919dd3`
- target：`git diff 022b83e82d8981de43d6294504e800564a919dd3`
- round：1
- reviewed_at：2026-08-12 18:40 UTC+8

reviewed_scope: a780e927284ec078

## Findings

### t321_gen_f001 - 「两主题」测试不实：light 主题从未渲染，AC-002 只验证了 dark

- 严重度：important
- 锚点：AC-002（「dark 与 light 两主题」）
- 位置：`tests/e2e/web/trend_window_button_contrast.spec.ts:52-58`（`switch_theme` 定义未调用）、`:61`（`theme_attr` 解构未使用）、`:65-90`（test body 无任何主题切换逻辑）
- 问题：新 spec 用 `[浅色, 深色]` 生成两个 test 迭代，但两个迭代共用 `test_web` fixture——每用例先 `POST /v1/config/reset` 再进 `/#usage`（`tests/e2e/fixtures/test_web.ts`），复位后 config 即录制 fixture `synthetic.json:1170` 的 `"theme": "dark"`；`src/renderer/lib/theme.ts:77-83` 启动时 `config.get() → apply_theme_mode(config.theme)` 置 `data-theme="dark"`。`switch_theme`、`theme_attr` 均未接线，实测两个迭代都跑在 dark（复现 fixture 流程后 `data-theme="dark"`、body 亮度 0.011）。标「浅色」的用例实为 dark 渲染。后果：AC-002 要求 light/dark 两主题均断言，实际仅 dark 被验证；p144 根因中包含 light 态 bug（light 选中按钮 bg 为卡片白），该分支无任何回归护栏。
- 建议：参照 `ui_component_theme.spec.ts:80-109` 在设置页 appearance 调 `switch_theme(page, theme_label)` 真正切换主题，并加 `page_background_luminance` 守卫证明主题生效后再采样。

### t321_gen_f002 - 新 spec 使 `pnpm typecheck` 断裂（TS6133 未使用符号）

- 严重度：important
- 锚点：行为缺陷——仓库 typecheck 门禁（`tsconfig.json` `noUnusedLocals:true`、`include` 含 `tests`、`typecheck` 脚本 `tsc --noEmit`）在当前 worktree 必红
- 位置：`tests/e2e/web/trend_window_button_contrast.spec.ts:52:16`（`'switch_theme' is declared but its value is never read`）、`:61:30`（`'theme_attr' is declared but its value is never read`）
- 问题：`npx tsc --noEmit` 实测报 TS6133 两条。`pnpm test`（vitest）不跑 tsc，故「全量 2944 passed」不代表 typecheck 通过。合并前门禁/CI 必断。
- 建议：接线主题切换（即 f001）后删净未用符号；不接线则直接删 `switch_theme`/`theme_attr` 恢复 typecheck 绿。

### t321_gen_f003 - AC-004 声明可自动测试，但未选中态无任何自动化护栏

- 严重度：important
- 锚点：AC-004 + spec 可测试性声明（「AC-004：可自动测试，e2e 采样未选中按钮 computed 样式与修复前快照一致」）+ 测试策略（「未选中按钮样式回归不动」）
- 位置：`tests/e2e/web/trend_window_button_contrast.spec.ts`（全文件只断言选中按钮 `:70-89`，无未选中采样）；既有单测 `tests/unit/renderer/components/provider_account_row.test.tsx:424/488/525` 只断 `aria-pressed` 与取数行为，不涉样式
- 问题：spec 明确把 AC-004 列为可自动测试，测试策略也要求采样未选中按钮，但新 e2e 未实现。行为本身当前已保留（实证：未选中 computed bg=rgba(0,0,0,0)、color=#a3abba、border=outline，符合 AC-004 描述），但 spec 承诺的回归护栏缺失。
- 建议：补未选中按钮 computed 样式采样断言。

### t321_gen_f004 - AC-001 断言弱于 spec 措辞（只断非透明，未断等于 accent 值）

- 严重度：minor
- 锚点：AC-001（「渲染背景色即 `--color-accent` 值」）
- 位置：`tests/e2e/web/trend_window_button_contrast.spec.ts:74-77`
- 问题：测试只断背景非 transparent，未断背景等于 accent 值。当前类集下「非透明 ⟹ accent」成立（唯一候选为 transparent / accent / hover-raised，非 hover 态即前两者），但未来若误换为其它非透明底色不会被拦，与 AC-001 的「即 accent 值」措辞有差距。
- 建议：追加断言 background-color 等于 `--color-accent` 解析出的 rgb（可对根元素 `getPropertyValue('--color-accent')` 换算后比对）。

### t321_gen_f005 - AC-003 前半句未断言（文字 ≠ 卡片背景色）

- 严重度：minor
- 锚点：AC-003（「computed `color` 不等于其所在卡片背景色，且与最终背景非同色」）
- 位置：`tests/e2e/web/trend_window_button_contrast.spec.ts:79-89`
- 问题：测试只断 `fg != sample.bg`（最终背景），AC-003 的「不等于所在卡片背景色」分句无断言。选中态按钮为不透明 accent 底时该分句偏防御性，但属 spec 明列的可观察行为。
- 建议：追加选中按钮文字色与卡片背景色（`CollapsibleCard` 底）不等的断言。

### t321_gen_f006 - spec 上下文区测试策略仍写 ≥4.5，与 AC-002 ≥3.0 不一致

- 严重度：minor
- 锚点：spec 上下文区「测试策略」断言目标
- 位置：`docs/tasks/t321_fix_trend_window_btn_selected_invisible/spec.md:81`（「文字与最终背景对比度 ≥ 4.5」）
- 问题：契约区 AC-002（:41）与可测试性声明（:54）已改 ≥3.0，实际实现与测试也按 ≥3.0，唯上下文区测试策略残留 ≥4.5。属 spec 内部不一致，处置为改 spec，不计 FAIL。
- 建议：将测试策略行同步为 ≥3.0。

## 结论

- 本轮新发现：6 条（f001/f002/f003 为 blocking，f004-f006 为 minor）
- 未进表的提示：
    - diff_anchor 起 `git diff` 含 t319/t320 链式历史实现，审阅已按任务边界聚焦 t321 自身改动（ProviderAccountRow.tsx className + 新 e2e + spec AC-002 阈值）。ProviderAccountRow.tsx 全文件 diff 仅 `cn()` 接线一处，无混入。
    - AC-002 阈值 4.5→3.0 为经用户确认的需求变更（契约区 drift 核对），且独立复验成立：light accent-blue #3d7afd + on-primary #ffffff 实测对比 3.89、dark #5b8dff + 白 3.14，均 ≥3.0 且均 <4.5——原 ≥4.5 阈值物理不可达，改 ≥3.0 合理。
    - 修复实现本身正确：`cn()`（twMerge 3.6.0）实测对选中态正确去重（drop `bg-transparent`/`text-[var(--color-on-surface-variant)]`，保留 `bg-[var(--color-accent)]`/`text-[var(--color-on-primary)]`）；`text-on-primary` 为项目 accent 底文字色约定（Button/Menu/SessionRow 同款）；未选中态 twMerge 输出保持透明底+浅灰字+outline。
    - 实证复现（playwright 直驱 mock preview，仅 `.scratch/`，已清理）：dark 下选中按钮 bg=rgb(91,141,255)（accent-blue-dark）、color=rgb(255,255,255)、border=同 accent；light 下 bg=rgb(61,122,253)（#3d7afd）、color=白、对比 3.89。
- 总体判断：修复实现正确、能挡住 bg-transparent 覆盖 bg-accent 回归，但 e2e 未真正切 light 主题（AC-002 两主题只验 dark）、未选中态回归护栏缺失（AC-004）、新 spec 还压断 typecheck 门禁，三条 blocking 未解决，FAIL。
- 系统性 follow-up：无（主题切换 + 亮度守卫的既有范式在 `ui_component_theme.spec.ts` 中已存在，非基础设施缺口）。

### AC 复验方式

- AC-001：`re_verified`——审阅 diff 与 twMerge 3.6.0 实跑输出（`bg-transparent` 被去重、`bg-[var(--color-accent)]` 保留）；playwright 实测 dark bg=rgb(91,141,255)、light bg=rgb(61,122,253)，均等于对应主题 accent 值。
- AC-002：`re_verified`——两主题行为独立复验：light 3.89、dark 3.14，均 ≥3.0。注意：行为复验覆盖两主题，但新 e2e 自动化只跑 dark（见 f001）。
- AC-003：`re_verified`——dark/light 下 fg=rgb(255,255,255) ≠ accent 底，文字可见成立；但「≠ 卡片背景色」分句无测试断言（f005）。
- AC-004：`re_verified`（行为）——playwright 实测未选中 bg=rgba(0,0,0,0)、color=rgb(163,171,186)（#a3abba）、border=outline，与修复前一致；但无自动化护栏（f003）。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-12 19:10 UTC+8)

本轮 reviewed_scope 行（指纹随实施方改动重算）：
reviewed_scope: e00be8b28e2dd17f

### 前轮 finding 复核

- t321_gen_f001（两主题不实）→ **已消除**。`tests/e2e/web/trend_window_button_contrast.spec.ts:66-77` 新增 `switch_theme`：经 `SettingsPage.open_via_hash` 进设置页 appearance 真点主题按钮，断言 `aria-pressed` 后回 usage；`:92-102` 补 `page_background_luminance` 亮度守卫（dark<0.05 / light>0.5）。实测重跑 `pnpm exec playwright test --project=web tests/e2e/web/trend_window_button_contrast.spec.ts` → 2 passed（浅色 728ms / 深色 1.1s），两主题均真切换并断言通过。
- t321_gen_f002（typecheck 断裂）→ **已消除**。`switch_theme`/`theme_attr` 均已被引用；`npx tsc --noEmit` exit 0、0 error。
- t321_gen_f003（AC-004 无护栏）→ **已消除**。`:141-159` 补未选中按钮采样：bg 透明（`rgba(0,0,0,0)`）、fg 异于选中 fg、border 非透明（outline 边框）。
- t321_gen_f004（AC-001 未断 accent 值）→ **已消除**。`:118-126` 用临时 probe 元素把 `--color-accent` 解析为 computed rgb 后与选中按钮 bg 强等比对。
- t321_gen_f005 → **撤回**（见撤回记录）。
- t321_gen_f006（spec 测试策略 ≥4.5）→ **已消除**。`docs/tasks/t321_fix_trend_window_btn_selected_invisible/spec.md:81` 测试策略改 ≥3.0。

### 撤回记录

- t321_gen_f005 - 撤回。理由：AC-003「文字 ≠ 所在卡片背景色」分句在 light 主题下物理不可满足——`--color-on-primary:#ffffff`（globals.css:14）与 `--color-surface-card:#ffffff`（globals.css:23）天然同色，on-primary 白字落在 surface-card 白卡片上必等色；修复方案（选中态背景实底 accent 盖住卡片，文字可见性由 AC-002 对比度保证）不依赖也不应要求文字异于卡片背景。实施方已改 spec AC-003 正文为「computed `color` 与按钮最终背景（accent 实底）非同色，对比度由 AC-002 保证」，移除该分句；测试 `:137-139` 断 `fg != sample.bg`（最终背景），与修正后 AC 一致。该 finding 不再强制改代码。

### 本轮新发现

### t321_gen_f007 - spec 可测试性声明 / 测试策略残留「文字与卡片背景非同色」，与新 AC-003 正文矛盾

- 严重度：minor
- 锚点：spec 内部一致性（AC-003 已改，副区未同步）
- 位置：`docs/tasks/t321_fix_trend_window_btn_selected_invisible/spec.md:54`（可测试性声明「e2e 断言选中按钮 computed color 与卡片背景色不同」）、`:81`（测试策略「文字与卡片背景非同色」）
- 问题：AC-003 正文（:40）已改为「与按钮最终背景（accent 实底）非同色」，但可测试性声明与测试策略仍保留「与卡片背景色不同」措辞，与正文相抵；测试代码实际断的是最终背景（`fg != sample.bg`）。属 spec 过时处置，不计 FAIL。
- 建议：将 :54 / :81 两处同步为「与最终背景非同色」。

### 结论

- 前轮 finding 复核：f001/f002/f003/f004/f006 已消除；f005 已撤回。
- 本轮新发现：1 条（f007，minor）。
- 未进表的提示：ProviderAccountRow.tsx 无新改动；AC-002 阈值行为在 Round 1 已独立复验（light 3.89 / dark 3.14）。
- 总体判断：无未解决 critical / important，仅有 minor，PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001：`re_verified`——重跑 e2e 2 passed；测试断言 bg 等于 `--color-accent` 解析值。
- AC-002：`re_verified`——重跑 e2e 浅/深两主题均断对比度 ≥3.0 且通过（此前独立复验 light 3.89 / dark 3.14）。
- AC-003：`re_verified`——测试断 `fg != sample.bg`（最终背景），符合修正后 AC-003。
- AC-004：`re_verified`——测试采样未选中按钮 bg 透明 / fg 异于选中 / border 非透明，符合 AC-004。

coverage = 4 / 4

verdict: PASS

## Round 3 (2026-08-12 18:44 UTC+8)

本轮 reviewed_scope 行（指纹随实施方改动重算）：
reviewed_scope: b2e92d7805d55385

### 前轮 finding 复核

- t321_gen_f001（两主题不实）→ **仍消除**。测试保持设置页真切主题 + 亮度守卫；本轮重跑 e2e 2 passed（浅色 763ms / 深色 617ms）。
- t321_gen_f002（typecheck 断裂）→ **仍消除**。本轮重跑 `npx tsc --noEmit` exit 0、0 error。
- t321_gen_f003（AC-004 无护栏）→ **仍消除**。测试 :141-159 未选中态采样（bg 透明 / fg 异于选中 / border 非透明）随 e2e 通过。
- t321_gen_f004（AC-001 未断 accent 值）→ **仍消除**。测试 :118-126 accent probe 强等比对，随 e2e 通过。
- t321_gen_f005 → **已撤回**（Round 2 撤回记录有效，未复活）。
- t321_gen_f006（spec 测试策略 ≥4.5）→ **仍消除**。spec.md:81 现为 ≥3.0。
- t321_gen_f007（可测试性声明 / 测试策略残留「与卡片背景非同色」）→ **已消除**。核实现状：
    - AC-003 正文（spec.md:42）：「computed `color` 与按钮最终背景（accent 实底）非同色」。
    - 可测试性声明（spec.md:55）：「与按钮最终背景（accent 实底）不同色」。
    - 测试策略（spec.md:81）：「文字与最终背景对比度 ≥ 3.0、文字与最终背景非同色」。
    - 三处均讲「最终背景非同色」，`grep -n "卡片背景" spec.md` 无命中（exit=1）。spec diff（HEAD 4fab04ab → 工作区）确认 f007 改动仅落在 :55 / :81 两行，与 scope 指纹 e00be8→b2e92d 的变化范围一致。

### 本轮新发现

### t321_gen_f008 - 测试注释残留「文字与卡片背景非同色」，与实际断言及修正后 AC-003 措辞不符

- 严重度：minor
- 锚点：f007 处置的一致性复核（测试注释侧）；行为无偏差，纯注释过时
- 位置：`tests/e2e/web/trend_window_button_contrast.spec.ts:128`
- 问题：注释「AC-002/003: 文字与最终背景对比度 ≥3.0，且文字与卡片背景非同色」后半句仍用「卡片背景」。下方 :137-139 实际断言 `sample.fg != sample.bg`，其中 `sample.bg` 是 `sample_contrast` 沿祖先链解析到的不透明底——选中按钮为 accent 实底，故比对对象是按钮最终背景而非卡片背景。措辞与修正后 AC-003（最终背景）相抵，属 f007 处置的注释侧遗漏。
- 建议：把注释后半句改为「文字与最终背景非同色」。

### 结论

- 前轮 finding 复核：f001-f004 仍消除（重跑 tsc / e2e 实证）；f005 撤回有效；f006 仍消除；f007 已消除（spec 三处一致）。
- 本轮新发现：1 条（f008，minor，纯注释）。
- 未进表的提示：ProviderAccountRow.tsx 自 Round 2 无新改动（diff 仍为 `cn()` 接线 7+/7-）；spec 变更仅可测试性声明 :55 与测试策略 :81 两行措辞，为 f007 处置落地。
- 总体判断：无未解决 critical / important，仅有 minor 注释问题，PASS。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- AC-001：`re_verified`——重跑 e2e 2 passed；测试 :115-126 断 bg 非透明且等于 `--color-accent` 解析值。
- AC-002：`re_verified`——重跑 e2e 浅/深两主题经亮度守卫（dark<0.05 / light>0.5）后断对比度 ≥3.0，均通过。
- AC-003：`re_verified`——测试 :137-139 断 `fg != sample.bg`（最终背景），与修正后 AC-003（spec.md:42/:55/:81 三处一致）吻合。
- AC-004：`re_verified`——测试 :141-159 采样未选中按钮 bg 透明 / fg 异于选中 / border 非透明，符合 AC-004。

coverage = 4 / 4

verdict: PASS
