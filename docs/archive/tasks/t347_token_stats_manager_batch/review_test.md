# Task review t347（reviewer_focus: 测试）

- task：`t347_token_stats_manager_batch`
- spec：`docs/tasks/t347_token_stats_manager_batch/spec.md`
- diff_anchor：`4d73052c2bc07165a3393d872324c4f269e59cd8`
- target：`git diff 4d73052c2bc07165a3393d872324c4f269e59cd8`
- round：1
- reviewed_at：2026-08-13 21:15 UTC+8

## 审查范围与验证

- 测试运行：`node_modules/.bin/vitest run tests/unit/main/core/token-stats/manager.test.ts tests/unit/main/core/token-stats/token-stats-store.test.ts` → 111 通过（manager 19 + store 92），符合预期。p153 的 electron 环境测试文件未在本批运行范围，与本 task 无关，未作 finding。
- 指纹复核：`git diff --binary 4d73052c... -- . <excludes>` SHA1 前 16 位 = `494b8587bc755a60`，与注入一致，审查范围有效。
- 逐 AC 核对：AC-002/AC-003/AC-004 测试均会在此前实现（旧 `same_config` 序相关、catch 内 `return`、update_config 无 child 恢复分支）下失败，说明断言真实验证新行为，非 mock 摆设。

## Findings

### t347_test_f001 - AC-001 多批流程未断言末批 `rebuild_buckets=true`

- 严重度：minor
- 锚点：AC-001（一轮 upsert 只触发一次 buckets 重建）
- 位置：`tests/unit/main/core/token-stats/manager.test.ts:139-151`
- 问题：多批测试「大批 update 分批让路」断言了第 1 批第三参为 `false`（139-144），但未断言末批（第 3 批）第三参为 `true`（148-151 仅数调用次数与 on_update）。若 `is_last` 计算回归（例如多批场景恒为 `false`），buckets 永不被重建，当前全部测试仍通过：store 单测直接以显式 false/true 调 store，不经过 manager 的 `is_last` 逻辑；单批测试只覆盖「唯一一批 = true」。回归点未被任何测试锁定。
- 建议：在 148 行后追加 `expect(store.upsert_sessions).toHaveBeenNthCalledWith(3, sessions.slice(4000, 5000), [], true);`，与第 1 批 `false` 断言形成对称覆盖。

### t347_test_f002 - AC-003 测试 fake timers 未用 try/finally 隔离

- 严重度：minor
- 锚点：测试可信（失败路径下的测试隔离）
- 位置：`tests/unit/main/core/token-stats/manager.test.ts:402-422`
- 问题：`vi.useFakeTimers()` / `vi.useRealTimers()` 未包 try/finally。断言失败时 fake timers 泄漏到同文件后续测试（AC-004 的 update_config、AC-002 的 `flush_macrotasks`），可能造成级联失败掩盖根因。同文件既有 fake-timer 测试（235-254、256-271、273-289、291-314）均用 try/finally，新测试未沿用该约定。
- 建议：包 try/finally（与其他 fake-timer 测试一致）。

### t347_test_f003 - AC-003「状态可区分已停止与熔断」子句无测试且当前 API 不可观察

- 严重度：minor（低置信度，可能为 spec/实现口径问题）
- 锚点：AC-003（状态可区分「已停止」与「熔断」）
- 位置：`tests/unit/main/core/token-stats/manager.test.ts:402-422`；`src/main/core/token-stats/manager.ts:260-262`（is_running）
- 问题：新测试验证了熔断后 `update_config` 恢复路径（熔断触发、respawn、fork 计数），但 AC-003 的「状态可区分已停止与熔断」子句未验证。manager 公开 API 仅 `is_running()`，熔断与 stop 后均为 `child===null` → `false`，实现也未暴露可区分的状态信号；测试无法据此锁死任何区分行为。spec 可测试性声明只列「熔断恢复」为可测项，故此项不阻断，但 AC 文本与实现/测试存在口径空隙。
- 建议：与实现侧确认该子句的预期可观察形态；若要求外部可区分，需暴露状态位并补测试；否则建议在 spec 明确该子句不可观察。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无。
- 改测方向复核：两处既有测试改动（`manager.test.ts:113-117` 加第三参 `true`、`139-144` 加第三参 `false`）均为给断言补充 AC-001 驱动的新接口参数，属加强而非迁就实现；无「把旧预期改成当前输出」的情况。无违规。
- 本轮新发现：3 条（均 minor）。
- 未进表的提示：
  - AC-002 测试在「第一批」抛错而非 spec 测试策略所述「中间批」；失败路径共用同一 catch-continue 代码，观测断言（3 次 upsert_records + on_update 1 次）等价，不构成缺口。
  - AC-002 只触发 `upsert_records` 抛错，未测 `upsert_sessions` 抛错；二者同在一个 try/catch，验证一条已覆盖 catch-continue 行为。
  - `manager.test.ts:1` 与 `token-stats-store.test.ts:1` 的 `eslint-disable @typescript-eslint/no-non-null-assertion` 与 `:394 toBeDefined()` 均为既有代码，非本 task 新增，未作 finding。
  - 系统性 follow-up：无。
- AC 复验方式：
  - AC-001 `re_verified`：运行 store+manager 两测试文件 111 过；直接查证 `token-stats-store.test.ts:290-300`（false 不重建 / true 重建并含全部 daily）、`manager.test.ts:113-117`（单批传 true）、`139-144`（多批非末批传 false）。证据为测试代码与运行结果。
  - AC-002 `re_verified`：运行 AC-002 测试通过；trace `manager.ts:96-116` catch-continue 与 offset 推进，断言（3 次 upsert_records、on_update 1 次）在旧实现（catch 内 `return`）下必失败。
  - AC-003 `re_verified`：运行 AC-003 测试通过；trace 5 次快速崩溃触发熔断（`manager.ts:181-199`）与 `update_config` 无 child 恢复分支（`249-257`），旧实现无该分支故必失败。
  - AC-004 `re_verified`：运行 AC-004 测试通过；确认 `reordered` 键序与 `base_config` 不同、值全等，断言 postMessage 不增，旧序相关 `same_config` 下必失败。
  - coverage = 4 / 4
- 总体判断：AC-002/AC-003/AC-004 测试真实验证新行为，AC-001 有真实覆盖（store 层 + manager 层非末批），仅 3 条 minor 覆盖/隔离缺口，无未解决 critical/important。
- 系统性 follow-up：无。

reviewed_scope: dff64761a931bdeb

verdict: PASS
