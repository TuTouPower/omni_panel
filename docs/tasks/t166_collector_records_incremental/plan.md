# Task plan

## 步骤与验证

1. 调研 collector records emit 路径：`scan_session_jsonls` -> `merge_session_files` -> `records` push；定位"整 session 重发"的根因点（`claude-reader.ts:495` `for (const r of f.records)` 无 diff） -> 验证：代码审查产出。
2. 设计增量方案 A（per-session message_id 集）：`SessionFileFacts` 或 scan-state 记录每 session 已 emit 的 message_id；merge 时只发新增。评估 state 体积增量 -> 验证：设计文档。
3. 方案 A 若 state 体积不可接受，退方案 B（per-file 增量）：文件 mtime 变化时，对比该文件上次 parse 的行集（hash），只 emit 新增行 -> 验证：设计文档。
4. 实现选定方案 + 单测（构造 mtime 变化场景，断言 emit records = 新增数） -> 验证：单测。
5. config 去抖：`onConfigSaved` 比较 `prev.tokenStats` vs `next.tokenStats`，不同才 `update_config`；或 manager 侧 `update_config` 比较 -> 验证：单测 tokenStats 未变时不 collect。
6. 调整 `MAX_RECORDS*20` 或改为按 message 计数 -> 验证：日志无 20 万突发。
7. `pnpm test` + 观察 collector 日志（`Stored N records` 应降至千级） -> 验证：稳态增量。

## 风险与回退

- 风险：增量 diff 逻辑错误导致 records 漏发或重复——message_id（sha256 前 32 位）已是稳定 dedup key，依赖它 diff 风险可控；但需覆盖"文件被截断重建"场景。
- 风险：scan-state 体积膨胀——message_id 集若全存会翻倍 state；需压缩（如只存 hash 前缀或 Bloom filter）。
- 风险：config 去抖误判 tokenStats 变化（如对象深比较陷阱）——用稳定的序列化比较（JSON.stringify 子树）。
- 回退：增量 emit 退回全量 per-session emit；config 去抖退回每次 update_config。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：collector emit 策略（增量）+ config 去抖。
- `docs/specs/collector_records_incremental.md`：新建累积 spec。
