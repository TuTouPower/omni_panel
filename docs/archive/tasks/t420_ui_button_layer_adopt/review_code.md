# Task review t420（reviewer_focus: 代码）

- task：`t420_ui_button_layer_adopt`
- spec：`docs/tasks/t420_ui_button_layer_adopt/spec.md`
- diff_anchor：`7c71df8aa891467a3c61987309f8094a2f66a6e8`
- target：`git diff 7c71df8aa891467a3c61987309f8094a2f66a6e8`
- round：1
- reviewed_at：2026-08-16 06:09 UTC+8

reviewed_scope: 191eb643beafdd3e

## Findings

### t420_code_f001 - session-id 复制钮字号漂移（11px/11.5px → 12.5px）

- 严重度：important
- 锚点：AC-004「按钮外观与点击行为不回归」。两处 session-id 复制钮改走 `Button variant="text"` 后，默认 size `inline` 带 `text-[12.5px]`（`Button.tsx:59`），调用点 className 只覆盖了 padding/字重/颜色，未覆盖字号，文字实际变大。
- 位置：
    - `src/renderer/components/workspace/SessionPane.tsx:201`（原钮继承父级 `conversation-title` 的 `text-[11px]`，见 SessionPane.tsx:176）
    - `src/renderer/components/session-library/SessionCard.tsx:111`（原钮继承父级 `library-card-meta` 的 `text-[length:var(--text-label-md)]` = 11.5px，globals.css:116）
- 问题：替换前两处按钮均无显式字号类、继承父级 11px / 11.5px；替换后 `sizes.inline` 的 `text-[12.5px]` 无冲突类可消（className 中无 text-size），session id 文字渲染变大 1~1.5px。属未声明的外观变化，spec 仅批准 AliasEditor 的 bg 收敛例外。
- 建议：最小修复——两处调用点 className 补回原字号（SessionPane 补 `text-[11px]`，SessionCard 补 `text-[length:var(--text-label-md)]`）；或给 text variant 加不带字号的子档。

### t420_code_f002 - 16px 移除钮圆角 rounded(4px) → rounded-md(6px)

- 严重度：minor
- 锚点：AC-004 观感项（[deploy] 目检覆盖范围）。替换后 base 的 `rounded-md` 未被 className 覆盖，圆角从 4px 变 6px。
- 位置：
    - `src/renderer/components/session-library/SelectionDock.tsx:37`（原为 `rounded`）
    - `src/renderer/components/workspace/SelectionTray.tsx:132`（原为 `rounded`）
- 问题：16×16 的 × 钮圆角变大 2px，属未声明的外观微变；不影响功能与可达性。
- 建议：两处 className 补 `rounded`，或接受差异后在 task.md 声明。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：2 条（important ×1，minor ×1）。
- 未进表的提示：
    - 键盘可达性测试（ui.test.tsx「Button 键盘可达」）用 `fireEvent.keyDown` 后手动 `fireEvent.click` 补触发，未真正验证 Enter/Space→click 的原生映射；属测试层范畴，交 test reviewer 判定。
    - `variant="text"` 在 SessionCard/SessionPane/NetBanner 三处被 className 大量反向覆盖（`p-0`/`font-normal`/`hover:bg-transparent`/颜色），variant 实际只剩 `bg-transparent` 生效；可作为后续 variant 语义收敛观察，非本轮 finding。
    - 文件过大：无命中（Button.tsx 110 行；ui.test.tsx 548 行 < 600 阈值）。圈复杂度：无命中（新增函数均为 ≤3 分支的小函数）。
