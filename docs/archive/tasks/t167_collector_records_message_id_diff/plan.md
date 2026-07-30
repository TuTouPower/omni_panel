# Task plan

## 步骤与验证

1. 调研 emit 路径：`scan_session_jsonls` -> `merge_session_files` -> records push；定位 `claude-reader.ts:495` 整 session 重发点。确认 SessionFileFacts.records 是 per-file 全量 message 数组 -> 验证：代码审查产出。
2. 设计 message_id 缓存：SessionFileFacts 新增 `message_ids: Set<string>`（parse 时填充，替代/补充 records 用于 emit diff）。评估 state 体积（每 message_id 32 字符）-> 验证：设计记录。
3. scan-state 序列化扩展：`serialize_bucket` / `deserialize_bucket` 处理 message_ids 集合（序列化为数组；反序列化缺字段时空 Set）；向后兼容旧 state -> 验证：单测旧 state 反序列化不崩 + 首次全量。
4. emit diff：`merge_session_files` 合并各文件 records 后，对比该 session 已知 message_id 集，只 emit 新增；更新已知集 -> 验证：单测（新增 message / 无变化 / 文件截断 / 跨文件合并）。
5. collector 整合 + 观察日志（`Stored N records` 应从 20 万降至千级稳态）-> 验证：collector 单测 + 手动日志对比。
6. `pnpm test` 全量 -> 验证：不回归。

## 风险与回退

- 风险：diff 逻辑错误导致 records 漏发或重复——message_id（sha256 前 32 位）已是稳定 dedup key，依赖它 diff 风险可控；但需覆盖"文件被截断重建"场景（旧行被删后 message_id 集需清理，否则永不重发）。
- 风险：scan-state 体积膨胀——全量 message_id 集会显著增大 state 文件；需评估是否按 session 聚合去重、或定期裁剪已消失 session 的集。
- 风险：跨文件 session（主 transcript + subagent 文件共享 sessionId）的 message_id 集合归属——需在 session 级而非 file 级维护，避免重复 emit。
- 回退：emit diff 退回全量 per-session emit（scan-state 不读 message_ids 字段即可）。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：collector emit 策略（增量 message_id diff）。
- `docs/specs/ai-cli-token-stats-api.md`：records emit 契约补增量说明。
