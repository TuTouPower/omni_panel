# Task plan

## 步骤与验证

1. `token-stats-store.ts` INIT_SQL 末尾追加 `CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC)` → 验证：新建空库后 `.indexes` 含该索引。
2. 在 migration 段追加 `if user_version < 4 { db.exec("CREATE INDEX IF NOT EXISTS idx_records_env_ts ..."); db.pragma("user_version = 4"); }` → 验证：单测用 user_version=3 的旧库跑迁移后索引存在且 user_version=4。
3. `EXPLAIN QUERY PLAN` 断言：构造 `WHERE env=? AND timestamp BETWEEN ? AND ? ORDER BY timestamp DESC` 查 plan 含 `SEARCH token_stats_records USING INDEX idx_records_env_ts` → 验证：单测断言 plan 文本。
4. `pnpm test` 全量 → 验证：不回归。

## 风险与回退

- 风险：建索引在已存在大库（38 万行）上首次执行耗时——better-sqlite3 同步阻塞主进程数百 ms。可接受（一次性 migration）；若担忧可在 migration 内 `PRAGMA synchronous=NORMAL` 已是默认。
- 风险：`ORDER BY timestamp DESC` 与索引方向匹配，若查询改 ASC 会反向扫——当前 `query_records` 固定 DESC，匹配。
- 回退：`DROP INDEX idx_records_env_ts`。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats store schema 处补索引清单。
- `docs/specs/records_index_env_ts.md`：新建累积 spec。
