# p163 collector 超上限跨轮截断游标（单源 >10000 sessions 数据不永久丢失）

- 来源：t345 遗留（2026-08-13，t345_code_f002 important 部分处置）
- 内容：单源 sessions/daily 总数 > MAX_RECORDS 时，collector 每轮只入列前 10000 条，截断部分被丢弃。t345 已撤销「回滚 state」方案（单源持续超限会活锁），改为不 break（后续 source 不被饿死）；但「截断数据不永久丢失」的完整方案需跨轮推进截断点——对未入列的 sessions 记账，每轮只推进一部分；或缓存未发出 key 集合到下一轮继续。属架构级改动（与 postMessage 失败回滚同源：扫描状态与 emission 原子性），建议单列 backlog `collector_failure_atomicity` 统一设计。
- 根因：collector.ts `source_cursors` 跨轮截断游标已实施（t345 AC-003/f008），单进程内截断数据跨轮推进不丢；但仅内存、按排序位置计数：a) 未入 scan-state（scan-state.ts 只持久化 5 个扫描 map），重启丢截断进度；b) 按 session_id 排序位置跳过（reader `[...dirty].sort()`），新会话排序在游标前会被计入跳过而永久漏发；c) postMessage 失败时游标随扫描状态一并回滚（collector.ts:635），截断轮重扫重发，工作重复但幂等。
- 影响：单进程运行内截断数据不永久丢失；跨重启游标归零，超限源只重复发前 10000 条（DB REPLACE 幂等，非数据损坏），前 10000 之后的数据在「重启频率高于截断发完所需轮数」时实际永久不发。新会话排序在游标前可能永久漏发（正确性缺口）。日常数据量远低于 MAX_RECORDS，现实不触发。
- 测试缺口：p165 已登记 daily 游标路径无测试；补「游标不持久化（重启后归零）」与「新会话排序在游标前被跳过」用例。
- 处理：t385
- 核实：2026-08-15 现状一致——跨轮截断游标已实施（collector.ts `source_cursors`），但仅内存 + 位置计数式：重启丢进度、新会话排序前置可能漏发，条目所述「截断部分被丢弃」需更新为「单进程内跨轮推进、重启归零」。单列 backlog `collector_failure_atomicity` 统一设计方向合理（游标与 postMessage 回滚同源，collector.ts:635 一并回滚），统一设计需覆盖游标持久化 + identity 式推进 + emission 原子性。
