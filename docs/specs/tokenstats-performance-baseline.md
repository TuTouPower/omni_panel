# tokenstats-performance-baseline

> 验证方式：API。代理面板切换性能基线与查询诊断。

代理面板性能基线使用固定 seed 的脱敏合成 records 和临时 SQLite，覆盖 24h、7d、30d 以及 agent/platform 筛选组合。报告记录查询耗时、返回行数、UTF-8 JSON payload 字节数、renderer 转换耗时和整次场景耗时；不记录 prompt、标题、目录、secret 或完整 record 内容。

基线不把绝对耗时设为 CI 门禁，只用于比较后续缓存、统一聚合和查询隔离 task 的相对变化。跨进程阶段使用离线 JSON 字节计数作为稳定 payload 代理，真实 Electron IPC 往返延迟由 packaged smoke 验证。

## 命令

```bash
pnpm exec tsx scripts/token-stats-baseline.ts --records 600000 --output .scratch/t189/baseline.json
```

`--records` 默认 600000；输入规模和分布由固定 seed 决定。输出报告只包含 schema、筛选组合、阶段计时、行数和字节数。
