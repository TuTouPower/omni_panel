# p163 collector 超上限跨轮截断游标（单源 >10000 sessions 数据不永久丢失）

- 来源：t345 遗留（2026-08-13，t345_code_f002 important 部分处置）
- 内容：单源 sessions/daily 总数 > MAX_RECORDS 时，collector 每轮只入列前 10000 条，截断部分被丢弃。t345 已撤销「回滚 state」方案（单源持续超限会活锁），改为不 break（后续 source 不被饿死）；但「截断数据不永久丢失」的完整方案需跨轮推进截断点——对未入列的 sessions 记账，每轮只推进一部分；或缓存未发出 key 集合到下一轮继续。属架构级改动（与 postMessage 失败回滚同源：扫描状态与 emission 原子性），建议单列 backlog `collector_failure_atomicity` 统一设计。
- 处理：未开
