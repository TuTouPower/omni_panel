# Task review t301（reviewer_focus: 测试）

- task：`t301_ui_token_alignment_pack`
- spec：`docs/tasks/t301_ui_token_alignment_pack/spec.md`
- diff_anchor：`5eee818d6ee62562c218e25896dd0640c8ed76e0`
- target：`git diff 5eee818d6ee62562c218e25896dd0640c8ed76e0`
- round：Round 1
- reviewed_at：2026-08-11 12:01 CST

## Findings

### t301_test_f001 - Switch 开态圆钮位移/尺寸未断言

- 严重度：minor
- 锚点：AC-001（Switch 尺寸裁决）；非阻断
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx:107-126`
- 问题：Switch 两态断言覆盖关态 track（`h-[22px] w-[38px]` + `bg-[var(--color-surface-raised)]`）与开态 track 色（`bg-[var(--color-success)]`），有效触达 `Switch.tsx:17-19` 的尺寸与三元底色。但开态圆钮平移量 `translate-x-[16px]`（`Switch.tsx:30`）与圆钮尺寸 `h-[18px] w-[18px]`（`Switch.tsx:29`）同为 task.md 裁决项（「圆钮 18px、开态 translate-x-[16px]（38−2×2−18）」），单测未断言。属可选扩展 case，不影响六项对齐的核心验证。
- 建议：开态 rerender 后补一条圆钮位移断言，例如对 `container.querySelector("span")` 断言 `translate-x-[16px]`。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（本轮为 Round 1）
- 改测方向复核：无「迁就实现」改测。逐处核验：
    - Progress `h-1→h-[6px]`、`h-6→h-[22px]`（`ui.test.tsx:196,199`）：spec AC-001 将 Progress 尺寸对齐纳入范围，`progress-track` height 6px / `progress-capsule` height 22px 是 DESIGN.md token 直接值，非实现临时输出；若实现未改，新断言失败，说明断言有效守卫 spec。task.md 已记录 t269 交付期中间态→token 语义的理由。属「新增覆盖新语义」的合法更新，非把旧预期改成当前实现输出。
    - Switch 测试（`ui.test.tsx:107-126`）：旧断言（`aria-checked` false、click 后 `checked=true`）原样保留未弱化；新增 rerender 开态断言验证生产逻辑三元 `checked ? "bg-[var(--color-success)]" : "bg-[var(--color-surface-raised)]"`（`Switch.tsx:19`）。有效。
    - Badge 测试（`ui.test.tsx:206-219`）：`const count` refactor 保留 `rounded-full` 断言并新增 primary-container/primary；label 变体 `rounded-md` 原样保留。
    - Menu / Dialog / Button 测试：纯新增断言，无删改既有 expect。
- 本轮新发现：1 条（f001，minor）
- 未进表的提示：
    - Dialog `motion-reduce:animate-none` 未断言（无障碍细节，可选）。
    - Dialog 动画断言用类前缀 `toContain("animate-[dialogIn")`，未断言 160ms 时长参数；前缀足够区分 dialogIn 类存在，不构成弱化。
    - Menu hover 断言为静态类断言，未做真实 hover 交互（`fireEvent.mouseOver`）；类断言已直接触达 `Menu.tsx` 生产类链，语义成立。
- 总体判断：六项对齐的关键断言（Switch 两态、Badge count、Menu hover、Button font-semibold、Dialog 动画、Progress 尺寸更新）全部有效触达生产逻辑，无假绿；危险模式扫描零命中；仅有 1 条 minor，无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: e77c7803e83b06ae
