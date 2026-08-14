# p166 emitted 时间窗裁剪下活跃长会话旧记录重发

- 来源：t346 遗留（2026-08-13，t346_gen_f001 important 部分处置）
- 内容：EMITTED_WINDOW_MS=30d 裁剪后，活跃长会话（>30 天持续触碰）的 key 过窗被删，下次 mtime 变化整段历史重发，重引入 ~200k records/collect 性能问题（DB REPLACE 幂等，非数据损坏）。spec 已接受裁剪权衡，30 天窗口把概率压到「会话 >30 天未触碰又被触碰」罕见场景。改进方向：裁剪时保留「近期 mtime 有变化的会话」的 key（需 emitted key 带会话维度），或按会话级去重标记。
- 根因：collector.ts `emitted_record_keys` 为 `source|env|message_id` 记录级 key（record 带 session_id 但未入 key，collector.ts:130），`prune_emitted` 按 key 时间戳整体裁剪（collector.ts:135）。裁剪后，活跃长会话任一 jsonl mtime 变化触发 reader 整会话重合并（claude-reader.ts `merge_session_files`）→ 整段历史 records 因 key 已过窗而重发。emitted map 仅内存，重启本就全量重发一次（既有行为，collector.ts:122 注释）。
- 影响：30 天窗口内活跃会话被裁剪 → 下次触碰整段历史重发（~200k records/collect），DB REPLACE 幂等非数据损坏，仅性能/写放大。spec 已接受权衡，概率限「会话 >30 天未触碰又被触碰」罕见场景；不改进则常驻 agent 长会话周期性重发。
- 测试缺口：无「活跃长会话过窗后整段重发」定量测试；补「裁剪保留近期活跃会话 key」或「会话级去重标记」行为用例。
- 处理：t386
- 核实：2026-08-15 现状一致——EMITTED_WINDOW_MS=30d + 记录级 key 裁剪，reader 按脏会话整段重合并；改进方向未实施且与代码结构吻合（record 已带 session_id，key 加会话维度成本低；「保留近期 mtime 有变化会话」需新增按会话活动度跟踪，prune 侧当前不可见 reader 的 per-file mtime；「按会话级去重标记」实现更简）。方向合理，无需调整描述。
