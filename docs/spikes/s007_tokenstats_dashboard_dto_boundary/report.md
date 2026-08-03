# Spike report

## 问题

确定代理面板统一 dashboard query 的最小 DTO，区分首屏展示数据与会话详情数据，避免把现有 records、buckets、rollup、sessions 多套中间结构原样复制到 renderer。

## 成功判据

- 逐一映射 `TokenStatsView` 当前子组件的输入字段。
- 用现有纯函数和 shared schema 判断每个输入字段能否由有界聚合结果重建。
- 明确 dashboard 主请求是否包含 status/freshness。
- 明确正常 dashboard 路径是否还需要 `getRecords`。
- 明确 SessionTable 首屏摘要字段与可延迟详情边界。

## 映射实验

### 当前组件输入

| 区域                  | 当前输入                                                                                       | 首屏必要性                                                                       | DTO 归属                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `MetricDonut`（5 个） | `centerValue`、`segments`、`format`、`theme`                                                   | `centerValue` 与 `segments` 必须立即可得；`format`、`theme` 是 renderer 展示参数 | `summary.kpi`、`summary.donuts`                                |
| `BarChart`            | `records`、`buckets`、`hourBuckets`、`rollup`、`metric`、`xaxis`、`gran`、`start`、`end`、别名 | 图表序列必须立即可得；原始中间结构不必传递                                       | `chart.series`、`query`；别名仍来自配置 state                  |
| `Heatmap`             | `cells`、`metric`、`theme`                                                                     | `cells` 必须立即可得                                                             | `heatmap.cells`                                                |
| `SessionTable`        | `rows`、`theme`、`modelColors`、`modelAliases`                                                 | 当前页摘要必须立即可得；完整详情不阻塞图表                                       | `sessions.items`、`summary.model_colors`；别名仍来自配置 state |
| `RangePicker`         | `start`、`end`、`active`、`onApply`                                                            | 查询边界必须进入请求和响应，控件回填需要 `query.start/end`                       | `query`                                                        |
| 顶部状态              | `status.running`、`status.last_updated`、`updatedAgo`、`refreshing`                            | 当前请求结果的新鲜度和 collector 状态必须可展示                                  | `status`、`freshness`                                          |

### 最小字段覆盖

现有 renderer 纯函数表明，组件不需要 records 本身，只需要按当前选项预计算后的有限结果：

- KPI：`tokens`、`sessions`、`calls`、`hit_rate`，以及 current/previous 的同构值用于 delta。
- Donut：代理、模型、调用、缓存组成和项目分组的 `{ name, value }`；“其他”可由主进程生成详情数组，renderer 不需要遍历消息。
- 时间轴：已经按 `hour` 或 `day` 排列的 labels、bucket starts、Top5/其他 series、other details。
- 项目轴与会话轴：已经按当前 metric、x 轴和 alias 语义聚合的 labels 与 series。
- 热力图：固定最多 7×24 个 `{ weekday, hour, tokens, sessions, calls }` cell；renderer 只选择当前 metric。
- 会话摘要：每个摘要包含 `session_id`、`title`、`directory`、`source`、`models`、`calls`、四类 token 总量、`started_at`、`ended_at`。这些字段足以重建当前 `sessionRowsFromSessions` 和表格分页；`slug`、`version`、`parent_session_id` 当前 sessions 路径本来就固定为 `null`/`false`，不应为保持现状把 records 元数据复制进主 DTO。
- 状态：`running`、`last_updated`。
- 新鲜度：`queried_at` 和 `stale`。`queried_at` 用于区分响应生成时间，`stale` 用于 collector 更新后的静默刷新；不把 renderer 内部 cache 状态伪装成 store 状态。

### 首屏与延迟边界

首屏主请求返回完整图表和会话摘要，但不返回 per-message records，也不返回会话 transcript/prompt、目录扫描内容或其他详情。当前 SessionTable 只展示聚合摘要，没有展开详情入口，因此本 task 的按需边界定义为：

