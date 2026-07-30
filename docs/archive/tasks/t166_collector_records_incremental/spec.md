# Task spec

## 背景

collector 两个放大器：

1. `collector.ts:24 MAX_RECORDS=10000`，records emit 上限 `MAX_RECORDS*20=200000`。活跃大 session（单 session 最高 1.2 万 records）jsonl mtime 变化时，`merge_session_files` 全量 re-merge 该 session 的所有 records 并重发（`INSERT OR REPLACE` by message_id）。日志显示单日 15 次 "Stored 200000 records"，每次主进程内存峰值 + WAL 写放大（当前 WAL 88 MB）。
2. `index.ts:352` 每次 config 保存都 `tokenStatsManager.update_config` -> collector `configure()` -> `collect()`。日志显示单日 4720 次 "Config saved" + 139 次 update_config，绝大多数 tokenStats 配置未变却重跑全量 collect。

## 范围

- collector records emit 增量化：dirty session 重 merge 时，对比该 session 已知 message_id 集合，只 emit 新增/变化的 message_id（而非整 session 重发）。scan-state 需记录每 session 的 message_id 集。
    - 或退一步：records emit 不再 per-session 全量，改为 per-file 增量（文件 mtime 变化只发该文件新增的 records）。
- config 保存去抖：`onConfigSaved` 中仅在 `tokenStats` 子配置真变化时才 `update_config`；或 collector 侧对比新旧 config，未变则跳过 `collect()`。
- 降低 `MAX_RECORDS*20` 上限，或改为按 message 计数而非按 session 全量。

## 非范围

- 不改 records 查询（t162）/索引（t163）/图表数据源（t164）/窗口（t165）。
- 不改 scan-state 文件格式（仅可能新增 message_id 索引）。

## 验收标准

- [ ] 活跃 session jsonl 变化时，collector emit 的 records 数 ≈ 该 session 新增 message 数，而非整 session records 数。
- [ ] config 保存（tokenStats 未变）不触发 collector `collect()`。
- [ ] 单次 `collect()` 的 records emit 量从 20 万级降至千级（稳态增量）。
- [ ] 主进程 WAL 增长速度显著下降。
- [ ] 单测覆盖 records 增量 emit 与 config 去抖。

## 依赖与约束

- 前置：无强依赖；但与 t162/t164 互补（查询端 + 渲染端已优化后，写入端也得优化）。
- scan-state 新增 message_id 索引会增加 state 文件体积（当前 11.6 MB）——需评估是否值得，或改用 hash 集合压缩。
- 兼容性：scan-state 格式变更需向后兼容（旧 state 无 message_id 集时退化为首次全量 emit）。
