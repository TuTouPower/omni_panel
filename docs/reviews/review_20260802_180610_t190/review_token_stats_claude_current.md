# TokenStats 查询缓存与状态审阅

## 1. 静默刷新抢占首次加载后，`loading` 永久保持 true

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`
- **改动行号**：418-421；触发入口 465-470
- **summary**：静默请求成功时不会清除被旧请求设置的全屏加载状态。
- **触发状态→坏结果/成本**：首次 cache miss 请求仍在进行时收到 `onUpdated`。首次请求先设置 `loading=true`；更新事件递增 request id 并启动 `loadData(true)`。静默请求成功后 `finally` 因 `!silent` 为 false 不执行 `setLoading(false)`，旧请求的 `finally` 又因 request id 过期被跳过。即使新数据已应用，渲染仍停在“加载中...”，统计面板不可见。
- **严重度**：高
- **结论**：CONFIRMED

## 2. `getStatus()` 拒绝时形成未处理 Promise rejection

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`
- **改动行号**：408-410
- **summary**：状态请求从主查询的 `Promise.all` 错误路径拆出，却没有 rejection handler。
- **触发状态→坏结果/成本**：统计查询成功后 `load_status()` 调用 `getStatus()`；IPC/主进程状态请求失败时，`.then(...)` 返回 rejected Promise，但外层使用 `void` 丢弃该 Promise，`loadData` 的 `try/catch` 无法捕获。结果是 renderer 出现 unhandled rejection，状态保持旧值或 null，且没有统一错误日志；连续切换时可产生多条未处理 rejection。
- **严重度**：中
- **结论**：CONFIRMED

## 3. 初始化配置读取可覆盖较新的 `CONFIG_CHANGED` 别名

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`
- **改动行号**：442-457
- **summary**：配置初始读取只用卸载标志保护，没有与配置广播共享版本或请求序号。
- **触发状态→坏结果/成本**：组件挂载后 `config.get()` 尚未返回；设置窗口保存新别名并广播 `CONFIG_CHANGED`，监听器先应用新别名；随后挂载时发出的旧 `config.get()` 响应返回，`.then` 再应用旧配置。BarChart/SessionTable 回退到旧别名，直到下一次配置广播。
- **严重度**：高
- **结论**：CONFIRMED

## 4. 预设时间范围在组件生命周期内永久冻结

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`
- **改动行号**：232-245
- **summary**：新增 `preset_ranges` 只写入预设范围，不按当前时间失效。
- **触发状态→坏结果/成本**：TokenStatsView 长时间不卸载，首次访问 `30d` 后切到 custom 或其它预设，数小时/数天后再切回 `30d`。`currentRange` 复用首次保存 `start/end`；即使 collector 更新触发 `mark_stale()`，也只是重新查询这个旧时间窗。RangePicker、query key 和面板数据持续指向过期窗口，实时更新不会推进预设终点。
- **严重度**：高
- **结论**：CONFIRMED

## 5. Cache key 包含展示维度，导致相同后端数据重复查询

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`；`D:\Dev\Code\omni_usage_t190\src\renderer\lib\token-stats\query-cache.ts`
- **改动行号**：`TokenStatsView.tsx:313-326`；`query-cache.ts:52-62`
- **summary**：`metric`、原始 `xaxis` 和部分仅影响展示/聚合选择的 `gran` 被直接放入缓存 key，未拆分后端数据依赖与展示参数。
- **触发状态→坏结果/成本**：筛选器和时间窗不变时从 Token 切换到调用次数，或在非时间轴切换粒度。key miss 后重新执行 `getRecords`、`getHeatmap`、`getBuckets`、`getSessions`，24h 还重新执行两次 rollup；这些返回数据本身包含多种指标，并未因展示切换而改变。每次切换增加 IPC/SQLite 延迟，并用重复条目挤占 8 条 LRU。
- **严重度**：中
- **结论**：CONFIRMED

## 6. 更新事件与进行中查询重叠时复制整批请求

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`；`D:\Dev\Code\omni_usage_t190\src\renderer\lib\token-stats\query-cache.ts`
- **改动行号**：`TokenStatsView.tsx:465-470`；`query-cache.ts:86-105`
- **summary**：`mark_stale()` 递增 generation，使同 key 的旧在途请求无法与静默刷新合并。
- **触发状态→坏结果/成本**：首次加载或筛选切换仍等待 IPC 时收到 `tokenStats.onUpdated`。更新回调先 `mark_stale()`，随后 `loadData(true)` 以新 generation 创建另一套完整 fetcher；旧请求继续执行，完成后由 request id 丢弃且不写入缓存。高密度窗口会同时保留两份 records/聚合响应，重复消耗 IPC、主进程查询和 renderer 内存。
- **严重度**：中
- **结论**：CONFIRMED

## 7. Fresh cache 命中会重复应用整组面板状态

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx`
- **改动行号**：328-337、405-410
- **summary**：`peek()` 命中后先调用一次 `apply_query_data`，随后 `load()` 返回同一缓存数据，又无条件调用一次。
- **触发状态→坏结果/成本**：访问 fresh query key。第一次 `apply_query_data` 连续设置 records、heat cells、hour buckets、buckets、sessions、rollup、prev rollup；`query_cache.load` 立即返回后第二次重复相同 7 个 setter。即使 React 合并部分更新，也会增加调度/渲染工作；未消费 `TokenStatsQueryResult.refreshed`，使这套双阶段返回状态无法发挥作用并增加状态复杂度。
- **严重度**：低
- **结论**：CONFIRMED

## 8. 有界 LRU 未限制在途请求数量

- **路径**：`D:\Dev\Code\omni_usage_t190\src\renderer\lib\token-stats\query-cache.ts`
- **改动行号**：48-55、86-110
- **summary**：`max_entries` 只限制已完成 `entries`，`inflight` 没有上限、取消或淘汰策略。
- **触发状态→坏结果/成本**：IPC 较慢时快速修改多个自定义时间范围或筛选组合。每个唯一 key 都进入 `inflight` 并启动完整查询；request id 只丢弃旧结果，不取消请求。即使已完成缓存最终最多 8 条，所有未完成 Promise 及其闭包仍持续持有 fetcher 和大批响应，快速操作可造成无界并发查询与内存峰值。
- **严重度**：中
- **结论**：PLAUSIBLE
