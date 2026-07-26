# Task spec

## 背景

`src/main/core/logging.ts:71-79`：单日日志文件写满 50MB（`MAX_LOG_FILE_BYTES`）后**静默停写**，只在首次越限时打一条 warn。t153 排查用量面板保存回环时，循环日志 16 分钟写满 52MB 撞顶，此后应用继续运行的所有日志全部丢失，调试包的关键标记日志也被吞掉，严重妨碍定位。当前处于开发测试阶段（debug 级日志量大），撞顶概率更高。

## 范围

- `initLogging` 文件写入路径：写满 `MAX_LOG_FILE_BYTES` 后轮转——当前文件改名带段号（如 `app-<date>.1.log`），继续写新的 `app-<date>.log`。
- 防磁盘 DoS：单日段数设上限（如 10 段 ≈ 500MB），超上限才允许停写并 warn（此时已是异常中的异常）。
- `cleanupOldLogs` 确认/扩展覆盖段文件（`*.log` 后缀已匹配，需验证 mtime 清理语义对段文件正确）。
- `exportCurrentLog` 语义明确化：导出当前段即可，或拼接当日全部段（实现时取简单者）。
- 单元测试：轮转触发、段号递增、段上限停写、旧文件清理。

## 非范围

- 不改日志级别策略（`defaultLogLevelForEnv`）、不改 7 天保留期、不改 scrubber。
- 不引入外部日志库（保持零依赖手写，仿 `writeJsonAtomic` 的极简风格）。
- 不改 renderer 日志转发限流（100 条/秒）。

## 验收标准

- [ ] 写满 50MB 自动轮转：旧段保留、新段继续写，无静默停写（单测可证：注入小 `MAX_LOG_FILE_BYTES` 驱动）。
- [ ] 单日段数达上限后停写并打 warn（防循环日志写爆磁盘）。
- [ ] 7 天清理对段文件生效。
- [ ] `pnpm test` 全绿，`pnpm typecheck` 通过。

## 依赖与约束

- 写入路径已是串行 Promise 链（`pending_write`），轮转逻辑须在同一链上，避免并发 rename/append 竞态。
- 日志文件命名变化会影响 `exportCurrentLog` 与用户手动找日志的习惯，段号命名须直观（`app-<date>.log` 恒为当前段）。
