# Task review t432（reviewer_focus: 测试）

- task：`t432_fix_pre_exist_lint_errors`
- spec：`docs/tasks/t432_fix_pre_exist_lint_errors/spec.md`
- diff_anchor：`886f6033e62cb29428e9a184179629d787bbfea3`
- target：`git diff 886f6033e62cb29428e9a184179629d787bbfea3`
- round：1
- reviewed_at：2026-08-17 00:59 UTC+8

## Findings

无（0 条）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：N/A（本轮为 round 1）
- 改测方向复核：无「迁就实现」的改测。diff 中唯一测试改动为 `tests/unit/renderer/views/settings_view_general.test.tsx` 的类型层重构——新增 `import type * as theme_module` 并将 vi.mock 工厂内联 `typeof import(...)` 注解改为 `typeof theme_module`（对应 anchor 处 1 处 `consistent-type-imports` error）。零断言改动、零预期值改动、零用例增删，运行行为不变（`importOriginal()` 运行时仍加载真实模块）。`session_resume.test.ts` 完全未触碰。符合「为消 lint 不动既有测试预期」的非范围约束。
- 本轮新发现：0
- 未进表的提示（范围外 / 可选，不进 finding 表）：
  - 非范围 2 处 WIP lint error（`src/main/index.ts:128`、`src/main/cli/background_serve.ts:111`）属主仓未提交工作区，本 worktree 无对应代码；`pnpm lint` 在此 worktree exit 0，不含该 2 处，与本 task 判定无关。
  - `session-resume.ts` 用 `as Record<string, string | undefined>` 宽化索引类型消除 no-unnecessary-condition，是类型层权宜（行为等价）；如想保留编译期类型保证可后续改 `Object.hasOwn`/Map 形态，属可选优化，不阻断。
  - 危险模式扫描逐条结论：恒真断言 / 删改反转 expect / 注释掉断言 / 弱化断言 / 删测试 / `.skip`/`.only` / test 文件 eslint-disable、@ts-ignore / mock 误用 / 阈值掩盖 / 条件跳过弱化断言 / `.value=` 替代真实交互 / 存在即通过——均未命中（对 anchor 与当前版本双向核对）。

### AC 复验方式

- AC-001：`re_verified`。worktree 执行 `pnpm lint`（eslint src tests scripts connectors tests/fixtures *.ts *.mts --max-warnings=0）exit 0，0 error 0 warning。另用 stdin 对 anchor 版本 3 个改动文件复算 eslint：`session-resume.ts` 2 处 no-unnecessary-condition（`??` 恒非空 + `!builtin` 恒假）、`general_section.tsx` 1 处 no-dynamic-delete、测试文件 1 处 consistent-type-imports，合计 4 error 与 spec「4 处已提交」吻合；修复后全部消失。
- AC-002：`re_verified`。`pnpm exec vitest run tests/unit/renderer/lib/session_resume.test.ts` 6 用例全绿，含 AC-004 `unknown_cli` → null 与内置回退；该测试文件零改动；`session-resume.ts` 变更（Record 索引保留 `string | undefined` + `if (!builtin) return null`）与原文 `?? null` 运行语义等价（unknown source → undefined → null）。
- AC-003：`re_verified`。`pnpm exec vitest run tests/unit/renderer/views/settings_view_general.test.tsx` 38 用例全绿（含 t402 AC-003/AC-003b 清空删键与 AC-003b 清空末键删字段，覆盖 `general_section.tsx` 重建对象排除键的新实现）；该文件 lint 随整体 lint exit 0 通过；改动仅为类型层 import，无断言变化。
- coverage = 3 / 3

- 总体判断：clean review，无 blocking 亦无 minor finding；3 条 AC 全部独立复验通过，测试可信、覆盖无缺口、无危险模式。
- 系统性 follow-up：无

reviewed_scope: 45ebbc467cac5bc5

verdict: PASS
