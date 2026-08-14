# Task review t370（reviewer_focus: 测试）

- task：`t370_refresh_concurrency`
- spec：`docs/tasks/t370_refresh_concurrency/spec.md`
- diff_anchor：`92ee98e0b18e047af5d9d51652c52ba4b97d93a5`
- target：`git diff 92ee98e0b18e047af5d9d51652c52ba4b97d93a5`
- round：1
- reviewed_at：2026-08-14 14:50 UTC+8

## Findings

### t370_test_f001 - AC-002 测试是假阳性：抛错的 insert_batch 命中主插入段而非 stale 段，try/catch 从未执行

- 严重度：important（blocking）
- 锚点：AC-002（stale 副本插入失败不影响 failed 状态更新）
- 位置：`tests/unit/scheduler/refresh-service.test.ts:357-391`；`src/main/core/scheduler/refresh-service.ts:344-361`
- 问题：测试标题与注释声明「stale 副本插入抛错」，但实际运行从未触达 t370 新增的 stale 插入 try/catch。证据链：
  1. `create_observation_store()` 的 `list_by_source_instance_id` 恒返回 `[]`（`tests/unit/scheduler/refresh-service.test.ts:79`），因此 stale 副本构建循环（`refresh-service.ts:331-343`）产出空数组，`if (stale_observations.length > 0)` 不成立，t370 的 try/catch 块（`refresh-service.ts:344-361`）整段跳过。
  2. 测试将 `insert_batch` 替换为无条件抛错 mock（`:373-377`）。`refresh-service.ts:322` 的主观测插入 `deps.observationStore.insert_batch(observations)`（此处 observations 为空数组）也会调用该 mock 并抛错，该调用在 t370 改动之外、无 try/catch 保护，被 attempt 循环 catch（`:408`）捕获后重试 3 次（2 次 1s sleep）。
  3. 实测该测试运行耗时 2001ms——正是 3 次 attempt 走 retry sleep 的特征；若真走 stale 分支单次完成应在 <10ms。这反证抛错发生点在 `:322` 主插入段，而非 stale 段。
  4. 断言 `state.status === "failed"` 由循环后通用 failed 回退路径（`:491-507`）达成，该路径 t370 之前已存在——**去掉 t370 的 try/catch 该测试照样通过**。
  结论：AC-002 新增代码无真实测试覆盖，测试验证的是假行为（throw 经 3 次重试后落到 failed 回退），不区分实现是否含 try/catch。按测试评审规则（覆盖类 finding，「测试存在但验证的是假行为」）判定 blocking。
- 建议：让 stale 路径真实触发——`observationStore.list_by_source_instance_id` 返回一条 prior 观测使 stale_observations 非空；`insert_batch` mock 仅在观测含 `stale: true`（或非空数组）时抛错、其余透传，使 `:322` 主插入正常通过、`:348` stale 插入抛错。断言可加 `expect(observationStore.insert_batch).toHaveBeenCalledWith(stale_observations)` 证明抛错发生在 stale 段，并保留 `status === "failed"`。顺带消除该测试 2s 的重试 sleep。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（round 1）
- 改测方向复核：无「迁就实现」的改测。既有 t196 锁短路测试第二轮由 `{ force: true }` 改非 force（`tests/unit/scheduler/refresh-service.test.ts:596-597`），语义保持——锁持有下非 force 短路、execute_connector 仍为 1，与 t370 实现（force 绕过）一致，属合法适配；集成测试「prevents concurrent refresh for same instance」两轮 force 改非 force（`tests/integration/scheduler/refresh-service.test.ts:365-366`）同理，因为 force 不再短路，改非 force 保留原锁短路断言（inserted ≤ 1），合法。
- 本轮新发现：1 条
- 未进表的提示：
  - AC-001（force 绕过）测试可信：第一轮非 force 持锁、第二轮 force 断言 execute_connector 2 次，配合 t196 非 force 短路对照（1 次）成对验证绕过；`execute_connector` 调用计数在 invoke 时同步递增，`vi.waitFor` 于 release 前断言，无时序竞态。可靠。
  - AC-003（refreshAll 逐实例 failed）测试可信：`with_concurrency`（limit 5）下两实例 refresh 顺序由 configStore.load() 立即 resolve 的微任务 FIFO 决定——deepseek-1 先续跑、先取 `mockResolvedValueOnce` 第 1 次（成功），deepseek-2 取第 2 次（failed），断言与顺序匹配且确定，无交错风险。
