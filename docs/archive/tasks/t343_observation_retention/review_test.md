# Task review t343（reviewer_focus: 测试）

- task：`t343_observation_retention`
- spec：`docs/tasks/t343_observation_retention/spec.md`
- diff_anchor：`26c2a611ec87d7dbddfdb567e2abe46717a9080b`
- target：`git diff 26c2a611ec87d7dbddfdb567e2abe46717a9080b`
- round：1
- reviewed_at：2026-08-13 17:10 UTC+8

reviewed_scope: 8ceba0e6e64d0baf

## Findings

### t343_test_f001 - AC-001 生产调用方（启动+每日定时）与 AC-002 config 读取接线无任何自动测试

- 严重度：important
- 锚点：AC-001「prune() 存在生产调用方（启动与每日定时），删除早于留存阈值的观测行」；AC-002「cacheMaxMb 设置被读取并影响留存预算」
- 位置：`src/main/index.ts:989-1006`（接线）；`tests/unit/main/observation-retention.test.ts`（仅覆盖 helper，未覆盖接线）
- 问题：spec 可测试性声明明确「AC-001 可自动测试（单测 prune 阈值 + 集成测试定时触发）」，测试策略明确「集成：断言 scheduler 每日触发 prune」。diff 只交付了 helper 层单测（`run_retention_prune` 阈值调用、预算收紧），但 main/index.ts 的接线——`app.whenReady()` 内启动即调 `run_retention_prune(observationStore, currentConfig.cacheMaxMb, Date.now())`（index.ts:995）＋ `setInterval(..., 24h)`（index.ts:1005）——被内联进 Electron 主进程启动路径，不可注入、无任何测试。若启动调用被误删、定时周期改错、`.unref()`/`clearInterval` 清理逻辑回归，无测试可拦截，AC-001「生产调用方（启动与每日定时）」与 AC-002「设置被读取」这两条可观察子句完全无自动证据。失败场景：定时器接线回归后，留存清理静默失效，测试仍全绿。
- 建议：参照 `refresh-service` 的可测模式（`src/main/core/scheduler/refresh-service.ts` + `tests/integration/scheduler/refresh-service.test.ts`），把定时接线提取为可注入模块，如 `create_retention_scheduler(observationStore, get_cache_max_mb, now)` 返回 `{ run_now, start, stop }`：单测断言 start 立即执行一次 prune、按 24h 周期再次调用、stop 清理定时器、异常被吞并记录。接线移出 index.ts 后即可在集成测试断言每日触发。

### t343_test_f002 - run_retention_prune 收紧循环「prune 返回 0 仍超预算 → break」路径无测试

- 严重度：minor
- 锚点：行为健壮性——防无限循环保护
- 位置：`src/main/core/observation/observation-retention.ts:45-48`；`tests/unit/main/observation-retention.test.ts:49`（「超行数预算时按时间向前收紧直至回落」）
- 问题：收紧循环的关键退出保护是 `if (additional === 0) break;`——当 count 仍超预算但 prune 删不动（如剩余行全为每键最新保护行）时提前退出，避免无限循环。现有超预算测试的 mock 在 `count > 2048` 时恒返回 100、仅当 `count ≤ max_rows` 时返回 0，等价于「循环靠 count 回落退出」，未覆盖「count 仍超预算但 prune 返回 0」这一真实可能路径。
- 建议：补一个 case：首次 prune 返回若干行、随后返回 0（count 仍 > max_rows），断言循环 break、removed 不再增长、不产生额外 prune 调用。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无。diff 仅新增 `observation-retention.test.ts`，未改动任何既有测试，无「迁就实现」式改测。
- 本轮新发现：2 条（f001 important、f002 minor）。
- 未进表的提示：
    - `cacheMaxMb=0` 的 schema 矛盾（范围外，pre-existing，t343 未改 `src/main/core/config/types.ts` 与 `src/renderer/views/settings-view/sections/data_section.tsx`）：schema 为 `z.number().int().min(1).max(10000).optional()`（types.ts:87），拒绝 0，但 UI「不限制」选项保存 `cacheMaxMb: 0`（data_section.tsx:38），retention 代码也把 0 视为不限制（observation-retention.ts:20）。若 config-store 的 `safeParse` 实际拒绝 0，「不限制」选项无法持久化，retention 的 0 分支成死代码。建议单独 follow-up 核实。
    - 单测 mock 边界：`run_retention_prune` 的 `deps.prune` mock 属存储/DB 边界，合法；store 的真实「删旧保新」行为已由 `tests/integration/observation/observation-store.test.ts:195`（「prunes old observations but keeps latest」）覆盖，非缺口。
- 总体判断：helper 层单测（6 例，6/6 通过）质量良好、无危险模式命中，但 AC-001 生产调用方与 AC-002 config 读取接线对照 spec 声明的集成测试策略缺失，属未解决 important，判 FAIL。
- 系统性 follow-up：建议标题「retention 定时接线提取为可注入模块并补集成测试」，slug `t_retention_scheduler_testable_wiring`；阻断性与 f001 关联。

