# Task review t432（reviewer_focus: 代码）

- task：`t432_fix_pre_exist_lint_errors`
- spec：`docs/tasks/t432_fix_pre_exist_lint_errors/spec.md`
- diff_anchor：`886f6033e62cb29428e9a184179629d787bbfea3`
- target：`git diff 886f6033e62cb29428e9a184179629d787bbfea3`
- round：1
- reviewed_at：2026-08-17 00:58 UTC+8

## Findings

无（0 条）。逐维度确认：

- 规格合规：diff 仅 3 个代码文件 + `task.md` front matter（status/branch/worktree/diff_anchor），无范围外改动；WIP 2 处（`src/main/index.ts:128`、`src/main/cli/background_serve.ts:111`）未动，suppress 9 处未动，既有测试预期零修改（`session_resume.test.ts` 完全未触碰；settings 测试仅改 import 方式与泛型实参，无任何断言变化）。
- 实现正确性：两处语义变换均与原文等价——
  - `session-resume.ts:34`：`source as ResumeCommandSource` + `?? null` → `(DEFAULT_RESUME_COMMAND_TEMPLATES as Record<string, string | undefined>)[source]` + `if (!builtin) return null`。未知 source 运行时索引得 `undefined` → falsy → null，与 t324 语义一致；已由 `session_resume.test.ts` AC-004（unknown_cli→null，6 tests 全过）锁定。
  - `general_section.tsx:47-53`：`delete next[source]` → 重建对象排除该键。对普通字符串键对象与 `delete` 行为完全等价（含键序保持）；`source` 为 `ResumeCommandSource` 联合（claude_code/kimi_code/grok/opencode），无原型链键碰撞；`Object.keys(next).length === 0` 时省略字段的 AC-003b 语义保持。已由 settings 测试 AC-003/003b 锁定（38 tests 全过）。
- 类型/契约：`as Record<string, string | undefined>` 为健全 cast（全部属性可赋值）；`import type * as theme_module` + `typeof theme_module` 经 strictTypeChecked lint 实证类型合法。
- 安全：无新输入面/注入/敏感数据路径。
- 性能：无新增查询/IO/算法路径。
- 架构/可维护性：无新抽象、无死代码、无未用 import；snake_case 命名与项目风格一致；`resume_command` / `save_resume_template` 圈复杂度远低于阈值。
- 健壮性/可观测：无新错误处理路径；注释（t432 归因）与实现一致。
- 测试层 anti-pattern 扫描：无 `.skip`/`.only`/弱化断言/恒真断言；mock 改动仅类型注解，不触被测逻辑。

## 结论

- 前轮 finding 复核：Round 1，无。
- 本轮新发现：0 条。
- 未进表的提示：
  - 文件过大（降级规则）：`tests/unit/renderer/views/settings_view_general.test.tsx` 614 行 ≥ 600（测试 minor 阈值），本 task 净增 3 行；`src/renderer/views/settings-view/sections/general_section.tsx` 385 行未达阈值。均无硬约束不可拆，但本 task 未堆大，仅提示。
  - 范围外观察（既有，非本 task 引入）：`general_section.tsx:44` `next[k] = v` 与 `:55` `next[source] = val` 对 `__proto__` 键会命中原型赋值而非自有属性；键只能来自手写 config 文件，UI 无法产生，且 t432 前后行为一致，不构成新缺陷。
- 总体判断：3 处 lint 修复语义等价、范围克制、测试全绿，无未解决 critical / important，PASS。
- 系统性 follow-up：无。

## AC 复验方式

- AC-001：`re_verified`——本 worktree 重跑 `pnpm lint` exit 0（0 error，`--max-warnings=0`）。
- AC-002：`re_verified`——`pnpm exec vitest run tests/unit/renderer/lib/session_resume.test.ts` 6/6 通过（含 AC-004 unknown_cli→null）；`session-resume.ts:34-36` 代码路径逐行核对与 `?? null` 等价。
- AC-003：`re_verified`——`pnpm exec vitest run tests/unit/renderer/views/settings_view_general.test.tsx` 38/38 通过（含 AC-003/003b 清空删键断言）；lint 对该文件 0 error。

coverage = 3 / 3

reviewed_scope: 45ebbc467cac5bc5

verdict: PASS
