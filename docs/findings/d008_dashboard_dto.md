# d008 代理面板主请求可用有界 dashboard DTO 重建首屏（2026-08-03）

- 来源：s007、t191
- 结论：`TokenStatsView` 首屏只需要 KPI/delta、donut、时间/项目/会话轴、7×24 热力图、会话摘要、status 和 freshness；这些区域可由有界聚合序列重建，不需要把 per-message records 或完整会话详情放入主 DTO。
- 证据：逐一映射 `MetricDonut`、`BarChart`、`Heatmap`、`SessionTable`、`RangePicker` 输入；`prepareBarDataFromBuckets`、`prepareBarDataFromHourBuckets`、`prepareBarDataFromRollup`、`prepareHeatmapFromCells` 和 `sessionRowsFromSessions` 均只消费聚合字段。当前会话表路径的 slug/version/sub 已固定为空或 false，不构成主 DTO 必需字段。
- 影响：dashboard IPC 可统一返回 summary、chart、heatmap、session summary、status、freshness；旧 token-stats 查询入口保留兼容，正常代理面板路径可停止调用 records 和独立 status 查询。
- 现状：有效
