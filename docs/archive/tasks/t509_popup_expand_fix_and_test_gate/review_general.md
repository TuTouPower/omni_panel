# Task review t509（reviewer_focus: 通用）

- task：`t509_popup_expand_fix_and_test_gate`
- spec：`docs/tasks/t509_popup_expand_fix_and_test_gate/spec.md`
- diff_anchor：`a854c7bb355a887bf59a83e555e1c11638a743dd`
- target：`git -C '/Users/karson/kar/code/omni_panel_t509' diff a854c7bb355a887bf59a83e555e1c11638a743dd`
- round：1
- reviewed_at：2026-09-25 10:18 UTC+8

reviewed_scope: 982ca0a5428db7e7

## Findings

无

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 本轮新发现：0 条
- 未进表的提示：无
- 总体判断：所有 AC 均已完整实现，单测与预检全链通过，Provider 与 Upcoming 展开折叠状态语义清晰，无阻断缺陷。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查验 `src/renderer/views/PopupView.tsx:592-594` 中 Upcoming 与普通 Provider 展开初始态分支逻辑，并执行 `pnpm vitest run tests/unit/renderer/views/popup_view_upcoming.test.tsx` 验证初次点击即展开及状态切换。
- AC-002：`re_verified`，执行 `pnpm test`，全仓 325 个单测套件 3944 个测试用例全部通过，零 failure 且零 error（此前失败的 5 个 popup 测试已全部恢复绿灯）。
- AC-003：`re_verified`，查验 `package.json:36` 与 `docs/blueprint/conventions.md:91`，并实际执行 `pnpm check`，验证依次执行 typecheck、lint、format:check、deadcode、arch 与 test，返回退出码 0。
- AC-004：`re_verified`，查验 `src/shared/lib/connector-thresholds.ts:10` 的 `Number.isFinite` 守卫，并执行 `pnpm vitest run tests/unit/shared/connector-thresholds.test.ts`，验证 `status_for_pct` 传入 `NaN`、`Infinity`、`-Infinity` 均返回 `unknown`。
- AC-005：`re_verified`，查验 `src/renderer/lib/utils.ts:27-29` 对 falsy 与非法时间戳的 `--` 回退守卫，并执行 `pnpm vitest run tests/unit/renderer/lib/utils.test.ts` 验证覆盖。

coverage = 5 / 5

verdict: PASS
