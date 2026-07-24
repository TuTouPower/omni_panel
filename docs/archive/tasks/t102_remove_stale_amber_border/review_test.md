# Task review t102（reviewer_focus: 测试）

- task：`t102_remove_stale_amber_border`
- spec：`docs\tasks\t102_remove_stale_amber_border/spec.md`
- diff_anchor：`53862bb9e5e8a3327dc649aaa4d745f27d33fd78`
- target：`git diff 53862bb9e5e8a3327dc649aaa4d745f27d33fd78`
- round：1
- reviewed_at：2026-07-24 14:03 UTC+8

## Findings

### t102_test_f001 - 删除无关响应式验收断言，造成既有 AC 回归无测试保护

- 严重度：important
- 位置：`tests/unit/renderer/globals_css.test.ts:90`（替换了原 `forces two columns in the mid breakpoint to satisfy spec acceptance` 测试）
- 问题：本 task 新增 stale 边框断言时删除了 t004 针对 640–1023px 双列布局的唯一完整断言。当前剩余的 `defines @container breakpoints...` 只验证断点选择器存在，不验证其中的 `grid-template-columns`；`docs/specs/ui-views-web.md` 仍要求该区间为两列，且未发现等价或更高层覆盖。
- 建议：保留原双列断言，并另增 stale 边框断言；不要用当前 task 的测试替换无关响应式 AC 覆盖。

## 结论

- 本轮新发现：1 条
- 总体判断：stale 边框断言可覆盖本次 CSS 删除，但删除既有双列布局 AC 断言使测试集不完整。

verdict: FAIL

## Round 2 (2026-07-24 14:13 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：`t102_test_f001` 已修。`tests/unit/renderer/globals_css.test.ts:90-96` 已保留 640–1023px 双列断言，`tests/unit/renderer/globals_css.test.ts:98-100` 另行覆盖 `.card.stale` 规则移除。
- 本轮新发现：0 条。
- 总体判断：测试仍验证 stale 时保留「已过期」徽章或错误信息，同时验证卡片不再携带 `.stale` class；未发现危险模式或验收覆盖回退。

verdict: PASS

## Round 3 (2026-07-24 14:25 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：`t102_test_f001` 已修且保持完整。`tests/unit/renderer/globals_css.test.ts:90-96` 仍验证 640–1023px 双列布局；`tests/unit/renderer/globals_css.test.ts:98-100` 独立验证 `.card.stale` 规则移除，未以本 task 测试替换既有响应式 AC 覆盖。
- 本轮新发现：0 条。
- 总体判断：反转 `.card.stale` 断言符合本 task 明确规格；ProviderCard 与 ProviderAccountRow 分别仍验证 stale 徽章或错误文字等用户可观察状态，未发现危险模式、测试可信问题或验收覆盖回退。

verdict: PASS
