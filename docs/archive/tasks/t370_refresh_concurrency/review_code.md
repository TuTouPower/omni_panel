# Task review t370（reviewer_focus: code）

- task：`t370_refresh_concurrency`
- spec：`docs/tasks/t370_refresh_concurrency/spec.md`
- diff_anchor：`92ee98e0b18e047af5d9d51652c52ba4b97d93a5`
- target：`git diff 92ee98e0b18e047af5d9d51652c52ba4b97d93a5`
- round：1
- reviewed_at：2026-08-14 14:50 UTC+8

## Findings

### t370_code_f001 - AC-002 修复错位：全轮失败后 stale 插入段仍无保护，新增 try/catch 与测试均未触达该缺陷路径

- 严重度：important（blocking）
- 锚点：AC-002「stale 副本插入失败不影响 failed 状态更新，UI 不卡在加载中」未满足
- 位置：`src/main/core/scheduler/refresh-service.ts:491-498`（全轮失败路径 stale 插入段）；实际加的 try/catch 在 `:344-357`（per-account 段）；测试 `tests/unit/scheduler/refresh-service.test.ts:357-391`
- 问题：spec 背景项 (3) 明确指出的缺陷是「**全轮失败后**的 stale 副本插入段无 try/catch，insert 抛错跳过 updateState(failed)」，对应原文件 `:489`，即现 `:491-498`（`list_by_source_instance_id` + 逐条 `insert`），其后紧跟 `updateState(failed)`（`:503`）。这一段**未被保护**：若 `list_by_source_instance_id`（`:491`）或 `insert`（`:493`）抛错，`:503` 的 `updateState(failed)` 被跳过，runtime store 停留在 `:251` 写入的 loading——这正是 AC-002 要修的缺陷。自动调度路径 `connector-scheduler.ts:62` 仅 log、不推状态，store 卡死 loading。实现者把 try/catch 加在了 per-account 段（`:344-357`，采集成功但部分账号失败、`insert_batch(stale_observations)` 处）——该段抛错会被外层 per-attempt catch（`:408`）捕获并重试，最终仍走到全轮失败路径的 `updateState(failed)`，并不造成 loading 卡死，不是 AC-002 的缺陷点。新增 AC-002 测试未验证任何新代码：mock 返回 `{observations: [], failed_accounts:[grok]}`、`insert_batch` 恒抛错，但生产侧 `:322` 的 `insert_batch([])` 先抛（此段未包 try/catch）→ 重试 3 轮 → 全轮失败路径 → `list_by_source_instance_id` 返回 `[]`（fresh store）→ stale 循环 0 次 → `updateState(failed)` 断言通过。`:344` 的 `stale_observations.length > 0` 守卫为 false，try/catch 块从未进入。该测试在 pre-t370 代码上同样通过，不构成对本次改动的回归验证（违反「测试须触达生产逻辑」）。
- 建议：把 try/catch（失败仅告警）包到全轮失败路径 `:491-498` 的插入段，确保 `:503` `updateState(failed)` 无条件执行；并补一个「全轮失败 + 已有 prior 观测 + stale 插入抛错」仍置 failed 的测试（当前测试改为触发该路径）。

### t370_code_f002 - force 绕过锁 + finally 无条件 delete：锁被并发旧刷新中途清空，可级联第三轮并发

- 严重度：important
- 锚点：行为缺陷 + 竞态——手动刷新（force）与自动刷新重叠时，锁失效并可能级联多轮并发
- 位置：`src/main/core/scheduler/refresh-service.ts:227`（force 绕过）、`:231`（`locks.set` 覆盖）、`:206`（`Map<string, number>` 仅时间戳无持有者）、`:508-510`（finally 无条件 `locks.delete`）
- 问题：force 直接绕过锁（`:227`）后 `locks.set` 覆盖旧锁（`:231`）。旧刷新完成时 finally 无条件 `locks.delete(instanceId)`（`:509`），会删掉**新刷新设置的锁**。时序：A(自动) 持锁 → B(force) 覆盖锁并并发采集 → A 完成，finally 删除锁（此时锁是 B 的）→ B 在无锁状态下继续运行 → C(自动) 进入（`is_locked` false）与 B 并发；B 完成时 finally 再删可能删除 C 的锁 → D 进入，级联。后果：同实例两轮并发采集，observation store 重复插入（同实例同时刻重复行）、runtime store 最后写入者覆盖、锁在 AC-001 目标场景（自动刷新持锁时手动刷新）下被完全架空。spec 风险回退项已写明预期缓解（「force 仅在锁非当前实例持有时生效，或排队等当前刷新结束」），实现未采纳；即使无持有者信息，也可在 finally 用 compare-and-delete（锁值存唯一 token，删除前比对）避免删掉更新一轮的锁。AC-001 单测（`:604-641`）只断言 `execute_connector` 调用次数为 2，未覆盖锁被中途清空后的级联场景。
- 建议：锁值从 `number` 改为唯一 token，finally 仅当锁仍为自己持有才 delete；或按 spec 回退，force 排队等待当前刷新结束。