- 总体判断：AC-001 / AC-003 测试可信且覆盖到位，t196 与集成测试改法合法；但 AC-002 唯一测试是假阳性（验证假行为），该 AC 无真实自动覆盖，存在未解决 blocking finding。
- 系统性 follow-up：无

verdict: FAIL

---

# Round 2（t370_test_f001 修复复核）

- round：2
- reviewed_at：2026-08-14 15:03 UTC+8
- target：`git diff 92ee98e0b18e047af5d9d51652c52ba4b97d93a5`（工作区现状）
- 验证：`vitest run tests/unit/scheduler/refresh-service.test.ts`（17 passed）；变异验证临时移除 try/catch 后还原（sha256 校验一致）

## Findings

### t370_test_f001（Round 1 复核） - AC-002 测试假阳性：已修

- 严重度：原 important（blocking）→ 已消除
- 锚点：AC-002（stale 副本插入失败不影响 failed 状态更新）
- 位置：`tests/unit/scheduler/refresh-service.test.ts:357-390`；`src/main/core/scheduler/refresh-service.ts:499-518`
- 复核结论：已修。逐条对 Round 1 四点证据：
  1. `list_by_source_instance_id` mock 现返回 1 条 prior 观测（`tests/unit/scheduler/refresh-service.test.ts:364-371`），全轮失败 stale 段循环非空，t370 try/catch 不再整段跳过。
  2. 抛错 mock 目标从 `insert_batch` 改为 `insert`（`:372-375`）。全轮失败路径下 `run_connector` 恒抛错（`mockRejectedValue`，HTTP 500 非 auth/非连接错误），主插入 `insert_batch(observations)`（`refresh-service.ts:328`）永不触达；`insert` 仅在全轮失败 stale 段（`refresh-service.ts:503`）被调，抛错点确认落在 t370 try/catch 内。
  3. 断言 `expect(insert_mock).toHaveBeenCalled()`（`:389`）区分 stale 段：`insert` 是 stale 段唯一调用点，该断言证明到达 `refresh-service.ts:503`（try 块内）。若 stale 循环为空（list_by_source 返回 []），insert_mock 不会被调，断言即红。
  4. 变异验证（实测）：临时移除 `refresh-service.ts:499-518` 的 try/catch（保留循环体）后跑 AC-002——测试红，`Error: stale insert boom` 从 `:501` 传播出 `refresh()`，测试 `await service.refresh` 在 `:385` 拒绝；同时 `updateState(failed)`（`:520-524`）不执行，status 停留 loading。删 try/catch 即红，反证该测试真实触达并依赖 t370 新增 try/catch，非假阳性。验证后已还原，sha256 与原文件一致。
  5. 测试耗时 2006ms（3 次 attempt + 2×1s retry sleep），与全轮失败路径时序一致，佐证真路径。
- Round 1「顺带建议」（消除 2s 重试 sleep）未采纳，可接受：AC-002 必须走全轮失败（3 attempt）才能触达 stale 段，`retry_delay_ms` 为源码硬编码不可注入，2s 为路径固有开销而非假阳性特征，不计 finding。
- 建议：无（已修）。

### （本轮无新 blocking finding）

仅提示性观察（不进表、不阻断）：
- per-account 失败分支的 t370 try/catch（`refresh-service.ts:353-363`）为 diff 新增但无抛错路径测试：现有 `marks per-account failures stale...`（t174，`:427-467`）走该分支但 `insert_batch` 成功。该分支失败场景（insert_batch 抛错 → 告警 → 继续走 ready）未覆盖，属「可以再加 case」范畴；AC-002 核心可观察行为（failed 状态仍更新、不卡 loading）已由本测试覆盖，不判 blocking。

## 结论

- 前轮 finding 复核（Round 2）：t370_test_f001 已修——测试真触达全轮失败 stale 段（变异验证删 try/catch 则红），`insert_mock` 被调断言区分 stale 段，Round 1 假阳性四点证据链全部消除；AC-002 现为真自动覆盖。
- 本轮新发现：0 条
- 未进表的提示：per-account 分支 try/catch（`refresh-service.ts:353-363`）无抛错路径测试；AC-002 保留 2s 重试 sleep（全轮失败路径固有，非假阳性）。
- 总体判断：AC-002 唯一 blocking finding 已修复；AC-001 / AC-003 测试 Round 1 已确认可信且本 diff 未再改动；无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
