# Task review t191（reviewer_focus: 代码）

- task：`t191_tokenstats_dashboard_query_api`
- spec：`docs/tasks/t191_tokenstats_dashboard_query_api/spec.md`
- diff_anchor：`b52b249ef91ff14afbef76e33216e13c6566d581`
- target：`git diff b52b249ef91ff14afbef76e33216e13c6566d581`
- round：Round 1
- reviewed_at：2026-08-03 14:05 UTC+8

## Findings

### t191_code_f001 - session `has_more` 忽略 `session_offset`，中间页误报「无更多」

- 严重度：important
- 锚点：行为缺陷 + AC5（会话明细按需翻页）
- 位置：`src/main/core/token-stats/token-stats-store.ts:1092`
- 问题：`has_more: session_count.total > 100` 与请求的 `session_offset`/当前页条数无关。例：`session_offset=50, session_limit=100, total=100` 时返回 50 条（第 2 页还剩 50 条），`100 > 100` 为 false → 客户端提前停止翻页，第 3 页数据不可达。反之 offset 已到末尾（如 `offset=100,total=101`）仍报 true。可观测的分页契约错误。
- 建议：改为 `session_count.total > session_offset + session_items.length`，并补中间页/末页断言。

### t191_code_f002 - local API 与 web adapter 未透传 alias 与会话分页参数

- 严重度：important
- 锚点：AC6 + 范围「dashboard query、IPC、preload、local API、renderer 使用统一契约」
- 位置：`src/main/core/local-api/server.ts:288-303`；`src/web/usageboard-web.ts:235-246`
- 问题：`/v1/dashboard` 只解析 `agent/platform/start/end/metric/xaxis/gran/session_offset/session_limit`，未解析 `dir_aliases`/`model_aliases`；web `getDashboard` 连 `session_offset`/`session_limit` 也未序列化。IPC 路径已传 alias 与分页参数，同一共享 query 类型在 HTTP 端被静默丢弃：Web 面板永远只回第 1 页，且 Web 与 Electron 的 alias 口径不一致（Web 显示原始 model/project 名）。
- 建议：local API 解析 JSON 编码的 `dir_aliases`/`model_aliases`，web adapter 透传全部可选字段；非法 alias JSON 回 400。

### t191_code_f003 - `session_offset` 无上界，未认证 endpoint 可放大全量分组成本

- 严重度：minor
- 锚点：行为缺陷（资源放大）
- 位置：`src/shared/types/token-stats.ts:273`
- 问题：`session_offset` 仅 `nonnegative/safe`，任意大 offset 仍触发窗口内完整 `GROUP BY` 后才丢弃。web read endpoint 未认证，可被重复请求放大 CPU/I/O。
- 建议：schema 加 `max` 上限（如 100_000）。

### t191_code_f004 - 单次 dashboard 请求对同一窗口重复执行多次聚合

- 严重度：minor
- 锚点：效率；AC4 约束 DTO 大小而非查询次数，故不阻断
- 位置：`src/main/core/token-stats/token-stats-store.ts:978-1081`
- 问题：`query_dashboard` 对同一 `[start,end)` 窗口分别执行 current rollup、previous rollup、可选 time chart、session count、session page、heatmap，共 5–6 次串行全窗口聚合；better-sqlite3 同步执行期间 IPC/local API 请求排队。
- 建议：后续用单次扫描/窗口 CTE 合并多路聚合（登记 pending）。

### t191_code_f005 - rollup/session 相关子查询按分组重复 title/directory lookup

- 严重度：minor
- 锚点：效率；`idx_records_session_ts` 已把单次 lookup 降为索引 seek，不阻断
- 位置：`src/main/core/token-stats/token-stats-store.ts:947-953,1020-1032`
- 问题：rollup 每个 `(source,env,model,directory,session_id)` 分组执行一次窗口内最新 title 子查询；session page 又对每个 session 各执行 title、directory 两个子查询。N 个 session 时接近 2N+ 次 seek。
- 建议：后续改为窗口内 latest-per-session 派生表 join（登记 pending）。

### t191_code_f006 - renderer 翻页重算整个 dashboard

- 严重度：minor
- 锚点：效率；AC5 功能满足（可翻页取得），但每次翻页整 DTO 重查
- 位置：`src/renderer/views/TokenStatsView.tsx:297-389`；`src/renderer/lib/token-stats/query-cache.ts:54-66`
- 问题：query key 含 `session_offset`，翻页导致 cache miss 并重新请求完整 dashboard（summary/chart/heatmap 一并重算）。连续翻页将同窗口全量聚合重复执行。
- 建议：后续将会话分页与主图查询解耦（登记 pending）。

### t191_code_f007 - `freshness.stale` 恒为 false 的占位

- 严重度：minor
- 锚点：行为契约；renderer 当前未消费 stale
- 位置：`src/main/core/token-stats/token-stats-store.ts:1095`
- 问题：`freshness: { queried_at, stale: false }` 硬编码，不反映真实数据新鲜度；DTO 仍携带该字段但无信息量。
- 建议：后续接入真实 stale 来源或移除字段（登记 pending）。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 本轮新发现：7 条（3 条重要 + 4 条 minor）。
- 未进表的提示：
    - `src/main/core/token-stats/token-stats-store.ts:919` `query_dashboard` 圈复杂度约 18（含条件过滤、分页、heatmap、alias 分支）；函数级高复杂度已产出 f001 状态不一致，按行为缺陷单列。
    - `src/main/core/token-stats/token-stats-store.ts` 行数 ~1100（本 task 净增 +461），接近 800 important 阈值，但剩余主要是既有表结构与旧查询入口，未再出单独 finding。
