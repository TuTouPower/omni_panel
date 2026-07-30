# Task spec

## 背景

代理面板 5 个 `MetricDonut` + `BarChart` + `Heatmap` 全部基于 `records`（38 万行）在前端 `useMemo` 里 `reduce`/`groupBy`，制造多份临时副本。而 `token_stats_daily`（2,526 行）已按 (session, date, model) 聚合好 token 总量，足以支撑 KPI/donut/bar/heatmap；`token_stats_sessions`（1,597 行）支撑 SessionTable。records 仅在需要 per-message 明细时才必要，当前 UI 不展示 per-message。

## 范围

- 评估每个图表的数据需求：
    - KPI（总 token / 会话 / 调用 / 命中率）：改用 `token_stats_daily` 或 `token_stats_sessions` 聚合。
    - `MetricDonut`（model / project / agent / composition）：改用 `token_stats_daily`（model 维度）+ `token_stats_sessions`（directory 维度）。
    - `BarChart`（时间 / 项目 / 会话轴）：时间轴用 `token_stats_daily`；项目/会话轴用 `token_stats_sessions`。
    - `Heatmap`（7×24）：需要小时级，daily 不够——评估是否新增 `token_stats_hourly` 聚合表，或保留 records 但仅拉时间窗内。
- `TokenStatsView`：不再 `getRecords` 全量；改为 `getBuckets`/`getSessions`（**已存在**）+ 按需 `getRecords`（SessionTable 当前页 + Heatmap 时间窗）。
    - 审阅核实：tokenStats IPC 现有 `getBuckets`/`getSessions`/`getRecords`/`getStatus`，**`getDaily` 不存在**。daily 维度数据经 `getBuckets`（按 source/env/date/model 聚合）获取；若 buckets 字段不足以覆盖 model/project/directory 维度，则在本 task 范围内**新增 `getDaily` IPC**（工作量计入）。
- SessionTable：分页改为服务端分页（`query_sessions` 已支持 limit/offset）。

## 非范围

- 不新增 `token_stats_hourly` 表（除非评估后确为 Heatmap 唯一解）；优先用 records 时间窗 + limit（t162）支撑 Heatmap。
- 不改 collector（t166）。
- 不改 donut/bar 的视觉表现（颜色、Top5 逻辑不变）。

## 验收标准

- [ ] `TokenStatsView` 不再调用 `getRecords()` 拉全量 records 作为主数据源。
- [ ] KPI/donut/bar 基于 daily/sessions 聚合，数值与改动前一致（同时间窗对比）。
- [ ] Heatmap 仍可渲染；若依赖 records，仅拉当前时间窗 + limit。
- [ ] SessionTable 改服务端分页，翻页不发起新 records 全量请求。
- [ ] 渲染进程内存：打开面板后不再持有 38 万行 records。

## 依赖与约束

- 前置：t162（records query limit）——Heatmap 若仍用 records 需 limit 兜底。
- 前置：t163（索引）——daily/sessions 查询性能。
- IPC 现状：`getBuckets`/`getSessions`/`getRecords`/`getStatus` 已存在；`getDaily` 不存在，若需要则在本 task 新增（含 IPC handler + preload + 类型）。
