# Task review t390（reviewer_focus: 测试）

- task：`t390_config_double_fail_rollback`
- spec：`docs/tasks/t390_config_double_fail_rollback/spec.md`
- diff_anchor：`77ad6a5e74b390e9dda94689f09730e08284e90f`
- target：`git diff 77ad6a5e74b390e9dda94689f09730e08284e90f`
- round：1
- reviewed_at：2026-08-15 08:40 UTC+8

## Findings

### t390_test_f001 - 「成功写盘推进确认点」无测试覆盖（confirmed_ref 成功路径 mutation 不杀）

- 严重度：minor
- 锚点：AC-001/AC-003 契约语义「回滚到最近一次**已成功写入**的确认值」；spec「风险与回退」明确跟踪「每次成功写盘更新确认点」
- 位置：`tests/unit/renderer/hooks/use_config.test.ts:233-273`（新增两用例均只覆盖失败路径）
- 问题：新实现核心机制 `save()` / `update_config()` 成功路径的 `.then(() => { confirmed_ref.current = ... })`（use-config.ts:90-93、121-123）无任何测试触达。用 scratch 复制的钩子做 mutation 验证：删除两处成功推进 `confirmed_ref`（`.scratch` 验证，已清理）后，全部 9 条测试仍绿——「成功写盘后确认点推进」这一行为若无测试锁定，后续回归会静默。现有用例（AC-001/003、t356 单失败）的终态断言都恰逢 confirmed == base，无法区分「confirmed 从未推进」与「confirmed 正确推进」。
- 建议：补一 case：`save(success_config)` 成功 → 再 `save(failed_config)` 失败，断言终态回滚到 `success_config` 而非 base；update_config 同构补一条。此为「再加 case」级别，不阻断。

## 结论

- 前轮 finding 复核：本轮为首轮，无前轮。
- 改测方向复核：无。diff 为纯新增（两个新 it 块，42 行），未改动既有 t356 单失败用例（save 与 update_config 各一条），无删断言、无反转/弱化/注释断言、无 .skip/.only、无 ts-ignore/eslint-disable。未发现「迁就实现的改测」。
- 本轮新发现：1（f001，minor）。
- 未进表的提示：
  - AC-003 用例用 `await new Promise((r) => setTimeout(r, 0))` 等待队列 settle（`update_config` 返回 void，无 promise 可 await）。此处 mocks 全同步，整条 save_queue_ref 链为纯微任务，setTimeout(0) 宏任务必然排空微任务队列，时序确定、非 flaky；可接受的变通，仅风格观察。
  - AC-001 未断言 `config_save` 恰被调用两次 / `pa`、`pb` 均 rejected。若 mock 配置失误导致任一 save 成功，终态必非 base，测试会响亮失败而非静默通过，故不构成弱断言；仅为可选的更强断言。
  - 注释「修复前：B 失败回滚到 A（乐观前值）…」经逐条 trace 与 mutation 验证属实，注释准确。
- 总体判断：3 条 AC 均有可观察终态断言且全部通过；mutation 敏感性经验证（update_config 回滚改回乐观前值 → 恰 AC-003 失败，AC-001 通过，与 implementer 声称「1 failed」一致；save 回滚改回前值 → 恰 AC-001 失败，证明 AC-001 真区分「回滚 base」与「旧实现回滚 A」）。双失败串行性经 queue 链真实触达。无 critical/important，仅 1 minor，可 PASS。
- 系统性 follow-up：无。

verdict: PASS

## Round 2

- reviewed_at：2026-08-15 09:10 UTC+8
- target：`git diff 77ad6a5e74b390e9dda94689f09730e08284e90f`（工作区现含 implementer Round 1 后新增测试与实现改动）

### 前轮 finding 复核

- **t390_test_f001（minor）**：部分修复。implementer 新增 `t390 f002`（成功 save A → 断言 config==a → save B 失败 → 断言回滚到 a），精确锁定「成功写盘推进 confirmed_ref」：mutation 删除 save/update_config 成功路径两处推进（scratch 验证）后，恰 `f002` 红、其余全绿。原建议中「update_config 同构补一条」未完成——AC-003 用例仍无法区分 update_config 成功推进 confirmed 是否被删（mutation 删 update_config 推进后 AC-003 仍绿）。见本轮 f002。

### Findings

### t390_test_f002 - update_config 成功路径推进确认点仍无测试锁定（f002 仅覆盖 save 路径）

- 严重度：minor
- 锚点：AC-003 契约语义「回滚到最近确认值」；Round 1 建议「update_config 同构补一条」未落地
- 位置：`tests/unit/renderer/hooks/use_config.test.ts:146-171`（f002 测试仅测 save 路径）
- 问题：f002 覆盖了 save 成功路径的 confirmed 推进，但 update_config 成功推进（use-config.ts:125）无等价测试。mutation 验证：删除 update_config 成功推进 confirmed 后，AC-003 仍绿——即 update_config 若「成功不推进确认点」，双失败回滚仍落 base 终态，测试无法发现。仅当 update_config 之后接一次 save 失败、期望回滚到 update_config 成功值才能区分。
- 建议：同构 f002 补一 case：`update_config(成功)` → `save(失败)` → 断言终态回滚到 update_config 成功值，而非 base。

### t390_test_f003 - reload/duplicate 路径推进确认点无测试

- 严重度：minor
- 锚点：行为缺陷 + 「回滚到最近确认值」语义一致性（无对应 AC，非 blocking）
- 位置：`src/renderer/hooks/use-config.ts:171`（reload）、`:182`（duplicate）——本轮实现新增推进 confirmed_ref
- 问题：implementer 本轮在 `reload()` 与 `duplicate()` 也同步 `confirmed_ref.current = result.config`，但无任何测试覆盖。若删除，reload 后 save 失败会回滚到过期 confirmed，终态漂移；现测试全绿无法发现。该实现改动超出 spec 声明范围（仅 save/update_config），行为合理但覆盖缺失。
- 建议：补 reload 后 save 失败回滚到 reload 值用例；或由 code reviewer 确认该扩展是否必要，必要时撤回。

## Round 2 结论

- 前轮 finding 复核：f001 minor 部分修复（save 路径已锁定，update_config 同构缺失）。
- 改测方向复核：无迁就实现的改测。diff 为纯新增（f001/f002 两个 it 块），未改既有测试；新增实现（onConfigChange 推进 confirmed，use-config.ts:79-81）与 f001 测试是「新行为+新测试」的 TDD 正向配合，非把旧预期改成新输出。
- 本轮新发现：2（f002、f003，均 minor）。
- 未进表的提示：
  - onConfigChange 推进 confirmed 在 echo 场景（t153）不会误推进：`incoming === current` / `JSON.stringify` 相等两重守卫先 return，73 passed 隐含验证。
  - f001/f002 测试名与 reviewer finding 编号（t390_test_fNNN）同形但无关，仅为 implementer 命名习惯，不影响判定。
- 总体判断：前轮唯一 minor 已部分修复；本轮 2 minor（update_config 同构缺失、reload/duplicate 覆盖缺失）均为「可再加 case」级别。4 组 mutation 各被不同测试精确捕获（mutA→AC-003、mutB→AC-001、mutC→f002、mutD→f001），全部强断言、可观察终态。无 critical/important，可 PASS。
- 系统性 follow-up：无。

verdict: PASS

reviewed_scope: 0d2fcbeac3df2bfa