- 总体判断：存在 3 条未解决 important（f001 分页语义、f002 契约透传、f003 无界 offset），代码审查不通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-03 14:15 UTC+8)

### 前轮 finding 复核（以 diff/代码为准）

- **t191_code_f001**：已修。`token-stats-store.ts:1092` 改为 `has_more: session_count.total > session_offset + session_items.length`；`token_stats_dashboard.test.ts` 新增「bounded page 未达尾部 has_more=true」与末页 `offset=100,limit=1 → has_more=false` 断言，原末页断言由错误 true 修正为 false（符合半开分页语义）。
- **t191_code_f002**：已修。`local-api/server.ts` `/v1/dashboard` 解析 JSON 编码 `dir_aliases`/`model_aliases`，非法 JSON 回 400；`web/usageboard-web.ts` `getDashboard` 透传 `session_offset`/`session_limit`/`dir_aliases`/`model_aliases`。`server.test.ts` 新增 alias 生效、session_offset roundtrip、malformed JSON 400 用例。
- **t191_code_f003**：已修。`shared/types/token-stats.ts:273` `session_offset` 加 `.max(100_000)`；`token_stats_dashboard.test.ts` 新增越界拒绝断言。
- **t191_code_f004**：遗留 → p027。
- **t191_code_f005**：遗留 → p028。
- **t191_code_f006**：遗留 → p029。
- **t191_code_f007**：遗留 → p030。

### 本轮新发现

无。修复未引入新问题（typecheck / lint / 全量测试 2017 passed 通过）。

### 结论

- 前轮 3 条 important 已按 diff 核实消除；4 条 minor 遗留登记 pending。
- 本轮新发现：0 条。
- 总体判断：无未解决 critical/important，PASS。

verdict: PASS

## 独立复核 (2026-08-03 14:30 UTC+8)

独立 reviewer 只读复核，基于 `git diff b52b249ef91ff14afbef76e33216e13c6566d581`（工作区未提交 diff）+ 定向测试运行（dashboard/server/ipc/shared 相关 83 tests 全部通过）。不改动任何文件。

### f001 has_more 分页语义 —— 已消除

- `token-stats-store.ts:1092` 现为 `has_more: session_count.total > session_offset + session_items.length`，与请求 offset 和当前页实际条数相关；中间页（total 101, offset 0, limit 100 → items 100 → true）与末页（offset 100, limit 1 → false）语义均正确。
- 测试覆盖：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts` 「reports has_more when a bounded page does not reach the tail」与「pages session summaries without expanding the dashboard payload」。定向运行通过。

### f002 local API / web 透传 —— 已消除

- `local-api/server.ts:288-319` `/v1/dashboard` 解析 JSON 编码 `dir_aliases`/`model_aliases`；`JSON.parse` 抛错或 `tokenStatsDashboardQuerySchema.safeParse` 失败均回 400（空参、非法枚举、越界同理）。
- `usageboard-web.ts:235-258` `getDashboard` 透传 `session_offset`/`session_limit`/`dir_aliases`/`model_aliases`。
- 测试覆盖：`tests/integration/local-api/server.test.ts` alias 生效（model_aliases → "X" 聚合）、session_offset roundtrip、malformed alias JSON 400。定向运行通过。

### f003 session_offset 上界 —— 已消除

- `shared/types/token-stats.ts:273` `session_offset` 加 `.max(100_000)`；schema 另有 `end > start` 与桶数上限 refine。

### 独立补充 finding（均 minor，不翻转 verdict）

- **minor：BarChart `apply_dashboard_aliases` 系列合并索引/取值错位**（`src/renderer/components/token-stats/BarChart.tsx` 内 `source_to_target.reduce((sum, source) => sum + (source_to_target[source] === target ? ...))`）。reduce 回调节第二参是数组值（target 索引），代码却再用该值回查 `source_to_target`，正确写法应遍历索引。当前后端已在查询内预 alias，chart labels/series 已是合并后结果，此函数为恒等映射的冗余 no-op，缺陷被掩盖；一旦 renderer 收到未预合并 labels（如链式/重叠 alias 配置），合并会双计或漏计。
- **minor：SessionTable 块间全局排序不一致**（`SessionTable.tsx`）。后端按 `ended_at DESC` 分 100 块，表内再按 sort key 重排；跨块边界顺序非单调（翻页到新块可能跳序），数据可达性不受影响。
- **minor：自定义宽窗口 + hour 粒度被桶数上限硬拒**。schema 限制 `end-start <= 400h`（≈16.7 天），超限查询回 INVALID_ARGUMENT，renderer 显示「查询失败」而非旧路径的截断数据；属有意的有界化取舍但用户可见回归。
- **hygiene：diff 混入无关测试文件整文件空白/行尾 churn**（`popup_view_height.test.tsx`、`popup_view_mirror.test.tsx`、`popup_view_test_utils.ts`、`settings_view_test_utils.ts` 等约 2000 行），功能增量仅各文件补 `getDashboard: vi.fn()` mock，应避免与 task 变更同批。

### 非 finding 观察

- day 粒度时间轴桶边界由旧 >=7d 路径的 UTC 日（token_stats_daily）改为 UTC+8 本地日，与 hour/heatmap 固定 UTC+8 约定统一，对原始记录基准不构成口径错误。

独立 verdict: PASS
