# Task review t393（reviewer_focus: 通用）

- task：`t393_collector_codex_test_gap`
- spec：`docs/tasks/t393_collector_codex_test_gap/spec.md`
- diff_anchor：`7d915b823977a0d22eb59e66f9b174bcd629df57`
- target：`git diff 7d915b823977a0d22eb59e66f9b174bcd629df57`
- round：1
- reviewed_at：2026-08-15 09:19 UTC+8

## Findings

### t393_gen_f001 - AC-003 实现机制与 AC 字面表述有偏差（去重循环内联判定，非「循环前先 prune」）

- 严重度：minor
- 锚点：AC-003「emitted 裁剪在去重循环前执行」；spec 范围「去重循环前先 prune」
- 位置：`src/main/core/token-stats/collector.ts:174`（`should_emit_record`）、`:655`（去重循环）、`:697`（`prune_emitted`）
- 问题：AC 与 spec 字面写「去重循环前先 prune」，实现为：新增 `should_emit_record` 在去重循环内联判定窗口/会话活跃度，`prune_emitted` 移至源循环结束后做内存裁剪。可观察行为与 AC 意图一致——恰过窗且会话不活跃的 key 本轮即重发（不再延迟一轮），且 AC-003 测试锁定该可观察行为。字面方案（循环前 prune）实际不可行：会话 touch 在源循环内（`:632` 每 source 先刷 sessions touch 再进 records 循环）才刷新，若在源循环前 prune，活跃长会话的过窗 key 会被误判非活跃而删除→整段重发，破坏 t386 AC-001（该测试仍通过即证明未走此路径）。结论：实现是对 AC 意图的正确解释，但 handoff/spec 措辞与实际机制不一致，后续维护者若照 AC 字面「改回循环前 prune」会引入回归。建议在代码注释或 spec 补充偏差说明（本 review 即作为追溯记录）。
- 建议：非阻塞；在 `spec.md` 或 `handoff.json` 注明 AC-003 以「去重判定前移 + 循环后裁剪」实现、字面「循环前 prune」不可行（touch 就绪性），保持可追溯。

### t393_gen_f002 - session_key 派生逻辑在 should_emit_record 与 prune_emitted 重复

- 严重度：minor
- 锚点：无 AC 违反；可维护性（同形逻辑散落）
- 位置：`src/main/core/token-stats/collector.ts:180-182`（`should_emit_record`）与 `:154-156`（`prune_emitted`）
- 问题：两处各自执行 `key.split("|")` 并拼 `parts[0]|parts[1]|parts[2]` 派生会话键。若未来 `record_key` 格式变化（如加段/换分隔符），两处需同步修改，漏改会产生去重与裁剪判定的隐式不一致。
- 建议：非阻塞；可提取共用函数（如 `session_key_of(key: string)`）供两处复用；本期不动亦可接受。

## 结论

- 本轮新发现：2 条（均 minor，无 critical / important）
- 未进表的提示：AC-001 mock 感知 `jsonl_states` 经 `read_source`（collector.ts:458 `jsonl_states.set`）真实写入，回滚删除后 mock 才重产出——已验证测试对「回滚是否必需」敏感，非误信实现自述。AC-003 测试在旧实现（`emitted_record_keys.has` 去重 + 循环后 prune）下必挂（key 仍在表→跳过→records 空），确锁定新时序。AC-002 51000 条构造 + 三轮 collect 全文件 201ms，性能可接受。`EMITTED_WINDOW_MS` 新导出被 AC-003 测试使用，非死导出。
- 总体判断：四条 AC 全部实现且测试锁定可观察行为；生产改动仅 prune 时序一处（`should_emit_record` 前移 + `prune_emitted` 移源循环后），t346/t386 既有语义保持（相关测试全过）；无 blocking 问题，PASS。
- 系统性 follow-up：无

verdict: PASS

reviewed_scope: 6ec2aec488b79e3e
