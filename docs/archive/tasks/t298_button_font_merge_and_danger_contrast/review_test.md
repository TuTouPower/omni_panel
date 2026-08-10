# Task review t298（reviewer_focus: 测试）

- task：`t298_button_font_merge_and_danger_contrast`
- spec：`docs/tasks/t298_button_font_merge_and_danger_contrast/spec.md`
- diff_anchor：`f777c0f5a6bc66956e106772ce1baefd06197f88`
- target：`git diff f777c0f5a6bc66956e106772ce1baefd06197f88`
- round：1
- reviewed_at：2026-08-11 04:13 UTC+8

## Findings

### t298_test_f001 - AC-001 变体覆盖不全：仅断言 primary，secondary/danger 未渲染断言

- 严重度：minor
- 锚点：AC-001（standard 尺寸 primary/secondary/danger 字号 + primary/danger 文字色）
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx:261-268`（test "Button standard 字号类不被 tailwind-merge 吞"）
- 问题：新用例只渲染默认 `<Button>save</Button>`（primary variant）。字号类 `text-[length:var(--text-body-md)]` 位于 `sizes.standard`（`Button.tsx:30`，变体无关），单次渲染在代码路径上已覆盖全部变体的字号；但 AC-001 枚举的 secondary/danger 两变体未渲染断言字号类，且 danger 的 `text-[var(--color-on-primary)]` 与字号类共存关系无断言。d032 根因正是自定义字号类与颜色类的 twMerge 冲突，danger 变体文字色（`Button.tsx:22`）是 AC-001 明确要守护的点，现无回归测试锚定。
- 建议：对 secondary、danger 两变体各加一条渲染断言（danger 断言 `text-[var(--color-on-primary)]` 与字号类共存；secondary 断言字号类存在），与 primary 同构。

### t298_test_f002 - AC-002 验证 token 值而非渲染实测，danger 按钮类链为假设未断言

- 严重度：minor
- 锚点：AC-002（暗色主题 danger 按钮白字 vs 底对比 ≥ 3.0，computedStyle 实测）
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx:270-288`（test "danger 按钮暗色白字对比 ≥ 3.0"）
- 问题：测试读取 `globals.css` 的 `--color-error-dark`（= #f0564d）计算与 #fff 对比 = 3.42 ≥ 3.0。该 token 确为暗色真值（`.dark` 块 `--color-error: var(--color-error-dark)`，`globals.css:219`；danger 按钮 `bg-[var(--color-error)]`，`Button.tsx:22`），且对比函数为正确 WCAG 相对亮度公式——AC-002 核心不变式已覆盖、token 回退到 #ff6b6b 会 FAIL。但实现走的是「源码 token 值 + 数学计算」，非 AC 字面的 computedStyle 实测；且 `bg→error-dark`、`text=#fff` 整条渲染链（`--color-on-primary: #ffffff` 常亮，`globals.css:14`）为代码阅读假设，未断言 danger 按钮渲染产物同时含 `bg-[var(--color-error)]` 与 `text-[var(--color-on-primary)]`。若未来按钮类链被改（如 bg 改指其它 token），本测试不感知。
- 建议：可选在 Test 1 处补 danger 变体渲染断言（bg-error + text-on-primary 共存）；如需 AC 字面的 computedStyle 实测，扩展 t283 e2e 取样 ConfirmDelete 场景的真实 danger 按钮（见结论 follow-up）。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无。diff 对既有测试仅新增 2 个 it 块（`ui.test.tsx:261-288`），未修改任何既有断言，无「迁就实现」式改测
- 本轮新发现：2 条（均 minor，非阻断）
- 未进表的提示：
    - AC-001 用 className 断言而非 computedStyle：**可接受**。jsdom 的 getComputedStyle 不解析 CSS 变量（对 `var(--text-body-md)` 返回原始字符串）且不加载 Tailwind 构建产物，13.5px 字面断言在单测环境不可行；className 断言触达 `cn()`+twMerge 生产路径，d032 回归（字号类缺失）会 FAIL，`--text-body-md`=13.5px 的值由 designmd:check 守护。与 spec「测试策略」声明的 computedStyle 断言存在方法偏差但结果可信，建议在 task.md 记录偏差理由。
    - AC-002 已真测暗色值：读取的正是 `--color-error-dark`（暗色 token 真值，非浅色 `--color-error`=#ef4444）。对比函数正确：sRGB 线性化 + WCAG 亮度加权，白 vs #f0564d = 3.42 ≥ 3.0，余量 0.42，非阈值掩盖。
    - AC-003：designmd:check 本人运行通过（drift check passed）；全量 `pnpm test` 实测 2857 passed / exit 0。drift check 是 CLI 门禁而非单测，无单测覆盖要求，测试侧不缺席。
    - Test 2 的 `if (!bg) return;`（`ui.test.tsx:276`）为死代码：前置 `expect(m).not.toBeNull()`（:274）已保证匹配非空、`m[1]` 必为 6 位 hex，当前无静默通过路径。建议删除该守卫，避免未来误删前置 expect 后变静默通过。
    - 2 个新用例置于 describe「ui 组件库构建产物（t269 AC4）」块内，语义属组件行为测试而非构建产物，可选移出到 t269 行为块。