### t370_code_f003 - 范围项 1「refreshNow 返回是否已受理」未落地

- 严重度：minor
- 锚点：契约区范围项 1（非 AC，不判 blocking）
- 位置：`src/main/core/scheduler/connector-scheduler.ts:98-104`（`refreshNow` 返回 void）；`src/main/core/scheduler/refresh-service.ts:55`（`refresh` 返回 `Promise<void>`）
- 问题：spec 范围项 1「refreshNow 返回是否已受理（或被锁），spinner 绑定受理结果」在 diff 中无对应改动：`refreshNow`/`refresh` 均返回 `void`，无受理信号返回。本次仅满足 AC-001 的「force 生效」分支（手动刷新不再静默跳过），「返回受理结果」的契约项未实现。非 AC 门禁项，列为规格对齐缺口，供实现侧确认是否留待后续 task。
- 建议：若需兑现范围项 1，改 `refresh` 返回受理布尔（被锁返回 false），`connector-scheduler.refreshNow` 透传。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（f001 blocking、f002 important、f003 minor）
- 未进表的提示：无
- 总体判断：AC-002 的修复错位——spec 明确点名的全轮失败后 stale 插入段（`:491-498`）仍未保护，`updateState(failed)` 可被抛错跳过使 store 卡 loading；新增 AC-002 测试未触达新代码、在旧代码上同样通过，AC-002 实际未满足。force 锁竞态（f002）使锁在 AC-001 目标场景下被架空并可能级联并发。存在未解决的 important → FAIL
- 系统性 follow-up：建议新 task——「refresh-service 全轮失败路径 stale 插入加保护 + 锁持有者 token 化」，slug 建议 `refresh_allfailed_stale_guard` / `refresh_lock_holder_token`

verdict: FAIL

---

# Task review t370（reviewer_focus: code）— Round 2

- task：`t370_refresh_concurrency`
- spec：`docs/tasks/t370_refresh_concurrency/spec.md`
- diff_anchor：`92ee98e0b18e047af5d9d51652c52ba4b97d93a5`
- target：`git diff 92ee98e0b18e047af5d9d51652c52ba4b97d93a5`
- round：2
- reviewed_at：2026-08-14 15:12 UTC+8

## Findings

### t370_code_f001（复核：已消除）- AC-002 全轮失败路径 stale 插入段已包 try/catch，updateState(failed) 无条件执行

- 严重度：已消除（Round 1 important/blocking）
- 锚点：AC-002
- 位置：`src/main/core/scheduler/refresh-service.ts:497-518`（try 包住 :500-501 `list_by_source_instance_id` 与 :503 逐条 `insert`，catch :512 仅告警）；:520-524 `updateState(failed)` 位于 try/catch 之外
- 复核：全轮失败路径（attempt 循环耗尽后）的 stale 插入段现整体包在 try（:499）内——list 与逐条 insert 任一处抛错均被 :512 捕获仅 `trace_log.warn`，随后 :520 `updateState(failed)` 无条件执行，不再卡 loading。Round 1 指出的错位（try/catch 只加在 per-account 段）已修正，且 per-account 段（:353-363）原有保护保留不冲突。回归测试真实触达新代码：单测 `:357-410`（`execute_connector` mockRejectedValue 走满 3 轮 attempt，实测 2003ms=2 次 1s retry sleep，非 Round 1 假阳性特征）→ `list_by_source_instance_id` 返回 1 条 prior 观测 → 全轮失败 stale 循环进入 → `insert` mock 抛错被新 try/catch 捕获 → `updateState(failed)` 仍执行 → 断言 `state.status === "failed"` 与 `insert_mock` toHaveBeenCalled。该测试在 pre-t370 代码上（无 try/catch，insert 抛错传播过 :520）会失败，构成真实回归验证。
- 结论：已消除。

