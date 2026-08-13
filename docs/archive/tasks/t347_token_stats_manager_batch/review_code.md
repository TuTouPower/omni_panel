# Task review t347（reviewer_focus: 代码）

- task：`t347_token_stats_manager_batch`
- spec：`docs/tasks/t347_token_stats_manager_batch/spec.md`
- diff_anchor：`4d73052c2bc07165a3393d872324c4f269e59cd8`
- target：`git diff 4d73052c2bc07165a3393d872324c4f269e59cd8`
- round：1
- reviewed_at：2026-08-13 21:11 UTC+8

reviewed_scope: 494b8587bc755a60

## Findings

### t347_code_f001 - records 最长且 daily/sessions 在末批前耗尽时，buckets 整轮不重建（AC-001 回归）

- 严重度：important
- 锚点：AC-001（一轮 upsert 只触发一次 buckets 重建）+ 可观测数据陈旧（dashboard 用量读 `token_stats_buckets` 全表聚合，见 `INSERT_BUCKETS_SQL` 仅聚合 `token_stats_daily`）
- 位置：`src/main/core/token-stats/manager.ts:98-99` + `src/main/core/token-stats/token-stats-store.ts:947-949`
- 问题：`apply_batches` 的 `is_last = offset + UPDATE_BATCH_SIZE >= total` 只标末尾 offset 批；但 `upsert_sessions` 在 `deltas.length === 0 && daily.length === 0` 时**早退**（store:947-949），早退发生在 buckets 重建代码（store:991-994）之前。当 `records.length > max(sessions.length, daily.length)`（代码注释明言 "records/daily 可数倍于 sessions"）且 daily/sessions 尾部未延伸到末批时，末批切片为 `([], [], true)` → store 早退 → **整轮无一次 buckets 重建**。例：daily=2000、records=5000 → batch1 提交 daily（rebuild=false），batch2/3 daily 为空，batch3 传 true 但早退；buckets 仍为空，query_buckets 读到陈旧数据。改动前每批无条件重建，batch1 已能反映 daily；改动后此路径整轮漏重建，属本次引入的回归。测试未覆盖该形态（manager 测试 sessions 最长或 daily 为空，store 测试只验 flag 语义）。
- 建议：store 早退条件改为 `if (deltas.length === 0 && daily.length === 0 && !rebuild_buckets) return;`，使末批即使空切片仍执行 `delete_buckets_stmt + insert_buckets_stmt`；或 manager 记录本轮是否处理过 daily/sessions，在末批空时仍显式触发一次重建。

### t347_code_f002 - update_config 恢复路径 start() 未清 pending restart_timer，30s 后旧 config 覆盖新 child（AC-003 副作用）

- 严重度：important
- 锚点：AC-003（熔断恢复路径）引入的 `start(config)` 调用 + 可观测行为缺陷（配置被回退 + 多余一次重启）
- 位置：`src/main/core/token-stats/manager.ts:252-257`（新 else 分支）、`:203-212`（exit 自动重启 timer）
- 问题：正常退出（非熔断）后 exit 处理器会排一个 30s `restart_timer`（:203-212），期间 `child === null`。此时 `update_config` 落入新 else 分支调 `start(config)`，fork 新 child 并应用新配置，但**未清掉已排队的 restart_timer**。该 timer 到点后 `if (current_config)`（新配置，truthy）→ `start(cfg)`（捕获的是**旧** config）→ `start` 内 `if (child) stop()` 杀掉刚启动的新 child，再以旧 config 重新 fork。结果：用户新配置短暂生效后被回退、额外一次 collector 重启。熔断主路径（trip 时 current_config=null 且 exit 不排 timer）无此问题，故 AC-003 本身成立；缺陷只在"非熔断自动重启窗口 + 窗口内改配置"出现。改动前该窗口内 update_config 被忽略（不 start），不会触发回退式重启，此为新代码路径引入。
- 建议：`update_config` else 分支（或 `start` 开头）先 `if (restart_timer) { clearTimeout(restart_timer); restart_timer = null; }` 再 start；或复用 `stop()` 的 timer 清理逻辑。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（f001、f002），均 important
- 未进表的提示：
  - 文件过大：`src/main/core/token-stats/token-stats-store.ts` 1544 行，超过实现源码 800 行阈值，但为 task 前已存在，本 task 仅净增 28 行，按降级规则只提示不出 finding。`manager.ts` 281 行未超阈值。
  - 圈复杂度：`apply_batches`/`update_config`/`same_config` 均 ≤3，无提示。
  - 已接受风险（spec「风险与回退」）：末批失败时整轮 buckets 不更新，靠幂等下轮重算——实现与 spec 声明一致，不出 finding。
  - 范围外观察：非熔断退出窗口内改配置被忽略/回退的问题在改动前即存在（改动前为"忽略"，改动后为"生效后回退"，见 f002），不重复单列。
