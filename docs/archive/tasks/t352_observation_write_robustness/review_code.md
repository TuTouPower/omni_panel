# Task review t352（reviewer_focus: 代码）
- task：`t352_observation_write_robustness`
- spec：`docs/tasks/t352_observation_write_robustness/spec.md`
- diff_anchor：`1f2978f0961afbac9105b07341b34c2ce1bc652d`
- target：`git diff 1f2978f0961afbac9105b07341b34c2ce1bc652d`
- round：1
- reviewed_at：2026-08-14 00:05 UTC+8

## Findings

### t352_code_f001 - AC-001 批量事务吞掉系统性全批失败，不再上抛触发重试
- 严重度：minor
- 锚点：AC-001 回退语义评估（spec 风险与回退「坏条目跳过并记 per-obs 错误日志」）
- 位置：`src/main/core/observation/observation-store.ts:227-240`（batch_tx 内 per-obs catch 吞错）、`src/main/core/scheduler/refresh-service.ts:321`（insert_batch 调用点无失败信号）
- 问题：旧语义「insert 失败 throw → 外层 max_attempts 重试 → 持久失败后标 failed」（refresh-service.ts:395-399 捕获重试，旧 try/catch + rethrow）被移除。对「个别坏条目」（如某条 NOT NULL 违例）新语义按 spec 回退策略跳过并记 error 日志，比旧的全轮重跑 connector 更优，属合理改进。但对「系统性全批失败」（connector 全部产出坏数据、或 DB 写入级错误）出现退化：所有 insert_one 抛错被逐条吞掉，batch_tx 提交空事务不抛，refresh 继续走 `observations_to_ready_state` 并把 instance 标 `status:"ready"`（refresh-service.ts:386-393），items 由内存观测构建、DB 实际零落库；重启后 ready 状态引用不存在的观测。旧代码此场景会重试并最终标 failed，不出现「ready 但零持久化」。
- 建议：不强改（spec 明确选用 skip+log 作为回退），但可在 batch 全失败时（如 batch_tx 内统计 `inserted == 0 && observations.length > 0`）抛一次错误或返回失败数，让 refresh 外层能区分「全部失败」与「部分坏条目」；或至少在 doc 注释标注该边界。属可选增强，不构成 blocking。

### t352_code_f002 - AC-003 schema_meta 建表 DDL 双处重复
- 严重度：minor
- 锚点：AC-003 实现一致性
- 位置：`src/main/core/observation/observation-store.ts:73-76`（INIT_SQL）与 `:103-105`（migrate_observation_schema 内）
- 问题：`CREATE TABLE IF NOT EXISTS schema_meta` 定义在两处完全重复。现两处一致、IF NOT EXISTS + 同定义，无冲突、无害；但定义漂移风险（一处改列另一处漏改）留给了未来维护。
- 建议：可接受（migrate 自包含是单测直接调用 migrate_observation_schema 所需，见 tests/unit/observation_store_migration.test.ts）；如要收敛，migrate 内复用 INIT_SQL 中的常量即可，非必须。

## 结论
- 前轮 finding 复核：无（round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
  - AC-001 验证项：`db.transaction(fn)` 返回函数透传参数，`batch_tx(observations)` 传数组正确（better-sqlite3 事务包裹原函数签名）；`insert_batch([])` 空数组 return 短路正确（observation-store.ts:334）；事务内 per-obs catch 使单条失败不致整批 ROLLBACK，符合 spec 回退「跳过不拖垮整批」。
  - AC-002 验证项：`delete_dup_stmt` 泛化为 `stale = @stale`，stale 副本插入只清旧 stale=1 行、原观测 stale=0 保留（t174 语义保持）；非 stale 插入清旧 stale=0 同键同 ts 行，`get_latest` 结果确定（ORDER BY observed_at DESC, stale DESC LIMIT 1）；同键同 ts 至多 1 stale + 1 非 stale 两行，tie-breaker 确定。单测 `dedupes non-stale same-key same-ts duplicate inserts` 覆盖。
  - AC-003 验证项：`INSERT OR IGNORE` changes 语义首次 1、后续 0，标记幂等；并发首开竞态下 WAL 写锁串行 + busy_timeout=5000，后到连接 INSERT OR IGNORE 命中已存在行 → changes=0 跳过 DELETE，仅一次清理；且 create_observation_store 为单进程单次打开，实际无并发首开。单测 `runs the one-time kimi:total_quota purge only on first open` 覆盖。
  - 规格合规：三个 AC 均有实现；未偏航、无 YAGNI 顺手改进；非范围（留存策略）未动；`insert` 单条路径保留（refresh-service.ts:480 失败兜底仍用单条 insert，语义与旧 delete_stale_dup_stmt 一致）。
  - 质量：diff 触及文件行数合理（observation-store.ts 407 行，无膨胀）；无死代码（insert/insert_batch 均有调用点）；错误日志无敏感信息（仅 provider/account_id/metric_id + err.message）。
  - 测试实证：4 个相关测试文件 73 用例全过（含 3 条新 t352 用例）；`tsc --noEmit` 通过。
- 总体判断：三条 AC 实现正确、测试充分、边界已验证；两条 minor 均为文档级/可选增强，不构成门禁阻断。
- 系统性 follow-up：无

verdict: PASS
