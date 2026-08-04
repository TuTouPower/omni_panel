# Task review t190（reviewer_focus: 代码）

- task：`t190_tokenstats_query_swr_cache`
- spec：`docs/tasks/t190_tokenstats_query_swr_cache/spec.md`
- diff_anchor：`fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7`
- target：`git diff fd910318fab9cdc0e025bdbdf02db51d0c0cc4a7`
- round：1
- reviewed_at：2026-08-03 00:10 UTC+8

## Findings

### t190_code_f001 - 未缓存查询没有非阻塞加载状态

- 严重度：important
- 锚点：范围“缓存缺失时保留当前内容并显示非阻塞加载状态”
- 位置：`src/renderer/views/TokenStatsView.tsx:330-335,754-756`
- 问题：已有结果加载完成后，`has_loaded_data.current` 为 `true`。切换到未缓存 query key 时，`loadData` 既不设置 `loading`，也没有其他刷新中状态；JSX 中唯一加载提示是会替换整个面板的 `{loading ? <div className="empty">加载中...</div> : ...}`。因此慢查询期间只显示旧结果，用户无法知道新选项仍在加载，未满足缓存缺失的非阻塞加载行为。
- 失败场景：先加载 A，等待面板显示；切换到未缓存 B，令任一 token-stats IPC Promise 延迟。`has_loaded_data.current` 已为真，行 334 条件不成立，`loading` 保持 `false`；面板继续显示 A，且没有任何 loading/refreshing 指示，直到 B 完成。
- 建议：将“保留旧数据”和“后台加载中”拆成独立状态；缓存缺失或 stale revalidate 时设置非阻塞刷新标志，只有首屏无数据时才显示全屏 loading。

### t190_code_f002 - 预设时间范围在组件生命周期内永久冻结

- 严重度：important
- 锚点：范围“按时间窗生成 query key 并缓存结果”及实时统计窗口语义；相对窗口不能永久复用首次捕获的结束时间
- 位置：`src/renderer/views/TokenStatsView.tsx:213-246,480-489`
- 问题：`preset_ranges.current[preset]` 只在首次访问某个预设时写入，后续一直复用同一 `start/end`。collector 更新时只刷新当前 `preset` 的范围，其他预设仍保留旧时间边界。
- 失败场景：组件挂载并首次访问 `30d` 后经过数小时，期间未触发 collector 更新，切换到其他选项再切回 `30d`；`currentRange.end` 仍是首次访问时间，query key 和 RangePicker 都指向旧窗口，最近数小时统计不会进入 30d 结果。即使 collector 更新时当前处于 7d，随后回到 30d 也只会重新查询这个过期窗口。
- 建议：不要把 `RangePreset -> range` 作为无期限组件状态；按当前时间重建相对预设，或为范围设置明确失效策略，并在保留缓存复用与推进窗口之间定义一致的 key/刷新规则。

### t190_code_f003 - query key 纳入展示维度，导致后端数据重复查询

- 严重度：minor
- 锚点：效率；同一筛选和时间窗下未改变底层查询依赖
- 位置：`src/renderer/views/TokenStatsView.tsx:315-328,339-397`
- 问题：`metric`、原始 `xaxis`、以及非时间轴下不影响 `hour_fetch` 的 `gran` 直接写入 query key，但 fetcher 对这些切换仍调用完全相同的 records、heatmap、buckets、sessions（24h 还包括相同两次 rollup）。这会让展示维度切换失去缓存复用，并用重复数据占用有限 LRU。
- 失败场景：保持 agent、platform、时间窗不变，从 Token 切换到“调用次数”，或从时间轴切换到项目轴且粒度为“天”；key 变化导致整批 IPC/SQLite 查询重新执行，尽管底层返回数组未改变。
- 建议：拆分“后端数据依赖 key”和“面板派生参数”；缓存数据依赖集合，展示层只重新派生 KPI/图表。

### t190_code_f004 - fresh 缓存命中重复应用整组面板状态

