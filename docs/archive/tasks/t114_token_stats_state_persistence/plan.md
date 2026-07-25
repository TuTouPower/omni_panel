# Task plan

## 步骤与验证

1. 在 collector.ts 加 state 序列化/反序列化 + 落盘/恢复 → 验证：`tests/unit/main/core/token-stats/collector-state.test.ts` 红→绿。
2. 手动验证：启动应用扫一次 → 重启 → 观察日志确认只扫变化文件 → 验证：collector 日志中 `scan` 耗时与文件数。
3. `pnpm test` 全绿 → 验证：CI 命令。

## 风险与回退

- 风险：`SessionFileFacts` 含 `records: AgentSessionUsageRecord[]`，单文件可达 MB 级，序列化后 state 文件过大。 → 回退：序列化时丢弃 records（本方案已含）；若 `daily` 仍过大，再裁剪为只存 mtime + session_id，facts 重算。
- 风险：恢复后 mtime 精度丢失（JSON number vs fs mtimeMs 浮点）导致误判全部变化。 → 回退：序列化时 `Math.round(mtimeMs)`，比较时用相同精度。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：「token-stats」小节补一句「collector 扫描状态持久化到 `data/token-stats-scan-state.json`，重启后增量恢复」。
