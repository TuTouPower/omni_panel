# Spike report

## 问题

验证代理面板基线能否在 CI 稳定记录跨进程 payload 规模，同时不修改 Electron IPC 或读取用户数据。

## 成功判据

- 固定输入可重复生成合成 records。
- 每个查询结果可记录耗时、行数和 UTF-8 JSON 字节数。
- renderer 转换结果可记录转换耗时和输出字节数。
- 报告不包含 records 内容、目录、标题、prompt 或 secret。

## 尝试

- 新增 `scripts/token-stats-baseline.ts`，使用固定 seed、临时 SQLite 和脱敏合成数据。
- 对 24h、7d、30d 以及 all/单 agent、all/Win/WSL 组合执行真实 token-stats store 查询。
- 使用 renderer 现有纯转换函数处理 buckets、hour buckets、heatmap 和 sessions。
- 查询结果与 renderer 结果只计算 JSON UTF-8 字节数，不输出内容；未接入 Electron IPC，避免测试依赖窗口和平台。

## 证据

- `pnpm exec vitest run tests/unit/main/core/token-stats/token_stats_baseline.test.ts --project=node`：3 tests passed。
- `pnpm exec tsx scripts/token-stats-baseline.ts --records 600000 --output .scratch/t189/baseline.json`：生成 600,000 条 records、36 个场景，覆盖 24h/7d/30d。
- 报告包含每个查询的 `elapsed_ms`、`row_count`、`serialized_bytes`，以及 `renderer_conversion_ms`、`renderer_output_bytes`、`total_ms`。
- 实际报告只包含 schema、时间范围、筛选标签、计时、行数和字节数；无原始记录字段。

## 结论

离线 UTF-8 JSON 字节计数可稳定作为跨进程 payload 规模代理；查询耗时和 renderer 转换耗时可在同一场景关联。该方法不能证明真实 Electron structured clone 或 IPC 往返耗时，因此真实 IPC 延迟保留给 packaged smoke，不作为本 task 的 CI 绝对耗时门禁。可信度：对结果规模和转换成本高，对 IPC 固有延迟中等。

## 是否采纳

- 决定：是
- 理由：不改变产品行为，能稳定支撑后续缓存、dashboard 聚合和进程隔离 task 的相对对比。
- 后续 task：t189