- 总体判断：AC-001 在 records 最长路径下存在整轮漏重建回归（f001），AC-003 恢复路径引入悬空 timer 配置回退缺陷（f002）；两项均未解决，FAIL。
- 系统性 follow-up：无
- AC 复验披露：
  - AC-001：`re_verified`——逐批推演 `is_last` 与 store 早退交互，确认 records 最长 + 末批空切片时整轮不重建（f001）。
  - AC-002：`re_verified`——catch 后 offset 仍推进、循环末 `on_update` 触发，代码路径与测试均确认；失败批次数据丢弃由 spec 兜底（collector 重发）。
  - AC-003：`re_verified`——trip 时 current_config=null 且不排 timer，`update_config`→`start` 重新 spawn，测试覆盖；副作用见 f002。
  - AC-004：`re_verified`——`sort_keys` 递归按 key 排序后 `JSON.stringify` 判等，`{a:1,b:2}`/`{b:2,a:1}` 判等，测试覆盖。
  - coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 21:17 UTC+8)

reviewed_scope: dff64761a931bdeb

### 前轮 finding 复核（以当前 diff 为准，非处置表自称）

- **t347_code_f001（important）— 已消除**：`token-stats-store.ts:947-949` 早退条件改为 `deltas.length === 0 && daily.length === 0 && !rebuild_buckets`，session 循环包 `if (deltas.length > 0)`（:957）。逐批推演：records=5000/daily=2000 时，batch1 写 daily 且 `is_last=false`，batch2 空数据早退，batch3 `upsert_sessions([], [], true)` 不再早退，tx 内跳过空循环后执行 `delete_buckets_stmt + insert_buckets_stmt`，整轮恰好一次重建并聚合全部 daily。f001 场景已闭环。
- **t347_code_f002（important）— 已消除**：`manager.ts:255-259` update_config else 分支在 `start(config)` 前 `clearTimeout(restart_timer)` + 置 null。逐帧核验：非熔断退出后 exit handler 排 30s timer（child=null）；窗口内 update_config 配置不同 → else 分支清 timer → start；timer 不再触发，旧 config 不会 kill 新 child 回退。熔断主路径（trip 时 current_config=null 且不排 timer）不受影响，AC-003 保持。

### 本轮新发现

### t347_code_f003 - f001/f002 修复场景无专门回归测试

- 严重度：minor
- 锚点：行为缺陷防护缺口（非 blocking）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:288-299`、`tests/unit/main/core/token-stats/manager.test.ts:402-467`
- 问题：两个修复的关键边界均无直接回归测试。(1) store 级 AC-001 测试只覆盖 `false 不重建` + `true 重建`（带数据），未覆盖「空数据 + true 仍重建」这一 f001 修复场景；manager 侧 records 最长用例（:154-177）末批 `upsert_sessions([], [], true)` 走 mock（不计早退），不会捕获早退条件回退。(2) f002 修复（非熔断退出窗口内 update_config 清 timer）无测试：现有 AC-003 测试（:402-422）走熔断路径（trip 时不排 timer），删除 clearTimeout 后该测试仍过。若后续改动把 store 早退改回 `deltas.length===0 && daily.length===0`，或删掉 f002 的 clearTimeout，当前 111 测试不会转红。
- 建议：store 测试补一条 `upsert_sessions([], [], true)` 断言 buckets 仍重建（可复用 :288-299 结构）；manager 测试补「非熔断退出（1 次 exit）+ 30s 窗口内 update_config」用例，断言仅 fork 一次且配置为新值。

### 结论

- 前轮 finding 复核：f001 已消除、f002 已消除（均经 diff 与逐批推演独立复核；实测 store+manager 111 测试全过）。
- 本轮新发现：1 条（f003，minor）
- 未进表的提示：无（store.ts 文件过大提示已在 Round 1 结论段登记，未变；manager.ts 281 行未超阈值；f003 属覆盖可更广，不满足 blocking 硬阈值）
- 总体判断：Round 1 两项 important 均已修复，无未解决 critical / important；仅存 minor 测试覆盖缺口。PASS。
- 系统性 follow-up：无
- AC 复验披露（本轮）：AC-001/AC-002/AC-003/AC-004 均 `re_verified`——f001/f002 修复经代码路径逐批推演复核，并实际运行 `vitest run manager.test.ts token-stats-store.test.ts`（111 passed）佐证；AC-004 未变（sort_keys 逻辑与 Round 1 一致）。
  - coverage = 4 / 4

verdict: PASS
