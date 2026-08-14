# Task review t381（reviewer_focus: 通用）

- task：`t381_session_rail_bg_hierarchy`
- spec：`docs/tasks/t381_session_rail_bg_hierarchy/spec.md`
- diff_anchor：`b9468211306ca5aea172c0516a88b0d1cb6b9c41`
- target：`git diff b9468211306ca5aea172c0516a88b0d1cb6b9c41`
- round：1
- reviewed_at：2026-08-15 04:04 UTC+8

## Findings

### t381_gen_f001 - rail-toggle-row 混色改动无独立断言

- 严重度：minor
- 锚点：AC-003（spec 契约区「rail-toggle 背景改为同款混色」，任务背景明确 row+button 均改）
- 位置：`src/renderer/components/session-shell/SessionShell.tsx:107`
- 问题：AC-003 测试只断言按钮 `.session-rail-toggle`（`SessionShell.test.tsx:245-248`），row（`.session-rail-toggle-row`）背景同步改为混色但无测试触达。若 row 背景单独回归为 `bg-[var(--color-surface)]`，无任何测试挂住。
- 建议：可选。在 t380 测试的 row 元素上补一条 `toContain("color-mix")` + `not.toContain("bg-[var(--color-surface)]")`；AC-003 按 spec 措辞仅约束按钮，非门禁缺口。

### t381_gen_f002 - 混色断言不含具体百分比

- 严重度：minor
- 锚点：AC-001/AC-003
- 位置：`tests/unit/renderer/components/workspace/SessionRail.test.tsx:150-152`、`tests/unit/renderer/components/session_shell/SessionShell.test.tsx:246-248`
- 问题：断言仅验证 `color-mix` 与 `var(--color-surface-window)` 存在、`bg-[var(--color-surface)]` 缺失；spec 范围区固定的 `_70%` / `_8%` 两个百分比不被捕获。改动百分比（如 50%/50%）测试仍绿。AC 语义仅要求「color-mix + surface-window」存在，当前覆盖按 AC 已足。
- 建议：可选。如需锁定 Settings 同款混色值，断言完整 token 字符串 `color-mix(in_srgb,var(--color-surface-window)_70%,var(--color-surface)_8%)`。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - `color-mix` 70%+8%=78%<100%，按 CSS 规范其余 22% 以透明填充；混合结果贴到父级 `--color-surface-window` 上近似「90% window + 10% surface」，暗于主面板、亮于卡片，符合「浅色卡片 + 深色间隙」层级。该值与 `SettingsView.tsx:435` 逐字一致，属 spec 要求的既有模式，非缺陷。
  - AC-002 测试 `querySelector(".session-slot:not(.session-slot-empty)")` 取首个非空槽位，base fixture 两个非空槽位 token 相同，无误。
  - `bg-[var(--color-surface)]` 排除断言不受 `hover:bg-[var(--color-surface-raised)]`、`bg-[color-mix(...var(--color-surface)_8%)]` 子串干扰（`bg-[` 后直接跟 `var(` 才匹配），断言精确。
- 总体判断：四条 AC 全部实现且与 spec 逐字对应；混色值与 Settings 侧边栏一致；空槽位 `bg-transparent` + dashed 未动；t380 rail-toggle 下移结构（`session-rail-toggle-row`、非标题栏内、折叠行为）不受影响，SessionShell 11 条测试含 t380 断言全绿；mutation 还原 bg-surface 会同时挂 `toContain("color-mix")` 与 `not.toContain("bg-[var(--color-surface)]")`，声明可信。无未解决 critical/important，仅 2 条 minor 属加强建议，判定 PASS。
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: d6f0ccc5f2b0c039

---

## Round 2

- round：2
- reviewed_at：2026-08-15 04:05 UTC+8

## Findings（Round 2 追加）

### t381_gen_f001 - rail-toggle-row 混色断言已补

- 严重度：已消除
- 位置：`tests/unit/renderer/components/session_shell/SessionShell.test.tsx:246-252`
- 复核：f001 修复新增 `row_cls = toggle.closest(".session-rail-toggle-row")?.className ?? ""`，断言含 `color-mix`、不含 `bg-[var(--color-surface)]`。与源码 `SessionShell.tsx:107` row 背景 `bg-[color-mix(in_srgb,var(--color-surface-window)_70%,var(--color-surface)_8%)]` 精确对应。`?? ""` 兜底 closest 空值；`not.toContain("bg-[var(--color-surface)]")` 不被 `bg-[color-mix(...var(--color-surface)_8%)]` 子串误伤（`bg-[` 后跟 `color-mix`）。row 背景单独回归为 `bg-[var(--color-surface)]` 时此断言挂。已消除。

### t381_gen_f002 - 混色断言不含具体百分比

- 严重度：minor（维持）
- 复核：按 AC 语义仅要求「color-mix + surface-window」存在，当前断言覆盖已足；spec 范围区固定的 `_70%/_8%` 属实现细节，不改判。

## 结论（Round 2）

- 前轮 finding 复核：f001 已消除（补 row 容器断言）；f002 维持 minor（按 AC 语义覆盖已足，非门禁缺口）
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：f001 修复精确触达 row 容器可观察 className，无新问题；SessionRail 7 + SessionShell 11 测试全绿。无未解决 critical/important，判定 PASS
- 系统性 follow-up：无

verdict: PASS
reviewed_scope: ca417527a02b36f5
