# Task review t163（reviewer_focus: 测试）

- task：`t163_records_index_env_ts`
- spec：`docs\tasks\t163_records_index_env_ts/spec.md`
- diff_anchor：`43c6d1637387694101c1113bc138afa69d81df04`
- target：`git diff 43c6d1637387694101c1113bc138afa69d81df04 -- tests/`
- round：1
- reviewed_at：2026-07-30 00:00 UTC+8

## Findings

### t163_test_f001 - v2 测试清理循环 refactor 不一致（for<10 vs if<19）

- 严重度：important
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:565`（v2 migration 测试的 finally 清理块）
- 问题：本次改动把 `if (i < 9)` 改为 `if (i < 19)`、`Date.now() + 50` 改为 `+ 100`，但**没有同步把外层 `for (let i = 0; i < 10; i++)` 改成 `i < 20`**。结果：
    - 循环上限 10 次未变，但 `i < 19` 在 i ∈ [0,9] 范围内**恒为真**；
    - 第 i=9 次失败后仍会 spin-wait 100ms，然后循环结束退出；
    - 重试次数（10）和单轮等待（100ms）的组合与旁边新增的 v4 测试（20 次 × 100ms）不一致；
    - 实际清理窗口比本意少一半，恢复能力弱于 v4 新测试——可能是复制粘贴漏改。
    - 非危险模式（未掩盖断言失败：清理放在 try/finally 外，断言已先执行），但属 refactor 一致性 bug，本轮测试虽 PASS 但代码不对。
- 建议：把 `for (let i = 0; i < 10; i++)` 同步改为 `i < 20`，使重试次数与 `if (i < 19)` 边界一致（最后一次失败后不再 spin）。或反过来把 `if (i < 19)` 改回 `if (i < 9)` 保持 10 次。

### t163_test_f002 - EXPLAIN 测试用硬编码 SQL 而非走 query_records 接口

- 严重度：minor
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:484-488`（"query_records env+timestamp window uses idx_records_env_ts"）
- 问题：测试名为"query_records ... uses idx"，但实际不走 `store.query_records(...)`，而是新开 Database 连接、手写一条**字面等价**SQL（`WHERE env = 'win' AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp DESC`，占位符用 `?` 而实现用命名参数 `@env/@start/@end`）做 EXPLAIN。语义当前等价（经实际验证两路径 plan 均为 `SEARCH ... USING INDEX idx_records_env_ts`），但：
    - 如果实现侧 `query_records` SQL 未来变化（例如 t162 加 LIMIT、加其他 WHERE），此测试无法发现回归——计划是针对"测试代码里的 SQL"，不是"被测代码的 SQL"；
    - 断言 `plan_text.not.toContain("SCAN")` 在未来若实现加了 `OR env IS NULL` 之类使优化器放弃索引时也无法捕获。
    - 不构成 AC 失败：spec AC 明文要求"EXPLAIN QUERY PLAN query_records 的典型查询"，字面 SQL 已覆盖典型形。归为覆盖建议。
- 建议：可选改成通过 monkey-patch `db.prepare` 捕获 `query_records` 实际发出的 SQL 再 EXPLAIN；或在测试注释里注明"本 SQL 形与 query_records 实现一致，手动同步"。当前实现可接受。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：2 条（1 important / 1 minor）
- 总体判断：AC 覆盖到位（v4 migration 幂等 + user_version=4 + EXPLAIN 走索引 + 非全表扫描均有断言；v2 user_version 3→4 的更新与实现侧 `db.pragma("user_version = 4")` 一致，归因合法——reopened 库会跑到最新 migration）。EXPLAIN 断言可靠（验证：env+ts 窗口走 idx；无 env 过滤时 SCAN 是 SQLite 合理行为，spec 未要求覆盖）。清理降级 warn 有理由、不掩盖断言失败。主要问题是 v2 清理循环 refactor 漏改上限，须修。

verdict: FAIL

## Round 2 (2026-07-30 02:20 UTC+8)

### 前轮 finding 复核

- **t163_test_f001（important）→ 已修**：`tests/unit/main/core/token-stats/token-stats-store.test.ts:565` v2 测试清理循环已从 `for (let i = 0; i < 10; i++)` + `if (i < 9)` 改为 `for (let i = 0; i < 20; i++)` + `if (i < 19)`，配合 `last_err = undefined` + `break`。全 diff 共三处清理循环（v2 reopened 测试 / v4 migration 测试 / EXPLAIN 测试）均统一为 `i<20` + `i<19` + 100ms busy-wait，一致性恢复。非换形式弱化：重试次数与边界真实翻倍，最后一次失败后不再 spin。修复归因合法（refactor 漏改，非实现 bug）。
- **t163_test_f002（minor）→ 遗留（维持）**：EXPLAIN 仍走手写字面等价 SQL（`:484-488`），未走 `store.query_records(...)`。store 未暴露 SQL 钩子，本轮代码未动，维持遗留判定合理。语义当前等价（两路径 plan 均为 `SEARCH ... USING INDEX idx_records_env_ts`），不构成 AC 失败。

### 本轮新发现

0 条。扫描范围：

- 危险模式：无恒真断言、无删/反转 expect、无 `.skip`/`.only`、无 `@ts-ignore`、无 mock 误用、无阈值掩盖。清理失败降级为 `console.warn` 有理由（Windows EBUSY 与正确性无关，断言已先执行），不掩盖失败。
- AC 覆盖：v4 migration 幂等 + user_version=4 + idx_records_env_ts 存在 + EXPLAIN 走索引 + 非全表扫描，均有断言。
- 运行确认：`npx vitest run token-stats-store.test.ts` → 26 PASS / 0 FAIL。

### 结论

前轮 f001 已修、f002 维持遗留（符合处置表）。本轮 0 新 finding。

verdict: PASS