- 严重度：minor
- 锚点：效率；缓存命中应直接复用已有结果
- 位置：`src/renderer/views/TokenStatsView.tsx:330-334,408-410`
- 问题：`peek()` 命中后先调用一次 `apply_query_data(cached.data)`；随后 `query_cache.load()` 在 fresh 命中时返回同一数据，`loadData` 又无条件调用 `apply_query_data(result.data)`。每次命中会重复执行 records、heat cells、hour buckets、buckets、sessions、rollup、prev rollup 共 7 组 state setter。
- 失败场景：切回已有 fresh query key。第一次 setter 批次立即复用缓存，下一微任务中第二次 setter 批次再次写入同一引用，造成额外调度/渲染工作；`TokenStatsQueryResult.refreshed` 也没有用于区分该路径。
- 建议：让 `loadData` 只在未由 `peek()` 应用数据时提交结果，或直接以 `load()` 返回值作为唯一提交入口。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：4 条（2 important，2 minor）。
- 未进表的提示：`src/renderer/views/TokenStatsView.tsx` 当前 902 行，达到实现源码文件过大 minor 阈值；`tests/unit/renderer/views/token_stats_view.test.tsx` 当前 1159 行，达到测试源码文件过大 minor 阈值。按提示规则仅在结论段列出。`TokenStatsView` 的加载协调函数分支较多，建议后续拆分，但未单独列 finding。
- 验证结果：`pnpm exec vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx` 通过（36/36）；`pnpm typecheck` 通过。
- 总体判断：未缓存查询缺少非阻塞加载反馈，且相对预设时间窗口会永久冻结，均产生可观测行为缺陷；当前不能判定实现完成。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-03 08:54 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t190_code_f001`：已修。未命中缓存且已有面板数据时，`loadData` 设置 `refreshing`，首屏仍由 `loading` 控制全屏加载；页头显示“刷新中...”（`src/renderer/views/TokenStatsView.tsx:194-195,336-346,710-714,773-775`）。
    - `t190_code_f002`：已修。预设范围增加 5 分钟 TTL，过期后重建相对时间窗口；collector 更新当前预设时同步重建范围并触发重新加载（`src/renderer/views/TokenStatsView.tsx:163-164,242-248,493-500`）。
    - `t190_code_f003`：仍未修复，属于 minor 遗留。`metric`、`xaxis`、`gran` 仍进入 query key（`src/renderer/views/TokenStatsView.tsx:326-334`）；已登记 `docs/pending.md:p026`，且条目明确标注来源为该 finding、处理状态为未开（`docs/pending.md:25-29`）。
    - `t190_code_f004`：已修。fresh cache 命中时先应用 peek 数据，`load` 返回后仅在缓存缺失或 stale 时再次应用（`src/renderer/views/TokenStatsView.tsx:336-340,418-420`）。
- 本轮新发现：0 条。
- 未进表的提示：`src/renderer/views/TokenStatsView.tsx` 当前 921 行，达到实现源码文件过大 minor 阈值；`tests/unit/renderer/views/token_stats_view.test.tsx` 当前 1155 行，达到测试源码文件过大 minor 阈值。`loadData` 分支较多，建议后续拆分，但未形成独立可观测缺陷。
- 总体判断：前轮 important finding 均已由当前 diff 消除；仅有已登记的 minor 遗留 `p026`，不阻断收尾。
- 系统性 follow-up：已有 `p026`，无新增。

verdict: PASS

## Round 4 (2026-08-03 09:05 UTC+8)

## Findings

### t190_code_f005 - 预设时间窗 TTL 只在依赖变化时检查

- 严重度：important
- 锚点：行为缺陷；相对预设时间窗在时间推进后仍可能复用旧结束时间，导致当前查询遗漏新数据
- 位置：`src/renderer/views/TokenStatsView.tsx:237-253`
- 问题：`currentRange` 通过 `useMemo` 只依赖 `custom`、`preset` 和 `preset_range_revision`。5 分钟 TTL 判断只会在这些依赖变化时执行；同一预设下切换 agent、platform、metric、xaxis 或 gran 时，组件会重新加载查询，但 `currentRange` 不重新计算，继续使用首次捕获的 `range.end`。因此本轮 Round 3 对 `t190_code_f002` 的“增加 TTL”修复不完整。
- 失败场景：打开 `30d` 后等待超过 5 分钟，随后只把 agent 从“全部工具”切换为“Claude Code”。`preset`、`custom`、`preset_range_revision` 均未变化，`currentRange` 仍结束于 5 分钟前；新 query key 和 IPC 参数继续查询过期窗口，最近 5 分钟数据不会进入面板。
- 建议：让相对预设在每次生成查询前检查 TTL，或引入独立时间戳/定时失效机制，使筛选选项变化也能重建已过期窗口。

## 结论

- 前轮 finding 复核：
    - `t190_code_f001`：已修。未命中缓存且已有面板数据时显示非阻塞“刷新中...”，首屏仍使用全屏 loading。
    - `t190_code_f002`：修不彻底。TTL 已加入，但 `currentRange` 的 memo 依赖未覆盖统计选项切换；同一预设下切换选项仍可使用过期时间窗，本轮新增 `t190_code_f005`。
    - `t190_code_f003`：仍未修复，属于 minor 遗留。展示维度仍进入 query key，已登记 `docs/pending.md:p026`。
    - `t190_code_f004`：已修。fresh cache 命中不再重复应用面板数据。
- 本轮新发现：1 条（1 important）。
- 未进表的提示：`src/renderer/views/TokenStatsView.tsx` 当前 921 行，达到实现源码文件过大 minor 阈值；`tests/unit/renderer/views/token_stats_view.test.tsx` 当前 1155 行，达到测试源码文件过大 minor 阈值。`loadData` 分支较多，未形成独立可观测缺陷。
- 验证结果：`pnpm --dir D:/Dev/Code/omni_usage_t190 exec vitest run tests/unit/renderer/lib/token_stats_query_cache.test.ts tests/unit/renderer/views/token_stats_view.test.tsx` 通过（36/36）。
- 总体判断：预设时间窗仍可能因 TTL 检查时机错误而查询过期范围，important finding 未解决。
- 系统性 follow-up：无新增；`p026` 已存在。

verdict: FAIL

## Round 5 (2026-08-03 09:09 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
    - `t190_code_f001`：已修。未缓存查询且已有面板数据时保留旧结果并显示非阻塞“刷新中...”，首屏仍由 `loading` 控制全屏加载。
    - `t190_code_f002`：已修。预设范围使用 5 分钟 TTL；Round 4 暴露的依赖变化后未检查 TTL 问题由 `range_refresh_key` 修复。`currentRange` 在 agent、platform、metric、xaxis、gran 变化时重新执行 TTL 判断（`src/renderer/views/TokenStatsView.tsx:219,238-255`），过期后重建相对时间窗。
    - `t190_code_f003`：仍未修复，属于 minor 遗留。展示维度仍进入 query key（`src/renderer/views/TokenStatsView.tsx:328-336`）；已登记 `docs/pending.md:p026`，本轮不重复新增 finding。
    - `t190_code_f004`：已修。fresh cache 命中只应用 peek 数据，不再重复提交整组面板状态。
    - `t190_code_f005`：已修。筛选维度变化会触发 `range_refresh_key` 变化，使 `currentRange` 重新计算并在 TTL 过期时推进 `range.end`；对应测试通过（`tests/unit/renderer/views/token_stats_view.test.tsx:422-448`）。
- 本轮新发现：0 条。
- 未进表的提示：`src/renderer/views/TokenStatsView.tsx` 当前 923 行，达到实现源码文件过大 minor 阈值；`tests/unit/renderer/views/token_stats_view.test.tsx` 当前 1155 行，达到测试源码文件过大 minor 阈值。按提示规则仅在结论段列出。`loadData` 分支较多，未形成独立可观测缺陷。
- 验证结果：t190 相关 renderer 测试通过（2 files, 37 tests）；`git diff --check` 无输出。
- 总体判断：Round 4 的 important finding 已由当前 diff 消除；仅有已登记 minor 遗留 `p026`，不阻断收尾。
- 系统性 follow-up：已有 `p026`，无新增。

verdict: PASS
