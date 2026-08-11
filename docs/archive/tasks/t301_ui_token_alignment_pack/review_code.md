# Task review t301（reviewer_focus: 代码）

- task：`t301_ui_token_alignment_pack`
- spec：`docs/tasks/t301_ui_token_alignment_pack/spec.md`
- diff_anchor：`5eee818d6ee62562c218e25896dd0640c8ed76e0`
- target：`git diff 5eee818d6ee62562c218e25896dd0640c8ed76e0`
- round：1
- reviewed_at：2026-08-11 12:10 UTC+8

## 审查方式

- diff 范围核实：8 个源文件（6 组件 + globals.css + ui.test.tsx）+ task.md 工作区记录，无范围外改动。
- 基准验证：`pnpm designmd:check` drift passed（AC-002）；`vitest run ui.test.tsx` 24 passed（AC-003 定向）。
- 构建产物核对：`out/renderer/assets/index-fyyIt0NA.css` 含 `animation:dialogIn .16s var(--motion-easing)` 与 `@keyframes dialogIn` 转义体。
- 逐项对照 DESIGN.md：switch-track/switch-track-on、badge-count、progress-track/progress-capsule、按钮节「字重 600」、menu-item-hover、Motion/Components 160ms 上浮淡入，均与实现类一致；改动组件无 `dark:` 变体。
- tailwind-merge 关注点：新增类均为 `bg-*` / `hover:bg-*` / `hover:text-*` / `animate-*` 组，与既有 `text-[length:var(--text-*)]` 字号类不冲突，未引入新的被吞风险（该机制为 t302/d032 既有验证范围）。

## Findings

### t301_code_f001 - Switch 开态圆钮 translate-x 计算错误，右侧留 4px 不对称间隙

- 严重度：important
- 锚点：行为缺陷——开态下圆钮未平移到轨道右缘，左右留白不对称
- 位置：`src/renderer/components/ui/Switch.tsx:30`
- 问题：开态 `translate-x-[16px]`。轨道 38px（`w-[38px]`，无 border、无 padding），圆钮 18px（`w-[18px]`），关态 `translate-x-0.5` = 2px（左右留白 2px 的既定基线）。开态对称平移应为 `38 − 18 − 2 = 18px`，现用 16px 导致右侧留白 `38 − 16 − 18 = 4px`、左侧 2px——开态圆钮悬在右缘内 2px，非贴齐。改前基线（36px 轨道 / 16px 圆钮 / `translate-x-[18px]`）是对称的，本 diff 引入几何回归。task.md 笔记自述公式「translate-x-[16px]（38−2×2−18）」按轨道存在 2px 边框推导，但组件轨道无 border 类，该前提不成立；正确值按同式去掉幻影边框为 18px。
- 建议：`translate-x-[16px]` 改为 `translate-x-[18px]`；顺带在 ui.test.tsx 的 Switch 用例补 `translate-x-[18px]` 断言（当前测试未覆盖圆钮偏移，故未拦下此回归）。

### t301_code_f002 - Switch 关态暗色主题圆钮对比度退化（近不可辨）

- 严重度：minor
- 锚点：可观测视觉退化——暗色关态圆钮几乎融入轨道
- 位置：`src/renderer/components/ui/Switch.tsx:19`（关态 `bg-[var(--color-surface-raised)]`）+ `Switch.tsx:29`（圆钮 `bg-[var(--color-surface-window)]`，既有值）
- 问题：关态轨道由 `on-surface-muted` 改为 DESIGN 指定的 `surface-raised`。暗色下轨道 `#262b34`、圆钮 `#181b22`（surface-window），对比约 1.23:1，圆钮近不可辨；改前 `#6c7382` 轨道对圆钮约 2.6:1 可辨。DESIGN「白色圆钮」与实际 `surface-window` 圆钮（暗色非白）不符——轨道色是 DESIGN 强制对齐项、实现正确，但本 diff 的轨道色变更把既有圆钮色的弱对比暴露出来。
- 建议：作裁决记录或 follow-up——将圆钮对齐 DESIGN「白色圆钮」（如独立白色 token / on-primary），修复暗色关态可辨性；圆钮色本身不在六项范围，可记 pending。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：2 条（f001 important，f002 minor）。
- 未进表的提示：文件大小——所有改动文件远低于阈值（组件 <70 行、ui.test.tsx 399 行），无；复杂度——未引入高分支函数，无；范围外观察——Dialog 动画 160ms 为 DESIGN Components 明确数值（非散落字面量），Menu danger hover `on-primary` 白字与 button-danger 同口径，均不列 finding。
- 总体判断：六项 token 对齐与 DESIGN.md 一致、明暗无 dark: 变体、动画 reduced-motion 处理正确、designmd/单测绿；但 Switch 开态圆钮平移几何错误（important，需修复），另有暗色关态圆钮对比度 minor。
- 系统性 follow-up：建议「Switch 圆钮色对齐 DESIGN 白色圆钮」（minor，阻断性低）；有 tid 时引用。

verdict: FAIL

## Round 2 (2026-08-11 12:10 UTC+8)

### 前轮 finding 复核

- **t301_code_f001（important，圆钮平移 16px 几何错）——已修，消除。**
    - 依据 diff：`src/renderer/components/ui/Switch.tsx:30` 现为 `checked ? "translate-x-[18px]" : "translate-x-0.5"`；38 − 18 − 2 = 18px，轨道无 border 的前提成立，开态左右留白对称（各 2px），与关态基线一致。
    - 测试补齐：`tests/unit/renderer/components/ui/ui.test.tsx` Switch 用例在开态 rerender 后 querySelector 圆钮 `span`，断言 `translate-x-[18px]`、`h-[18px]`、`w-[18px]`——真实 DOM 查询、非恒真，能拦截同型回归。
    - 实测：`vitest run ui.test.tsx` 24 passed。修复范围仅限平移值与测试，未引入新问题。
- **t301_code_f002（minor，暗色关态圆钮对比度）——仍存在。** 圆钮色未改（超出六项范围），作为 follow-up 维持，非阻断。

### 本轮新发现

- 0 条。

### 结论

- 前轮 blocker f001 已按 diff 核实消除，不采信自述、以代码为准；f002 minor 非阻断。
- 未进表提示：无新文件膨胀/复杂度/范围外改动。
- 总体判断：Switch 圆钮几何回归已修且测试覆盖到位；余项为 minor，当前无未解决 critical/important。
- 系统性 follow-up：维持「Switch 圆钮色对齐 DESIGN 白色圆钮」建议（minor）。

verdict: PASS

reviewed_scope: e77c7803e83b06ae
