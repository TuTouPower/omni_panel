# Task review t218（reviewer_focus: 通用）

- task：`t218_fix_flaky_timer_tests`
- spec：`docs/tasks/t218_fix_flaky_timer_tests/spec.md`
- diff_anchor：`559f8cc5134d29e5dd6a9cbb37ece9fdd05747f1`
- target：`git diff 559f8cc5134d29e5dd6a9cbb37ece9fdd05747f1`
- round：1
- reviewed_at：2026-08-05 22:39 UTC+8

## Findings

### t218_gen_f001 - grok-oauth 处置记载为 describe 级 timeout，代码实际为 it 级

- 严重度：minor
- 锚点：行为无缺陷；spec 上下文区「测试策略」首条与代码不一致
- 位置：`tests/integration/connector/grok_oauth_account_lifecycle.test.ts:213`；`docs/tasks/t218_fix_flaky_timer_tests/spec.md`（上下文区「测试策略」首条）
- 问题：本 diff 新增的 spec 上下文记载 grok-oauth 处置为「改用 describe 级 timeout（`describe(name, fn, 30000)`）」，实际代码是 `it(name, fn, 30000)`。该 describe（78-214 行）内只有一个 `it`，it 级与 describe 级超时覆盖范围完全等价，无功能差异，不构成 AC 违反；但 spec 上下文与代码措辞不一致。
- 建议：把 spec 上下文该条改为「describe/it 级 timeout」或注明该 describe 仅单 `it`，消除记载差异。

### t218_gen_f002 - spec 上下文「固定时长负向等待残留仅限两处」枚举不全

- 严重度：minor
- 锚点：AC-3「如有残留，须在测试策略说明理由」相关；无行为缺陷
- 位置：`docs/tasks/t218_fix_flaky_timer_tests/spec.md`（上下文区「测试策略」末条）vs `tests/unit/main/core/session-history/subscription-service.test.ts:164,201,231,414,443`
- 问题：spec 上下文称「固定时长负向等待残留仅限 subscription-service 两处（unsubscribe / unsubscribe_all 后无推送）」，但同文件另有 5 处固定时长 `setTimeout(80)` 后 `expect(...).toHaveLength(0)` 的等待（164/201/231/414/443 行），用途是 Windows mtime 量化基线建立 + 初始无推送断言（文件内 199-200 行注释）。这些等待无假失败路径（等待期间文件无变化 → 不会触发推送），不属于 p049/p051 flaky 范畴，无需改时序；「仅限两处」的枚举不完整，理由也未显式列明。
- 建议：修正 spec 上下文枚举，将 80ms 基线等待纳入「残留」说明或显式注明其归属 mtime 量化理由（第 133 行已有部分覆盖），保持文档与代码一致。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：2 条（均为 minor）。
- 未进表的提示：
    - 独立验证（非采信 implementer 自述）：整批 `pnpm test` 跑 1 次全绿（222 files / 2344 passed / 1 skipped，与 implementer 自述数字一致），提供 AC-1 部分证据；4 个改动测试文件隔离全绿（refresh-service 30/30、grok-oauth 1/1、file-vault-backend 27/27、subscription-service 15/15），AC-2 已独立验证。改动文件中无 `.skip` / `.only` / 删 expect / mock 误用等危险模式；测试运行未产生工作区残留改动。
    - `tests/integration/config/secrets-store.test.ts` 无 2s 断言窗口（无 `Date.now` / `elapsed` / 20 并发写），spec 范围将其列为候选但实际无需改动，正确跳过。
    - refresh-service 文件隔离总耗时约 31.8s（多个重试用例各约 2s 真实等待，vitest 无文件级超时上限），整批下无 fail 路径，但全批 wall time 偏长是真实定时器方案的成本，spec 上下文已批准该取舍。
    - 变更后仍存的两处 300ms 负向等待不会引入假失败（unsubscribe 正确实现时永不推送，断言仅在有真实 bug 时失败），150→300ms 为纯防御性增强；描述级 30000 对重试用例约 2s×3 等待 + 子进程启动有约 5 倍余量，处置与 spec 决策一致。
- 总体判断：实现与 spec 处置决策一致，契约区 AC 均满足，无未解决 critical / important；仅 2 处 spec 上下文文档措辞与代码不完全一致（minor）。
- 系统性 follow-up：无（t220 已承接 provider_account_row 的 `setTimeout(50)`，见 spec 非范围）。

verdict: PASS
