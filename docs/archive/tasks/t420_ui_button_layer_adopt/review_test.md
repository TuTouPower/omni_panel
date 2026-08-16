# Task review t420（reviewer_focus: 测试）

- task：`t420_ui_button_layer_adopt`
- spec：`docs/tasks/t420_ui_button_layer_adopt/spec.md`
- diff_anchor：`7c71df8aa891467a3c61987309f8094a2f66a6e8`
- target：`git diff 7c71df8aa891467a3c61987309f8094a2f66a6e8`
- round：1
- reviewed_at：2026-08-16 06:08 UTC+8

reviewed_scope: 191eb643beafdd3e

## Findings

### t420_test_f001 - 「Enter/Space 触发」断言恒真：键盘事件无判别力，click 由手动 fireEvent 担保

- 严重度：important
- 锚点：spec 测试策略「键盘可达性（Enter/Space 触发）补断言」未被真实满足；关联 AC-003 键盘可达性证据
- 位置：`tests/unit/renderer/components/ui/ui.test.tsx`「Button 键盘可达：Enter/Space 触发 click（t420）」
- 问题：测试先 `fireEvent.keyDown/keyUp(Enter)`，随后**手动** `fireEvent.click(btn)`，再断言 `expect(clicks).toBeGreaterThanOrEqual(1)`；Space 段同构。reviewer 探针验证（同环境临时用例，已删除）：去掉手动 click 后，Enter 与 Space 的 keyDown/keyUp 在本 jsdom 环境下 clicks 均为 **0**——键盘事件本身不触发 click。因此两次 `>=` 断言被手动 click 担保恒真，键盘事件是纯装饰；无论 Button 键盘可达性如何退化，该测试都 PASS。命中危险模式「弱化断言（`>=` 掩盖）」与「程序赋值替代 AC 明确要求的键盘真实交互」。
- 建议：二选一。(a) 诚实化：删除装饰性 keyDown/keyUp，改断言 `toBe(1)`/`toBe(2)` 验证 onClick 通路，测试改名为「语义与 onClick」，键盘可达性证据由 `tagName === "BUTTON"` + `type="button"` + grep 无 span onClick 承担；(b) 用 `user-event` 的 `keyboard('{Enter}')` 等真实交互路径触发并精确断言次数（须先验证 jsdom/user-event 组合在本仓能驱动 click）。

## 结论

- 改测方向复核：无。本 diff 未修改任何既有测试，只新增 3 个 `it`；被替换位点所在组件的既有测试（SessionPane/SessionCard/SelectionTray/popup_view_re_login/settings_view_general 等）原样保留且定向重跑通过，无「迁就实现」的改测。
- 本轮新发现：1 条（t420_test_f001，important）。
- 未进表的提示：新增 grep 测试用相对路径 `src/renderer/components` / `src/renderer/views` walk，依赖 vitest 从仓库根启动（当前成立）；recipe 正则以「已知配方字面量」定义复制串，未来新形态配方需同步扩充。均为观察，不进表。
- 危险模式扫描：无删测试 / `.skip` / `.only` / 注释断言 / `eslint-disable` / mock 误用（本 diff 测试零 mock）；全套件 9 个 skipped 为存量，与本 diff 无关。除 f001 外无命中。
- AC 复验披露：
    - AC-001（re_verified）：diff 中 20 处复制体全部改走 `Button`；新增 grep 测试断言业务代码无 `ACTION_CLS` / accent hover / field-bg secondary / 26px icon 配方，全套件中该测试通过。
    - AC-002（re_verified）：新增组件测试断言 `as="a"` 渲染 `<a>`、href 透传、无 `<button>`；EmptyState 与 about_section 两处 primary 链接钮已走组件，about 既有 `about-card-*` 测试通过。
    - AC-003（re_verified，部分）：grep 测试断言无 `<span onClick>` 伪按钮通过，语义断言 `tagName === "BUTTON"` / `type="button"` 有效；但「Enter/Space 触发」断言无效，见 f001。
    - AC-004（trust_prior）：组件测试部分已独立重跑（6 个测试文件 123 passed）；`[deploy]` 目检抽查 reviewer 无法自证，依赖实施侧证据。
    - AC-005（re_verified）：`pnpm test` 全套件 3329 passed / 9 skipped（存量 skip），与实施笔记一致。
    - coverage = 4 / 5（AC-004 的 `[deploy]` 目检部分为 trust_prior）。
- 总体判断：测试整体真实可信、覆盖对齐 AC，唯一 blocker 是键盘可达性测试以手动 click 冒充键盘触发、断言恒真，须修复或诚实化后方可信。
- 系统性 follow-up：无。

verdict: FAIL

______________________________________________________________________

# Task review t420（reviewer_focus: 测试）Round 2

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
    - **t420_test_f001（已消除）**：用例改名「Button text 语义 button + onClick 通路」；去掉装饰性 keyDown；`expect(clicks).toBe(1/2)` 精确断言；注释说明 jsdom 不模拟 Enter→click，键盘可达由原生 button 语义 + AC-003 grep 承担。无恒真 `>=`。
- 本轮新发现：0。
- 危险模式：无删测 / skip / only / mock 被测逻辑。
- 新增三测：variant/size/as-link 类断言触达生产 Button；onClick 通路；业务配方+span onClick grep。
- AC 复验：
    - AC-001/002/003/005：`re_verified`（组件测 + grep + 定向/全量套件）
    - AC-004：`trust_prior`（[deploy] 目检）
- coverage = 4 / 5（AC-004 deploy 段 trust_prior）

verdict: PASS

---

# Task review t420（reviewer_focus: 测试）Round 3

- task：`t420_ui_button_layer_adopt`
- diff_anchor：`7c71df8aa891467a3c61987309f8094a2f66a6e8`
- round：3
- reviewed_at：2026-08-16 06:15 UTC+8

reviewed_scope: 79610e4984db4920

## Findings

本轮零 finding。

## 结论

- 相对 Round 2 无测试代码变更；Round 1 f001 消除结论不变。
- 总体判断：测试面可信。

verdict: PASS
