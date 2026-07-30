# Task spec

## 背景

`token_stats_records` 表仅主键索引 `(message_id, source, env)`，无 `(env, timestamp)` 索引。`query_records` 的 `WHERE env=@env AND timestamp BETWEEN @start AND @end ORDER BY timestamp DESC` 对 38 万行全表扫描。加索引后变为索引范围扫描。

## 范围

- `token-stats-store.ts` `INIT_SQL` 增加 `CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC)`。
- 新增 migration v4：对已建库补建该索引（`CREATE INDEX IF NOT EXISTS` 本身幂等，但走 user_version 递增记录迁移事实）。
- 评估是否同时给 `token_stats_sessions` 加 `(env, ended_at)` 索引（`query_sessions` 按 env 过滤 + 排序）；若 `query_sessions` 当前无时间窗 ORDER BY 则不加。

## 非范围

- 不改 `query_records` 的 LIMIT/时间窗逻辑（t162）。
- 不改图表数据源（t164）。
- 不改 collector（t166）。

## 验收标准

- [ ] `token_stats_records` 存在 `(env, timestamp DESC)` 索引。
- [ ] `EXPLAIN QUERY PLAN` `query_records` 的典型查询（env + timestamp 范围）走 `idx_records_env_ts`，非全表扫描。
- [ ] migration v4 在已存在库上幂等执行，不丢数据。
- [ ] 单测覆盖 migration v4（旧 user_version -> 建索引 -> user_version=4）。

## 依赖与约束

- 无前置依赖；与 t162 互补（索引 + limit 共同生效）。
- 索引会占用额外磁盘（预估 38 万行 × ~40B = ~15 MB），可接受。