### AC 复验方式

- AC-001：`re_verified`（部分）。单测复验 `run_retention_prune` 以 `NOW - 90d` 阈值调用 prune（observation-retention.test.ts:31-47，断言 `pruned_at[0] = NOW - DEFAULT_RETENTION_DAYS * DAY_MS`）；store 真实删行保新由集成测试复验（observation-store.test.ts:195-203）。「启动+每日定时生产调用方」接线无测试，该子项 `trust_prior`（依赖代码审查 index.ts:989-1006）。
- AC-002：`re_verified`（部分）。`retention_params` 折算（max_rows = mb*1024*1024/512）、0/未设视为不限制、超预算收紧均由单测复验（test:18-28, 49-80, 82-97）。「config 读取 → 传给 prune」接线无测试，该子项 `trust_prior`（依赖代码审查 index.ts:995）。

coverage = 2/2（两 AC 阈值/预算逻辑 re_verified；接线子项 trust_prior）

verdict: FAIL

## Round 2 (2026-08-13 17:16 UTC+8)

reviewed_scope: 2e32009b3e15a5fb

### 前轮 finding 复核

- **f001（important，接线无测试）→ 已消除**。以 diff 核实：`create_retention_scheduler` 已提取（observation-retention.ts:104-160），返回 `{ run_now, start, stop }`；index.ts 改用 `create_retention_scheduler({ prune: ...observationStore.prune, count_observations: ..., get_cache_max_mb: () => currentConfigSnapshot.cacheMaxMb, now: () => Date.now() })` 并 `start()`（index.ts:989-1002），before-quit `stop()`（index.ts:1295-1299）。新增 4 例接线测试（observation-retention.test.ts:100-171）：
    - `start 立即执行一次 prune`：断言 `deps.prune` 被调用——复验「启动即清理」；
    - `按 24h 周期再次触发 prune`：`advanceTimersByTime(RETENTION_INTERVAL_MS)` 后 prune 调用数增长——复验「每日定时」；
    - `stop 清理定时器后不再触发`：stop 后推进 3 周期调用数不变——复验清理；
    - `prune 抛错被吞并记录`：mock throw 下 start 与推进均 `not.toThrow()`——复验错误不中断定时器。
      AC-001「生产调用方（启动与每日定时）」与 AC-002「config 读取」接线由 `trust_prior` 转 `re_verified`（代码 + 上述 4 例）。`get_cache_max_mb` 动态读取已核实：index.ts:939 `save_config` 内 `currentConfigSnapshot = next`，闭包读最新值，运行时改设置生效。10/10 测试通过（vitest run 实测）。
- **f002（minor，收紧循环 break 分支无测试）→ 处置为登记 pending**。以 `docs/pending/todo/p159_retention_prune_early_break.md` 核实：已登记「收紧循环空窗口提前 break 分支测试」为待办。f002 为 minor 非阻断，登记 pending 属合法处置；改代码修治不强制。

### 本轮新发现

- 无新 blocking finding。扫描新测试：无 `.skip`/`.only`/`eslint-disable`/`ts-ignore`；无恒真断言；无删/反转 expect；无 mock 被测逻辑（prune/count 为存储边界、fake timers 为时钟边界，合法）；错误吞并测试为设计行为验证，非掩盖失败。
- 范围外已登记的 p158（cacheMaxMb=0 与 schema min(1) 矛盾，pre-existing）不作本 task finding。

### 结论

- 前轮 finding 复核：f001 已消除（接线提取 + 4 例测试）；f002 处置为登记 p159（pending）。
- 改测方向复核：无。本轮新增 4 例为全新增，未改任何既有测试预期。
- 本轮新发现：0 条。
- 未进表的提示：接线测试断言可再收紧——「start 立即执行」用 `toHaveBeenCalled`（可断言精确调用次数与 `older_than_ms` 参数）、「24h 再触发」用 `toBeGreaterThan`（可断言 `calls_before + 1`）；均属可选加强，不阻断。
- 总体判断：f001 已按建议根治，f002 已登记 pending，无未解决 critical / important，判 PASS。
- 系统性 follow-up：p158 / p159 已登记（pending），无需新增。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。生产调用方接线由 4 例 scheduler 集成测试复验（start 即清 + 24h 再触发 + stop 清理）；阈值删行由 run_retention_prune 单测（`pruned_at[0] = NOW - 90d`）+ store 集成测试（observation-store.test.ts:195）复验。
- AC-002：`re_verified`。`get_cache_max_mb` 闭包读取 `currentConfigSnapshot.cacheMaxMb`（index.ts:998），save_config 更新快照（index.ts:939）；mb→预算折算与超预算收紧由 retention_params/run_retention_prune 单测复验。

coverage = 2/2（两 AC 全子项 re_verified）

verdict: PASS
