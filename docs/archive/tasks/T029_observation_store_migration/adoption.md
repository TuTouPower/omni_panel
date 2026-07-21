# Adoption T029

owner 自审（observation-store ALTER TABLE migration，合并到现有 label migration）。

| 项                                                             | decision | rationale                                                                | status |
| -------------------------------------------------------------- | -------- | ------------------------------------------------------------------------ | ------ |
| ALTER TABLE ADD COLUMN last_error                              | 采纳     | 旧 observation.sqlite（109MB）无 last_error 列，PRAGMA 检查后 ALTER 加列 | 已修   |
| 合并到现有 label migration                                     | 采纳     | 避免重复 `const columns` 声明冲突（L126 已有）                           | 已修   |
| observation_mapping_error.test obs_base 补 window + last_error | 采纳     | typecheck 报 Observation type 必选 window + last_error 字段              | 已修   |

## 处置说明

- observation-store.ts L110 `db.exec(INIT_SQL)` 后，现有 label migration（L120-134）已声明 `const columns` + `column_names`。last_error migration 合并到该块后（L135-139），用同一 `column_names` 检查，避免重复声明。
- PRAGMA table_info 检查 `last_error` 列存在性 → 不存在则 `ALTER TABLE observations ADD COLUMN last_error TEXT;`。
- 单测 observation_store_migration.test.ts：2 用例（旧 schema 加列 + 新 schema 幂等）。
- observation_mapping_error.test.ts obs_base 补 `window: "month" as const` + `last_error: null`（Observation type 必选）。
- vitest 1430 passed（+2 migration）；typecheck 过。