1. `sessions.items` 只返回当前范围内、按摘要排序后的有界页数据，并携带 `total` 或 `has_more`。
2. 后续会话详情请求按 `session_id + source + env` 获取，不参与主图查询，也不阻塞 KPI、图表和热力图。
3. 既有 `getSessions` 保留给其他调用方；dashboard 主请求使用新的 session summary 查询，避免把无范围的 `LIMIT 500` 全表结果当作窗口数据。

### status/freshness 决策

status 和 freshness 并入 dashboard DTO。理由：正常打开、筛选切换和 collector 静默刷新必须只依赖一个主数据请求；保留旧 `getStatus` 仅用于兼容其他调用方，不再由代理面板正常路径单独调用。

建议结构：

```ts
interface TokenStatsDashboardDto {
    query: {
        agent: AgentFilter;
        platform: PlatformFilter;
        start: number;
        end: number;
        metric: Metric;
        xaxis: XAxis;
        gran: Granularity;
    };
    summary: {
        current: TokenStatsSummary;
        previous: TokenStatsSummary;
        donuts: TokenStatsDonuts;
    };
    chart: TokenStatsChart;
    heatmap: TokenStatsHeatmapCell[];
    sessions: {
        items: TokenStatsSessionSummary[];
        total: number;
        has_more: boolean;
    };
    status: { running: boolean; last_updated: number | null };
    freshness: { queried_at: number; stale: boolean };
}
```

DTO 中的 `summary`、`chart` 和 `heatmap` 均为有界聚合结果；字段数量随 distinct model/project/session、时间桶和固定热力图网格增长，不随 per-message records 数线性增长。

## 证据

- `TokenStatsView` 当前 `loadData` 同时请求 records、heatmap、hour buckets、buckets、sessions、rollup 和 status；其中 `BarChart`、KPI、donut、heatmap 均有对应的纯聚合函数，输入可替换为 DTO 的最终序列。
- `sessionRowsFromSessions` 已证明会话表当前可见字段只依赖 session 聚合行，不依赖 raw record；其 `slug`、`version`、`sub` 已固定为 `null`、`null`、`false`。
- `prepareHeatmapFromCells`、`prepareBarDataFromBuckets`、`prepareBarDataFromHourBuckets`、`prepareBarDataFromRollup` 已证明图表可消费有界 SQL 聚合结果。
- `MetricDonut` 和 `Heatmap` 只消费已派生 segments/cells；`BarChart` 只消费最终 series 所需的输入结构；三者不读取 records 的额外字段。
- `RangePicker` 只需要 query 的 start/end；配置 aliases 是独立状态流，不需要复制进 dashboard DTO。
- 现有单元测试覆盖上述纯函数的 records/buckets/hour buckets/rollup/heatmap 两类输入；新增 DTO 测试应以完整 raw records 作为 oracle，验证最终 summary/chart/heatmap/session summary 一致，而不是把原始 records 作为生产 DTO。

## 结论

采用单一 `TokenStatsDashboardDto`：主进程按统一 query 规范化后直接返回 summary、chart、heatmap、session summary、status 和 freshness。代理面板正常路径删除 `getRecords`、`getBuckets`、`getHourBuckets`、`getRangeRollup`、`getHeatmap`、`getSessions`、`getStatus` 的多路调用，改为一次 dashboard IPC。旧入口继续保留兼容其他调用方；会话详情另设按 session 的按需查询边界。

可信度：组件字段边界高；纯函数可重建性高；主进程 SQL 聚合字段的最终实现需由 t191 集成测试与完整 raw records 对照验证。

## 是否采纳

- 决定：是
- 理由：主请求只传当前可见聚合结果，保留 session 摘要与旧兼容入口，满足首屏单请求和 payload 有界两个目标。
- 后续 task：t191
