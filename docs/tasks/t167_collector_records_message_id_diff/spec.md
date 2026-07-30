# Task spec

## 背景

t166 放大器 C 遗留。collector 对每个 dirty session 全量 re-merge records 并重发（`claude-reader.ts:495` `for (const r of f.records)` 无 diff），`INSERT OR REPLACE` by `(message_id, source, env)`。日志显示单日 15 次 "Stored 200000 records"（`MAX_RECORDS * 20` 上限），每次主进程内存峰值 + WAL 写放大（实测 WAL 88 MB）。活跃大 session（单 session 最高 1.2 万 records）的 jsonl mtime 变化就重发整 session 的 records。

t162/t163/t164 已解决查询/渲染端内存，但写入端放大仍在：collector → IPC → DB upsert → WAL。每次活跃 session 变动产生大量幂等 `INSERT OR REPLACE`（message_id 已存在则替换，无数据变化却消耗 IO）。

## 范围

- collector records emit 增量化：scan-state 缓存每 session（或每文件）已 emit 的 message_id 集；dirty session 重 merge 时 diff，只 emit 新增/变化的 message_id。
- scan-state 格式扩展：`SessionFileFacts` 增加 message_id 集合（非完整 records，避免 state 文件膨胀）；序列化/反序列化向后兼容（旧 state 无该字段时退化为首次全量 emit）。
- 验证 emit 量从整 session 级降至新增 message 级（稳态增量）。

## 非范围

- 不改 records 查询（t162）/索引（t163）/图表数据源（t164）。
- 不改 config 去抖（t166 已完成）。
- 不改 reader 的 jsonl 解析逻辑（只在 merge/emit 层加 diff）。

## 验收标准

- [ ] 活跃 session jsonl 变化时，collector emit 的 records 数 ≈ 该 session 新增 message 数，而非整 session records 数。
- [ ] scan-state 含 message_id 集合且向后兼容（旧 state 无字段时全量 emit 不漏）。
- [ ] 单次 `collect()` 的 records emit 量稳态降至千级（非 20 万）。
- [ ] 主进程 WAL 增长速度显著下降（对比改动前后日志 "Stored N records"）。
- [ ] 单测覆盖 diff 正确性（新增/无变化/文件截断重建/跨文件合并）。

## 依赖与约束

- 涉及 `claude-reader.ts`（SessionFileFacts / merge_session_files）+ `scan-state.ts`（序列化 message_id 集）+ `collector.ts`（emit）三处协议协同。
- scan-state 文件当前 11.6 MB；新增 message_id 集（sha256 前 32 位 × 数万）会显著增大，需评估压缩（如只存 Set 序列化、或按 session 分组去重）。
- 兼容性：旧 scan-state 反序列化时 message_id 集为空，首次 collect 全量 emit（等同现状），之后增量。
