# TokenStats cleanup review

仅列会影响可观察缓存/查询正确性候选。

## 1. cache miss 仍由全屏 loading 门控，旧结果无法保留

- 置信度：CONFIRMED
- 位置：`src/renderer/views/TokenStatsView.tsx:295-300,701-705`
- 失败场景：先加载 query A，再切换到从未加载过 query B。`query_cache.peek(query_key)` 返回空，`loadData` 调用 `setLoading(true)`；但 records/buckets/sessions 仍保留 A 的状态，渲染分支先判断 `loading`，直接只显示“加载中...”，A 的图表被隐藏，直到 B 完成。IPC 慢或失败时，用户持续看不到上一份可用结果。
- 证据：cache miss 分支只设置 `loading`，没有清除旧数据；渲染分支 `loading ? ... : ...` 位于空状态判断之前。该实现与本 task 的“缓存缺失时保留当前内容并显示非阻塞加载状态”不符。
- 建议：把“首次无数据的 loading”与“已有可见数据的后台 loading”拆开，或由是否存在可见数据决定是否渲染全屏 loading；cache miss 时保留旧内容，仅显示非阻塞刷新状态。

## 2. query key 未包含 preset/custom 的查询模式，可能复用不同数据源结果

- 置信度：PLAUSIBLE
- 位置：`src/renderer/views/TokenStatsView.tsx:220-225,286-294,316-334`；`src/renderer/lib/token-stats/query-cache.ts:76-82`
- 失败场景：两个状态拥有相同 `agent/platform/range_start/range_end/metric/xaxis/gran`，但一个是 `preset === "24h"`，另一个是自定义短范围。24h preset 使用 `getRangeRollup`，自定义短范围使用受 LIMIT 约束的 records；当前 key 没有 `preset`、`custom` 或等价 query mode。先加载自定义范围后切到同端点的 24h preset（或反向）时，fresh 命中在 fetcher 执行前直接返回旧数据，24h 的 KPI/项目/会话轴可能继续使用 records 截断结果，或自定义范围误用 rollup 结果。
- 证据：`use_rollup_summary` 由 `preset` 独立决定，但 `TokenStatsQueryKey` 只序列化 agent、platform、时间端点、metric、xaxis、gran；fresh entry 在 `load` 中直接返回，不再执行当前模式的 fetcher。`datetime-local` 使自然碰撞少见，但端点相等是可达状态，且模式差异会改变查询结果。
- 建议：从一个 canonical query descriptor 同时派生 fetch plan 与 cache key，至少把 `preset/custom` 的数据源模式纳入 key；不要让独立 preset 状态在 key 外决定数据源。