### t370_code_f002（复核：已消除）- force 锁竞态已 token 化，finally 仅删自己 token，is_locked 时间戳语义保持

- 严重度：已消除（Round 1 important）
- 锚点：行为缺陷（force 覆盖锁后被旧刷新 finally 误删，可级联并发）
- 位置：`src/main/core/scheduler/refresh-service.ts:208-209`（`locks` 存 `{token, at}` + `lock_seq`）、:236-237（`lock_token = ++lock_seq`、`locks.set` 存 `{token, at}`）、:526-530（finally compare-and-delete）
- 复核：
  1. 锁值从 `number`（时间戳）改为 `{token, at}`；每次 refresh 同步获取唯一 `lock_token = ++lock_seq`（首 await 前完成，单线程无交错，token 不重复）。
  2. finally（:527-529）先读当前锁，仅当 `current?.token === lock_token` 才 delete。force 覆盖旧锁（新 token）后，旧刷新 finally 比对不通过不删新锁；新刷新 finally 删自己锁。时序 A(自动,t1)→B(force,t2) 覆盖 → A finally t1≠t2 跳过 → B finally 删 t2，锁生命周期正确，级联消除。
  3. 锁获取在首个 await 之前同步完成；所有提前 return（:246/:253 未知实例）与异常路径均在 try 内 → finally 恒执行，无锁泄漏。
  4. `is_locked`（:213-222）语义保持：:216 `Date.now() - lock.at < LOCK_TIMEOUT_MS` 判持锁，:218 stale 日志用 `lock.at`——时间戳语义未破坏。
  5. AC-001 单测「force=true bypasses the in-flight lock」(t370 AC-001)（`:603-641`）断言持锁时 force 第二轮进入采集（execute_connector 2 次），force 绕过行为验证通过。
- 结论：已消除。

### t370_code_f003（维持 Round 1 判定）- 范围项 1「refreshNow 返回是否已受理」未落地

- 严重度：minor（范围项，非 AC）
- 位置：`src/main/core/scheduler/connector-scheduler.ts:98-104`、`refresh-service.ts:55`
- 复核：本次 diff 无对应改动，`refresh`/`refreshNow` 仍返回 void。范围项 1 非契约区 AC，不判 blocking，维持 Round 1 规格对齐缺口判定，供后续 task 处理。
- 结论：维持（未修，同意按非门禁项处理）。

## 本轮新发现

- 无 blocking / important。

## 结论

- 前轮 finding 复核：f001 已消除（全轮失败 stale 插入段 try/catch 包住 list+insert，:520 updateState(failed) 无条件执行，回归测试真实触达新代码、在旧代码上必失败）；f002 已消除（锁 token 化 + finally compare-and-delete 只删自己 token，force 覆盖后旧刷新不误删新锁，is_locked 用 lock.at 语义保持）；f003 维持 Round 1 判定（范围项 1 非 AC，未修不判 FAIL）。
- 本轮新发现：0 条
- 未进表提示：
  - f002 的 token 化清理无专项级联测试（force 覆盖期间旧刷新完成不删新锁）——AC-001 已覆盖 force 绕过行为，清理正确性由代码比对保证，可后续补 cascade 场景测试，非门禁项。
  - AC-002 单测耗时 2003ms（3 轮 attempt 含 2 次 1s retry sleep），为全轮失败重试逻辑固有成本，与既有 t155/t172 多秒测试风格一致；与 Round 1 相比本次抛错点确在全轮失败 stale 段（插入 mock 为 `insert` 而非主 `insert_batch`），非假阳性。
- 总体判断：Round 1 两条 important/blocking（f001/f002）均按建议方向修复并经测试验证（`vitest run tests/unit/scheduler tests/integration/scheduler` 108 全绿），无新增未解决 critical/important → PASS
- 系统性 follow-up：无

verdict: PASS
