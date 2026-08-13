# Task review t352（reviewer_focus: 测试）

- task：`t352_observation_write_robustness`
- spec：`docs/tasks/t352_observation_write_robustness/spec.md`
- diff_anchor：`1f2978f0961afbac9105b07341b34c2ce1bc652d`
- target：`git diff 1f2978f0961afbac9105b07341b34c2ce1bc652d`
- round：1
- reviewed_at：2026-08-14 00:00 UTC+8

## Findings

### t352_test_f001 - AC-001「单事务原子写入」未被断言区分；测试标题 over-claim「atomically」

- 严重度：minor
- 锚点：AC-001
- 位置：`tests/integration/observation/observation-store.test.ts:125-141`（`it("insert_batch writes atomically and skips bad rows individually (t352 AC-001)")`）
- 问题：测试标题声称「writes atomically」，但断言只覆盖「坏条目跳过 + 其余条目提交」：`not.toThrow()`、`count_observations() === 2`、`get_latest` 为 7002/used=20。若实现回归为 per-row autocommit（逐条 insert、各自提交、坏行跳过）——即 AC-001 的「走单事务，不再逐条 autocommit」完全未实现——这三条断言**同样全部通过**。spec「可测试性声明」宣称「store 单测断言事务」，实际未断言事务边界（BEGIN/COMMIT 一次）。已确认：实现正确（`batch_tx = db.transaction(...)`，observation-store.ts:227；且 better-sqlite3 事务内 try/catch 吞错后正常提交，count=2 实证通过），故这是覆盖细微缺口而非实现缺陷。缓解因素：insert_one 的 per-row try/catch 吞掉全部行级错误后，原子性只能通过 DB 级错误（busy/IO）暴露，API 层无确定性注入点，直接断言单事务实际困难；可观察契约「坏条目跳过、其余提交」已被测。
- 建议：可将测试标题改为「skips bad rows individually and commits the rest」（不声称 atomicity），或新增一用例注入 DB 级失败（如并发连接持写锁触 SQLITE_BUSY）断言整批回滚、无部分写入。当前不阻断。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无迁就实现的改测。既有 t174/t186 dedupe/prune 测试原样保留，在新 `delete_dup_stmt`（同键同 ts 同 stale 清旧行）语义下仍成立并全部通过；既有 refresh-service 测试断言未改动，仅补 mock 的 `insert_batch` 方法（扁平化 push 进 `inserted`，语义与断言兼容）。全部 159 条相关测试实测通过（observation-store 24 + migration 5 + refresh unit/integration 45 + grok lifecycle + 5 个存量 store 依赖文件 85）。
- 本轮新发现：1 条（minor）
- 未进表的提示：
  - refresh 层 insert vs insert_batch 调用点无测试锁定：三个 mock（`tests/integration/scheduler/refresh-service.test.ts:136-137`、`tests/unit/scheduler/refresh-service.test.ts:75-77`、`tests/integration/connector/grok_oauth_account_lifecycle.test.ts:50-51`）扁平化后不可区分二者；若 refresh 回归逐条 insert，测试仍过。属系统边界（store 接口）内部调用细节，非用户可观察行为，按 mock 边界原则可不锁。
  - AC-001 bad-row 机制依赖 provider 违反 NOT NULL 触发失败（已核实：生产 schema `provider TEXT NOT NULL`，observation-store.ts:47；`delete_dup_stmt` 先绑 NULL 无害、`insert_stmt` 触发约束异常）。当前测试只锁可观察结果不锁机制——若 insert_batch 改为静默预过滤坏行，count=2 同样通过。可加 per-obs error log 断言收紧，非必需。
  - AC-002 的 batch 内同键同 ts 去重（一批两次同键同 ts）未单独用例，与单 insert 共用 `insert_one` 同路径，覆盖等价。
- 总体判断：三条 AC 均有测试且验证真实可观察行为（AC-002/003 断言强、可证伪）；仅一条 minor 覆盖细微缺口，非 blocking。
- 系统性 follow-up：无

verdict: PASS
