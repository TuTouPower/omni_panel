# d012 TokenStats 展示维度可经 dashboard chart_data 本地派生（2026-08-04）

- 来源：s011、t200
- 结论：dashboard 查询缓存 key 中可剔除展示派生维度 `metric`/`xaxis`，条件是 DTO 携带 metric/xaxis 无关的聚合源 `chart_data = { axis, metric_buckets, session_buckets, rollup }`：tokens/calls 时间轴用 per (hour, model) 的 calls/tokens；sessions 时间轴用 per (hour, directory) 的 distinct sessions（不可跨 model 求和）；project/session 轴复用 bounded rollup。renderer 本地派生（`prepareBarDataFromDashboardChartData` / `prepareBarDataFromDashboardRollup`）与改前服务器预派生等价，由 diff_anchor 转写的 oracle 测试锚定（6 个 metric×xaxis 组合含别名 + Top5 并列 tie-break）。
- 证据：t200 oracle 测试（chart-data.test.ts）labels/series/otherDetails 逐项 `toEqual`；query cache key 精简后 AC1 测试断言 metric/xaxis 切换不新增 dashboard IPC。
- 影响：展示维度切换不再重复查询；`gran` 决定桶粒度须保留在 key（day 级 sessions distinct 无法由 hour 桶正确求和）；会话翻页走独立 `get_dashboard_sessions` 通道，`session_offset` 不进 dashboard key。
- 现状：有效
