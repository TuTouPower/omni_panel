---
tid: "t163"
slug: "records_index_env_ts"
title: "token_stats_records 加 env+timestamp 索引消除全表扫描"
status: "done"
branch: "t163_records_index_env_ts"
worktree: ""
review_level: "full"
diff_anchor: "43c6d1637387694101c1113bc138afa69d81df04"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t163_records_index_env_ts

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: 43c6d163（main）。
- INIT_SQL 末尾加 `CREATE INDEX IF NOT EXISTS idx_records_env_ts ON token_stats_records(env, timestamp DESC)`。
- migration v4：user_version<4 时 CREATE INDEX IF NOT EXISTS + pragma user_version=4（幂等，fresh DB 已由 INIT_SQL 建好，此处 no-op）。
- 索引列顺序 (env, timestamp DESC) 匹配 query_records 的 WHERE env 等值 + timestamp 范围 + ORDER BY timestamp DESC，index range scan 免额外 sort。
- 测试：migration v4（v3 库 reopen 建索引 + user_version=4）、EXPLAIN QUERY PLAN（env+ts 窗口走 idx 非 SCAN）、v2 测试 user_version 3→4 断言更新。
- 黑盒：pnpm test 184/1884 全过。

## Review 处置

### Round 1 (2026-07-30 22:38 UTC+8)

code reviewer: PASS（零 finding）。test reviewer: FAIL（2 finding）。

| finding_id     | severity  | status | rationale                                                                                                                               | fix_ref                                                        |
| -------------- | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| t163_test_f001 | important | 已修   | v2 测试清理循环 `i<10` 与 `i<19` 不一致（漏改），统一为 `i<20`+`last_err=undefined`+break                                               | tests/unit/main/core/token-stats/token-stats-store.test.ts:565 |
| t163_test_f002 | minor     | 遗留   | EXPLAIN 用手写等价 SQL 而非 query_records 接口；store 不暴露 SQL 钩子，验证 plan 必须手写等价 SQL，当前已实测等价，实现变化时有漂移风险 | tests/unit/main/core/token-stats/token-stats-store.test.ts:484 |

## 收尾报告

### 验收标准勾选

- [x] `token_stats_records` 存在 `(env, timestamp DESC)` 索引。
- [x] `EXPLAIN QUERY PLAN` 典型查询走 `idx_records_env_ts`。
- [x] migration v4 幂等，不丢数据。
- [x] 单测覆盖 migration v4。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL（f001 已修，f002 遗留）
- Round 2 code：N/A（未改代码）
- Round 2 test：PASS

### 遗留

- `t163_test_f002`：EXPLAIN 测试手写等价 SQL 非走 query_records 接口；store 未暴露 SQL 钩子，验证 plan 需手写等价 SQL，属测试基建限制，当前已实测等价。

### 结果摘要

records 表 (env, timestamp DESC) 复合索引落地。query_records 的 env+timestamp 窗口查询从全表 SCAN 改为 idx_records_env_ts index range scan，免额外 sort（ORDER BY DESC 方向匹配）。migration v4 对已存在库幂等补建。
