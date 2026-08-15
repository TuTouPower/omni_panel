# Task review t418（reviewer_focus: 通用）

- task：`t418_usage_color_single_source`
- spec：`docs/tasks/t418_usage_color_single_source/spec.md`
- diff_anchor：`22d51152b6a411c104c7568c5727e1460305c7dd`
- target：`git diff 22d51152b6a411c104c7568c5727e1460305c7dd`
- round：1
- reviewed_at：2026-08-16 05:35 UTC+8

reviewed_scope: 5c8780c38451cf85

## Findings

### t418_gen_f001 - 设置页组件测试 mock 复制五档 accent hex，形成第三份副本

- 严重度：minor
- 锚点：AC-002 边界（源码侧副本已清除，测试 mock 侧仍持有同值副本，不阻断）
- 位置：`tests/unit/renderer/views/settings_view_general.test.tsx:33-36`
- 问题：`vi.mock("../../../../src/renderer/lib/theme")` 的工厂内硬编码 `ACCENT_PRESET_COLORS: ["#3d7afd", "#6f5cf6", "#0ea5a3", "#f5772f", "#e23744"]` 与 `DEFAULT_ACCENT_COLOR: "#3d7afd"`。theme.ts 五档值将来调整时该 mock 静默漂移，组件测试照常绿。链接性已由 `t418_color_single_source.test.ts` 源码断言覆盖，故不定 important。
- 建议：mock 值改用占位（如 `["#aaaaaa", ...]`），或 `vi.importActual` 取真实常量后仅覆盖 `apply_accent` / `useTheme`。

### t418_gen_f002 - 九色 hex 源码清零断言只覆盖 9 色中的 5 色

- 严重度：minor
- 锚点：AC-001 的 grep 断言（规格上下文区测试策略：「grep 断言 hex 数组清零」）
- 位置：`tests/unit/renderer/lib/usage-colors.test.ts:76`
- 问题：`not.toContain` 清单仅 `#5B8CFF / #5b8cff / #8B72F8 / #46C7C7 / #A7D8D8`，缺 `#7EA2FF`、`#A18CFF`、`#72D4D1`、`#9CB8FF`、`#B6A7FF` 及各自小写变体；`usage-colors.ts` 与 `settings-view/lib.ts` 若残留这 5 色之一不会红。返回值层面已有 `/^var\(--color-usage-[1-9]\)$/` 正则断言兜底，故仅 minor。
- 建议：将 9 色全量（含小写）列入清零断言，或直接断言两文件不含 `#[0-9a-fA-F]{6}` 形态。

## 结论

- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 范围外观察（不进 finding 表）：`src/renderer/components/Icon.tsx:274` 与 `src/renderer/lib/echarts_token_resolver.ts:56,92,98` 仍持有 accent hex 副本。ECharts resolver 属 spec 明示「不动」范围；Icon.tsx 为既有兜底。AC-002 字面「只存在于 lib/theme.ts」在仓库级未严格成立，但契约区范围只要求 `appearance_section.tsx` 收口，实现与范围一致，如需字面成立应改 spec 表述或另立 task。
    - about 页 tint 改用 `var(--color-accent-*)` 后，dark 模式下这些 token 在 `globals.css:232-236` 翻转为 dark 变体（如 `#3d7afd` → `#5b8dff`），tint 观感在 dark 下相对原静态 hex 有变化。属 token 语义映射的合理结果，但 AC-004 的 `[deploy]` 目检只写「配色预览、用量条九色渲染」，建议目检时一并看一眼 about 页 dark 观感。
    - 文件过大/复杂度：diff 净 +175/-49，无超限迹象。
- 总体判断：契约区范围全部落实，九色/accent/about tint 均已收口到 token 或 theme.ts 唯一来源，全量单测 3326 通过；仅 2 条 minor，无 blocking。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified`。grep 确认九色 hex 在 `src/` 代码中清零（仅剩 `globals.css:38-46` token 定义与 DESIGN.md 真相源）；`usage-colors.ts:10-20` 只持 `var(--color-usage-N)`；`settings-view/lib.ts:49` swatch 复用 `USAGE_COLOR_TOKENS`；`usage-colors.test.ts` 与 `t418_color_single_source.test.ts` 重跑通过。
- AC-002：`re_verified`。`theme.ts:31-47` 为唯一映射表并导出 `ACCENT_PRESET_COLORS` / `DEFAULT_ACCENT_COLOR`；`appearance_section.tsx:7-19,46` 只引用导出、无 hex；grep `src/` 确认源码侧无第二份五档副本（范围外项见上）。
- AC-003：`re_verified`。`about_section.tsx` 8 处 tint + `#fff` 全部改为 `var(--color-accent-*)` / `var(--color-on-primary)`；grep 确认文件内无裸 hex；所引 token 在 `globals.css:14,16-20` 均有定义。
- AC-004：`trust_prior`（观感目检 `[deploy]` 部分）。单测部分 `re_verified`：`provider_card_colors.test.tsx` 断言 bar fill 与 `usage_color()` 输出一致、swatch 与 token 一致，重跑 57/57 通过；观感目检依赖实施侧人工证据。
- AC-005：`re_verified`。本 worktree 内 `npx vitest run` 全量：277 文件通过、3326 测试通过（1 文件 / 9 用例为既有 skip，diff 未新增 `.skip`/`.only`）。

coverage = 4 / 5（trust_prior 占比 20%）

verdict: PASS

## Round 2

- round：2
- reviewed_at：2026-08-16 05:38 UTC+8

reviewed_scope: ab3a0ceb56873407

### 前轮 finding 复核

- t418_gen_f001：已消除。`settings_view_general.test.tsx` 的 theme mock 改为 `async (importOriginal) => ({ ...actual, useTheme, apply_accent })`，不再硬编码五档 hex 副本；`ACCENT_PRESET_COLORS` / `DEFAULT_ACCENT_COLOR` 来自真实模块。
- t418_gen_f002：已消除。`usage-colors.test.ts` 九色清零断言改为 `not.toMatch(/#[0-9a-fA-F]{6}/)`，覆盖任意 6 位 hex 字面量，不再只列 5 色。

## Findings

（Round 2 无新 finding）

## 结论

- 前轮 finding 复核：f001 / f002 均已消除
- 本轮新发现：0 条
- 未进表的提示：无（范围外观察同 Round 1，不重复）
- 总体判断：修复后 diff 指纹更新；契约区 AC 仍全部落实；无 blocking / minor 新项
- 系统性 follow-up：无

### AC 复验方式

- AC-001~003、AC-005：`trust_prior`（Round 1 re_verified，本轮仅测侧 mock/断言加固，生产路径未改）
- AC-004：`trust_prior`（观感 [deploy] 不变）

coverage = 0 / 5 新复验（本轮仅复核 finding 修复；trust_prior 全量沿用 Round 1）

verdict: PASS

## Round 3

- round：3
- reviewed_at：2026-08-16 05:40 UTC+8

reviewed_scope: b7ca570157498b49

### 前轮 finding 复核

- t418_gen_f001 / f002：仍已消除（生产与测试路径相对 Round 2 无再改）

## Findings

（Round 3 无新 finding）

## 结论

- 前轮 finding 复核：f001 / f002 仍消除
- 本轮新发现：0 条
- 未进表的提示：本轮 diff 增量仅为 `docs/specs/usage_color_single_source.md` 与 `docs/specs_index.md` 收尾入库，无生产逻辑变更
- 总体判断：收尾文档入指纹后重审 PASS
- 系统性 follow-up：无

verdict: PASS
