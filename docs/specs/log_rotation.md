# log_rotation

## 背景

`initLogging` 原本在单日日志文件达到 50MB 后静默停写，只在首次越限时打一条 warn。开发测试阶段 debug 日志量大，循环日志可在十几分钟内写满 50MB，导致后续所有日志丢失，严重妨碍定位。

## 范围

- `initLogging` 写入路径：文件写满 `MAX_LOG_FILE_BYTES` 后自动轮转——当前文件 `app-<date>.log` 重命名为 `app-<date>.N.log`，继续写新的 `app-<date>.log`。
- 防磁盘 DoS：单日段数上限默认 10 段（active + rotated 合计），超上限后停写并 warn。
- `cleanupOldLogs` 覆盖段文件清理（按 7 天 mtime）。
- `exportCurrentLog` 仅导出当前活动段。
- `maxLogFileBytes` / `maxSegments` 可注入，便于单测驱动。

## 非范围

- 不改日志级别策略、7 天保留期、scrubber。
- 不引入外部日志库。
- 不改 renderer 日志转发限流。

## 验收标准

- [x] 写满 50MB 自动轮转：旧段保留、新段继续写，无静默停写（单测可证：注入小 `MAX_LOG_FILE_BYTES` 驱动）。
- [x] 单日段数达上限后停写并打 warn（防循环日志写爆磁盘）。
- [x] 7 天清理对段文件生效。
- [x] `pnpm test` 全绿，`pnpm typecheck` 通过。

## 依赖与约束

- 写入路径已是串行 `pending_write` Promise 链，轮转逻辑在同一链上执行，避免并发 rename/append 竞态。
- 只允许在总段数不超过上限时执行 rename；rename 失败时不继续追加。

## 实现摘要（t154 固化）

- `src/main/core/logging.ts`：
    - 新增 `MAX_SEGMENTS = 10` 常量。
    - `initLogging` 新增可选参数 `maxLogFileBytes`、`maxSegments`。
    - 启动时扫描现有 `app-<date>.N.log` 得到 `currentSegment`。
    - 每行写入前 `stat` 当前文件；越限时若 `currentSegment < maxSegments - 1` 则生成 `app-<date>.(currentSegment+1).log` 并 `rename`，否则 warn 并跳过写入。
    - 清理函数返回时 await `cleanup_promise`，保证测试可观测清理结果。
- `tests/unit/main/logging.test.ts`：新增轮转、段号递增、段上限停写、旧段清理测试。
- `docs/blueprint/conventions.md`「日志」小节同步更新语义。
