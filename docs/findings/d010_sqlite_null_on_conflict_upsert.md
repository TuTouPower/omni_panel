# d010 SQLite 唯一键含 NULL 时 ON CONFLICT UPSERT 永不命中（2026-08-03）

- 来源：t192
- 结论：SQLite 把 NULL 唯一键值视为互异，`INSERT ... ON CONFLICT(...) DO UPDATE` 对含 NULL 的键永不触发 conflict，会叠出重复行。含可空列的分组聚合表不能用行级 UPSERT，须按稳定标识（如 session）DELETE + 全量重建，或用 `GROUP BY` 归一 NULL 后再写。
- 证据：t192 `token_stats_hour_rollup.directory` 可空；s008 对比与 t192 实现采用会话级重建（DELETE + records 重算）后与 records oracle 逐行一致；对比观察：同组多条 records 若走行级 upsert 会因 directory NULL 叠加重复聚合行。
- 影响：派生聚合表、唯一索引设计须先确认无 NULL 参与键；可空维度入 PK 时考虑非空哨兵值（如 `'(unknown)'`）或会话级重建。
- 现状：有效