- 总体判断：功能替换与 as-link 能力实现完整、AC-001/002/003/005 独立复验通过，但存在一处违反 AC-004「外观不回归」的字号漂移（f001），修复前本 task 不可信。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified` — 对 `src/renderer` 全量 grep 审计配方串（`ACTION_CLS`、`hover:bg-[color-mix(in_srgb,var(--color-accent)_10%`、`bg-[var(--color-field-bg)] px-2.5 py-1.5 text-[12px]`、`flex h-[26px] w-[26px] ... rounded-md`），仅 Button.tsx 自身定义命中；剩余原生 `<button>` 均为大纲行/趋势切换/卡片选择等 spec 非范围形态。
- AC-002：`re_verified` — `Button as="a"` 渲染原生 `<a>`（Button.tsx:88-95）；EmptyState.tsx:26 与 about_section.tsx as-link 分支均走组件，`no-underline` 由组件层统一追加。
- AC-003：`re_verified` — 多行 grep `<span\b[^>]*\bonClick=` 在 `src/renderer` 零命中；NetBanner「重新连接」与 provider_card_states 三处伪按钮均改语义 `<button type="button">`。
- AC-004：`trust_prior` — 观感目检标 `[deploy]` 无法自验；组件测试部分已重跑通过，但代码比对发现 f001/f002 两处外观漂移，见 finding。
- AC-005：`re_verified` — `pnpm test` 3329 passed / 9 skipped（277+1 文件）；`pnpm typecheck` 绿；13 个变更源码文件 eslint 绿。

coverage = 4 / 5

verdict: FAIL

______________________________________________________________________

# Task review t420（reviewer_focus: 代码）Round 2

- task：`t420_ui_button_layer_adopt`
- spec：`docs/tasks/t420_ui_button_layer_adopt/spec.md`
- diff_anchor：`7c71df8aa891467a3c61987309f8094a2f66a6e8`
- target：`git diff 7c71df8aa891467a3c61987309f8094a2f66a6e8`
- round：2
- reviewed_at：2026-08-16 06:12 UTC+8

reviewed_scope: f48f44028114d548

## Findings

本轮零 finding。

## 结论

- 前轮 finding 复核：
    - **t420_code_f001（已消除）**：SessionPane session-id className 含 `text-[11px]`；SessionCard session-id 含 `text-[length:var(--text-label-md)]`，与替换前继承字号一致。
    - **t420_code_f002（已消除）**：SelectionDock / SelectionTray 16px 移除钮 className 含 `rounded`，覆盖 base `rounded-md`。
- 本轮新发现：0。
- 未进表的提示：`variant="text"` 在 session-id/NetBanner 仍靠 className 反向覆盖 padding/字重/色，属形态收敛观察项，非回归缺陷。
- 总体判断：Round 1 两处外观漂移已修；AC-001~003/005 实现层合规；AC-004 组件层可测部分已对齐，观感 [deploy] 目检保留 trust_prior。

### AC 复验方式

- AC-001：`re_verified` — 审计配方 grep 业务代码零命中（Button.tsx 自身除外）。
- AC-002：`re_verified` — EmptyState / about_section 走 `as="a"`。
- AC-003：`re_verified` — 无 span onClick；动作钮为 button/a。
- AC-004：`re_verified`（组件层字号/圆角）+ `trust_prior`（[deploy] 目检）。
- AC-005：`trust_prior` — Round 1 全量绿；本轮定向 ui/SessionCard/SessionPane 74 passed + typecheck 绿。

coverage = 5 / 5

verdict: PASS

---

# Task review t420（reviewer_focus: 代码）Round 3

- task：`t420_ui_button_layer_adopt`
- diff_anchor：`7c71df8aa891467a3c61987309f8094a2f66a6e8`
- round：3
- reviewed_at：2026-08-16 06:15 UTC+8

reviewed_scope: 79610e4984db4920

## Findings

本轮零 finding。

## 结论

- 相对 Round 2 仅增量：`docs/specs/ui-component-library.md` / `docs/specs_index.md` 收尾累积，`docs/findings/d045_*.md` 登记；生产与测试代码相对 Round 2 无改动。
- Round 1 f001/f002 消除结论不变；无新代码 finding。
- 总体判断：实现与文档收尾一致，可信。

verdict: PASS
