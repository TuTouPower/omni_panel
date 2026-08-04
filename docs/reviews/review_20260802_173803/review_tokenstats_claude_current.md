# TokenStatsView / query-cache 效率与生命周期审阅

- 审阅基线：`fd910318fab9cdc0e025bdbdf02db51d0c0cc4a`
- 范围：仅 `src/renderer/views/TokenStatsView.tsx` 与新增 `src/renderer/lib/token-stats/query-cache.ts`
- 模型判断依据：未知
- 结论：4 项实际问题；未修改源文件

## 高优先级

### 1. 预设时间窗口被组件生命周期永久冻结

- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:232-245`；相对路径 `src/renderer/views/TokenStatsView.tsx:232-245`
- 触发状态：TokenStatsView 长时间不卸载；首次访问某个预设（尤其 `30d`）后，经过数小时/数天，或切到 custom 再切回该预设。
- 现象：`preset_ranges.current[preset]` 只写入、不按时间刷新。后续 `query_key.range_start/range_end` 始终使用首次访问时的区间；即使 `onUpdated` 调用 `mark_stale()`，也只是用旧时间边界重新 fetch。
- 影响：面板持续查询并展示过期时间窗口，实时更新不会把预设窗口推进到当前时间；用户返回预设时还会复用过期窗口对应缓存。
- 建议：只缓存短时有效的 range，或按当前时间/更新时间重建预设 range；不要把 `RangePreset -> range` 作为无期限组件状态。
- 严重度：高
- 置信度：高

## 中优先级

### 2. Cache key 包含展示维度，导致相同后端查询无法复用

- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:313-326`、`D:\Dev\Code\omni_usage_t190\src\renderer\lib\token-stats\query-cache.ts:52-68`；相对路径 `src/renderer/views/TokenStatsView.tsx:313-326`、`src/renderer/lib/token-stats/query-cache.ts:52-68`
- 触发状态：已加载数据后切换 `Token` -> `调用次数`，或在非时间轴切换 `天`/`小时`；筛选器、时间范围不变。
- 现象：`metric`、原始 `xaxis`、部分只影响是否读取 hour aggregate 的 `gran` 都进入序列化 key。展示层切换会 miss cache，重新执行 `getRecords`、`getHeatmap`、`getBuckets`、`getSessions`，24h 还会重新执行两次 rollup；这些请求的后端返回值并未因 token/call 展示切换而变化。
- 影响：每次统计指标/轴切换产生整批 IPC/数据库查询，造成可见延迟和重复 I/O；缓存的主要收益被展示维度切换抵消。
- 建议：把 key 拆成“后端数据依赖”和“派生展示参数”；只保留 agent/platform/range 及真实影响 fetch 集合的 mode（如是否需要 hour、是否 rollup）。
- 严重度：中
- 置信度：高

### 3. 更新事件与进行中查询重叠时，整批请求不会合并而是复制

- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:465-470`、`D:\Dev\Code\omni_usage_t190\src\renderer\lib\token-stats\query-cache.ts:86-105`；相对路径 `src/renderer/views/TokenStatsView.tsx:465-470`、`src/renderer/lib/token-stats/query-cache.ts:86-105`
- 触发状态：首次加载/筛选切换仍在等待 IPC 时，收到 `tokenStats.onUpdated`；或上一轮刷新仍未完成时再次收到更新。
- 现象：`mark_stale()` 递增 generation，使同 key 的旧 in-flight 请求不再可复用；紧接着 `loadData(true)` 看到 generation 不同，创建另一套 fetcher。旧请求仍继续运行，旧结果随后只被 `request_id` 丢弃。
- 影响：一次更新事件可并行启动两套完整查询批次；重复消耗 renderer IPC、主进程数据库与内存，且高密度 `getRecords` 响应会在“必然被丢弃”的旧请求中继续保留到完成。
- 建议：为同 key 的刷新增加 refresh/coalesce 语义；或在旧请求可取消时 abort，至少在更新期间复用现有 in-flight 并在完成后判断 generation。
- 严重度：中
- 置信度：高

### 4. 组件卸载没有使 load/status continuation 失效

- 位置：`D:\Dev\Code\omni_usage_t190\src\renderer\views\TokenStatsView.tsx:292-423`、`src/renderer/views/TokenStatsView.tsx:406-410`；相对路径同上
- 触发状态：离开页面或销毁窗口时，`getRecords`/其它统计 IPC 或 `getStatus` 仍未完成。
- 现象：`load_request_id` 只在下一次 `loadData` 调用时递增，卸载没有 disposed 标记，也没有取消 pending promise。卸载后旧 query resolve 仍满足 `request_id === load_request_id.current`，执行 `apply_query_data` 的多个 state setter；随后 `load_status().then(...)` 也可能调用 `setStatus`。
- 影响：被卸载组件及其闭包继续持有大批 records/buckets/sessions，直到所有 IPC promise 完成；旧查询结果在生命周期结束后仍触发 React 更新，快速开关窗口时增加内存峰值与无效工作。
- 建议：增加 mounted/disposed guard，并在 effect cleanup 中使当前 load/status continuation 失效；若 IPC 支持，配合 AbortSignal 取消请求。
- 严重度：中
- 置信度：高

## 未发现

- `config.get()` effect 有 `active` guard，并调用 `onConfigChange` unsubscribe。
- `tokenStats.onUpdated` effect 返回订阅清理函数。
- query cache 有固定 `max_entries=8`，未见无界已完成条目增长；基础 cache 单测 3 项通过。

## 验证

- `pnpm vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts --reporter=dot`：3 passed。
- `pnpm vitest run tests/unit/renderer/views/token_stats_view.test.tsx --reporter=dot`：27 passed，2 failed。失败集中在“更新事件抢占初始加载”和“返回预设”场景，进一步印证请求/预设生命周期时序敏感；未修改测试或源文件。
