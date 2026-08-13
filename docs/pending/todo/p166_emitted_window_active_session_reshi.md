# p166 emitted 时间窗裁剪下活跃长会话旧记录重发

- 来源：t346 遗留（2026-08-13，t346_gen_f001 important 部分处置）
- 内容：EMITTED_WINDOW_MS=30d 裁剪后，活跃长会话（>30 天持续触碰）的 key 过窗被删，下次 mtime 变化整段历史重发，重引入 ~200k records/collect 性能问题（DB REPLACE 幂等，非数据损坏）。spec 已接受裁剪权衡，30 天窗口把概率压到「会话 >30 天未触碰又被触碰」罕见场景。改进方向：裁剪时保留「近期 mtime 有变化的会话」的 key（需 emitted key 带会话维度），或按会话级去重标记。
- 处理：未开
