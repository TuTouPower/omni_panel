<!-- omni_powers: blueprint/specs/observation-store -->

# 观测存储（observation store）

数据脊柱。术语与不变量见 `domain.md`；产出观测的运行时见 `connector-runtime.md`。

## 数据模型（观测字段）

`observation_schema`（`src/shared/schemas/observation.ts`）：

| 字段                                                | 说明                                                           |
| --------------------------------------------------- | -------------------------------------------------------------- |
| `provider`                                          | 归属服务商，UI 按它聚合                                        |
| `source_instance_id`                                | 连接器实例 ID（宿主盖，脚本不可控）                            |
| `account_id`                                        | 账号稳定 ID（不变量 3：绝不用实例+序号）                       |
| `account_label`                                     | 账号显示名，不得含 secret                                      |
| `metric_id`                                         | 指标唯一标识                                                   |
| `raw_label` / `normalized_label` / `display_label?` | 三层标签模型（`name` 为 deprecated 别名）                      |
| `window`                                            | `second` / `day` / `month` / `total`                           |
| `used` / `limit`                                    | 用量与上限，均可 null                                          |
| `display_style`                                     | `percent` / `ratio`                                            |
| `reset_at`                                          | 窗口重置时刻，可 null                                          |
| `status`                                            | `normal` / `warning` / `critical` / `unknown`                  |
| `observed_at`                                       | 观测时刻（新鲜度源，宿主盖 poll/probe，脚本盖 script）         |
| `source`                                            | `poll` / `local` / `session` / `probe` / `wrapper` / `gateway` |
| `stale` / `last_error`                              | 采集失败标记                                                   |

`observation_ingest_schema = observation_schema.omit({observed_at, stale, last_error})`（LocalAPI 上报用，服务端补齐）。

## 接口（同步，`observation-store.ts`）

底层 **better-sqlite3（同步）**——方法返回普通值而非 Promise（这是"synchronous store, drop async fiction"重构的含义）。

- `insert(obs): void`
- `get_latest(provider, account_id, metric_id, source_instance_id): Observation | null`
- `list_latest_by_provider(provider): Observation[]`
- `list_by_source_instance_id(id): Observation[]`
- `prune(older_than_ms): number`
- `close(): void`

## 行为（现在是什么）

- **SQLite 单表 `observations`（追加，保留历史）**：字段对齐上表；PRAGMA `journal_mode=WAL`、`wal_autocheckpoint=1000`、`busy_timeout=5000`；索引 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)`。
- **当前值 = observedAt 最新胜出**（不变量 1）：`get_latest` 用 `ORDER BY observed_at DESC LIMIT 1`；`list_latest_*` 用相关子查询选 `observed_at = MAX(...)` over 同键。
- **历史保留**：每次 insert 是新行（无 upsert）。`prune` 删 `observed_at < cutoff` 的行，但**每键最新行永不删**（当前值不丢）。当前无调用方定期调 prune。
- **stale**：insert 写 `stale` 为 0/1；采集失败不覆盖 latest，靠 `stale:true`+`lastError` 标记。
- **迁移**：ad-hoc 列存在性检查——缺 `raw_label` 列则 `ALTER TABLE ADD COLUMN`（nullable，旧行存活），`row_to_observation` 从 `name`/`metric_id` 回填缺失标签。**非** schemaVersion 驱动。

## 边界

- 两套 label 模型并存：legacy `name`（deprecated 别名） vs 新三层 `raw_label`/`normalized_label`/`display_label`，DB 与 schema 仍带 `name` 兼容。
- DB 路径由引导层传入（不在 `paths.ts` 集中）。