- 总体判断：AC-001/002/003 均有对应测试且全部实测通过（ui 22 tests、designmd:check、全量 2857 tests）；仅 2 条 minor 覆盖扩展建议，无未解决 critical / important
- 系统性 follow-up：建议扩展 `tests/e2e/web/ui_component_theme.spec.ts`（t283）补 danger 按钮 computedStyle 对比取样（ConfirmDelete 场景），避免「未取样 danger 故未红」（t283 教训）重演。slug 建议 `e2e_danger_button_contrast_sample`，非阻断

verdict: PASS

reviewed_scope: 3c9273c886682805

## Round 2 (2026-08-11 04:15 UTC+8)

### 前轮 finding 复核

- **t298_test_f001（已修）**：Test 1 现循环渲染 primary/secondary/danger 三 variant（`ui.test.tsx:264-273`），每变体断言 `text-[length:var(--text-body-md)]` 共存，并按 variant 断言文字色：secondary → `text-[var(--color-on-surface)]`（与 `Button.tsx:21` 一致），primary/danger → `text-[var(--color-on-primary)]`（与 `Button.tsx:19,22` 一致）。AC-001 变体覆盖补齐。
- **t298_test_f002（已修）**：Test 2 补 danger 渲染类链断言（`ui.test.tsx:283-286`）——`bg-[var(--color-error)]` + `text-[var(--color-on-primary)]`，将「bg→error-dark、text=#fff」从代码阅读假设改为渲染断言锚定；`if (!bg) return;` 死代码已删（`:281` 改 `const bg = m?.[1] ?? "";`）。若前置 `expect(m).not.toBeNull()` 未来被误删，`bg=""` 时 `lum("")=NaN` → `expect(NaN).toBeGreaterThanOrEqual(3.0)` 仍 FAIL，不构成静默通过。

### 危险模式扫描（新增代码）

- 循环断言数组为字面量非空，无静默空转风险。
- `if (variant === "secondary") … else …` 为双分支明确映射，非「前置不满足无证据仍 PASS」的条件跳过，不命中危险模式。
- 无 `.skip`/`.only`/`@ts-ignore`；断言强度未弱化（`toContain` + `toBeGreaterThanOrEqual(3.0)` 维持）。
- 实测：`npx vitest run tests/unit/renderer/components/ui/ui.test.tsx` 22 passed；`pnpm typecheck` exit 0。

### 结论

- 前轮 finding 复核：f001、f002 均已按建议修复，无修不彻底或换形式弱化
- 改测方向复核：无。Round 2 改动仅扩展新增测试的覆盖（多 variant 循环 + 类链断言 + 删死代码），未触碰既有断言预期，无「迁就实现」式改测
- 本轮新发现：0 条
- 未进表的提示：无新增
- 总体判断：前轮 2 条 minor 已确认消除，无未解决 critical / important
- 系统性 follow-up：同 Round 1（建议扩展 t283 e2e 补 danger 按钮 computedStyle 对比取样），非阻断

verdict: PASS

reviewed_scope: ed39972e21fd0097

## 最终记录 (2026-08-11 UTC+8)

收尾文档同步：`docs/specs/ui_component_theme_contrast.md` 行为节补 danger 暗色对比 ≥ 3.0 约束（error-dark 调暗至 `#f0564d`，与本次实现一致）；`docs/specs_index.md` 的 `ui-component-theme-contrast` 行追加 t298。仅文档，无逻辑/测试变更，不影响本测试审阅结论。

- 前轮 finding 复核：f001、f002 已在 Round 2 确认消除，本轮无新测试改动
- 改测方向复核：无
- 本轮新发现：0 条
- 总体判断：无未解决 critical / important

verdict: PASS

reviewed_scope: 960a4d0bb9f5731a
