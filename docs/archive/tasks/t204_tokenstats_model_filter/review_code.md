# Task review t204（reviewer_focus: 代码）

- task：`t204_tokenstats_model_filter`
- spec：`docs/tasks/t204_tokenstats_model_filter/spec.md`
- diff_anchor：`571768ca14548038e8e294dc010318ab8a61d799`
- target：`git diff 571768ca14548038e8e294dc010318ab8a61d799`
- round：1
- reviewed_at：2026-08-04 19:10 UTC+8

## Findings

### t204_code_f001 - web SPA 通道未透传 model，AC5/AC2 在 web 模式失效

- 严重度：critical
- 锚点：AC5（web SPA（local-api `/v1/dashboard`）与 electron IPC 两通道均透传 `model` 参数且行为一致）；AC2（选定模型后面板数据只含该模型）
- 位置：`src/web/usageboard-web.ts:239-261`（getDashboard）、`src/web/usageboard-web.ts:263-283`（getDashboardSessions）
- 问题：local-api 服务端（`src/main/core/local-api/server.ts`）已接受 `model` 参数，IPC 通道（schema 自动透传）也已生效，但 web SPA 桥接层 `usageboard-web.ts` 的 `getDashboard` / `getDashboardSessions` 在构造 `URLSearchParams` 时没有写入 `model`（其余 heatmap/hourBuckets/rollup getter 同样遗漏）。该文件不在本 diff 内，属漏改的调用点。可复现失败场景：web 构建（`pnpm build:web`）中 TokenStatsView 顶部选择「模型筛选」→ sonnet，`getDashboard` 发出的 `/v1/dashboard` 请求 URL 不含 `model`，dashboard 返回全量数据，而 UI 的 query key 已含 `model`、下拉也保持选中，用户看到的是「已筛选」但数据未筛——AC2 的筛选语义在 web 通道完全不生效，且界面误导。
- 建议：`getDashboard`/`getDashboardSessions`（及 `getHeatmap`/`getHourBuckets`/`getRangeRollup` 保持一致）中增加 `if (query.model) params.set("model", query.model);`；补一条 web 客户端 URL 组装单测断言 model 进入 query string。注意 `usageboard-web.ts` 属于 t204 的配套调用点，应与实现 commit 一同修改。

### t204_code_f002 - dashboard.models 取自 model 过滤后的物化窗口，下拉在筛选时坍缩为仅当前模型

- 严重度：important
- 锚点：spec 范围「模型选项来源：dashboard 返回该筛选窗口（agent/platform/range/gran）内出现的 distinct model 列表」；AC1「选项列表 = 当前筛选窗口内实际出现过的模型名」
- 位置：`src/main/core/token-stats/token-stats-store.ts:1282-1284`（`SELECT DISTINCT model FROM window_rows`，此时 `window_rows` 已按 model 过滤）；`src/renderer/views/TokenStatsView.tsx:540-546`（modelOptions）
- 问题：spec 范围对模型列表来源窗口的维度枚举是（agent/platform/range/gran），**不含 model**——即列表应始终反映去除 model 过滤后的窗口全集，供下拉直接切换。实现却在 `query_dashboard` 中从已带 `AND model=@model` 条件的 `window_rows` 取 distinct，因此一旦选中某模型，`dashboard.models` 只含该模型本身，前端 `modelOptions` 随之坍缩为 `[选中模型]`。可观测行为：选中 sonnet 后下拉只剩「全部模型 + sonnet」，用户无法直接切换到窗口内其他模型（opus 等），必须先回「全部模型」触发一次全量重查再选。`token_stats_dashboard.test.ts:697` 断言 `sonnet.models` toEqual `["sonnet"]`，把过滤语义固化为测试；而 `token_stats_view.test.tsx` 的 mock 却始终返回 `models: ["opus","sonnet"]`（未过滤语义），两处测试对 `models` 字段语义预期不一致，view 测试的 mock 无法暴露生产中的坍缩行为。若过滤语义（b）是刻意选择，应同步修改 spec 范围中的维度枚举以消除歧义；按现有 spec，属 AC1/范围偏差。
- 建议：`models` 列表在计算时不带 model 条件（如对未加 `model_where` 的窗口查询 distinct），或从 `dashboard_window_union_builder` 的 filter_params 剥离 model 后再物化一次查询；同时统一 store 测试与 view mock 的语义。若确认坍缩为产品意图，则改 spec 范围枚举为（agent/platform/range/gran/model）。

## 结论

- 前轮 finding 复核（Round 1 无）：无
- 本轮新发现：2 条（f001 critical / f002 important）
- 未进表的提示：
    - 文件过大（本 task 净增且已超阈值，按降级规则只在结论列出）：`src/main/core/token-stats/token-stats-store.ts` 1397 行（实现 ≥800，净增 +22）、`src/renderer/views/TokenStatsView.tsx` 883 行（实现 ≥800，净增 +30）、`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts` 787 行（测试 ≥600，净增 +115）、`tests/unit/renderer/views/token_stats_view.test.tsx` 699 行（测试 ≥600，净增 +68）、`tests/integration/local-api/server.test.ts` 729 行（测试 ≥600，净增 +78）。
    - 复杂度：无函数达到 ≥15 阈值；`loadData`/`query_dashboard` 分支较多但未达标准，不单独出 finding。
    - 范围外观察：heatmap/hourBuckets/rollup 的 web 客户端 getter 同缺 `model` 透传（已并入 f001，当前 renderer 无调用方，属潜在缺口）。
- 总体判断：AC 覆盖整体完整（AC1-AC6 均有实现与测试），但 web SPA 通道漏透传 `model` 使 AC5 与 web 模式 AC2 直接失效，属未解决 critical；f002 为 spec 范围偏差。存在未解决 critical/important，FAIL。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-04 12:22 UTC+8)

### 前轮 finding 复核

#### t204_code_f001（critical，web 层未透传 model）— 已消除

`src/web/usageboard-web.ts` diff 显示恰好五处 getter 全部补齐 `model` 透传：

- `getDashboard`（usageboard-web.ts:216 `if (filters?.model) params.set("model", filters.model)`）
- `getDashboardSessions`（usageboard-web.ts:225 同形态）
- `getHeatmap`（usageboard-web.ts:233 同形态）
- `getHourBuckets`（usageboard-web.ts:252-254，`if (query.model !== undefined) params.set("model", query.model)`，与该函数既有 query 字段风格一致）
- `getRangeRollup`（usageboard-web.ts:276-278 同形态）

前三处与 agent/env/start/end 共用 `filters?` 风格，后两处因参数对象结构不同采用 `query.model !== undefined` 判定，两种写法在各自函数上下文中一致。`tests/unit/web/usageboard-web.test.ts` 新增三条断言覆盖五处 getter 的 URL 组装（含 `/v1/dashboard?model=sonnet`、`/v1/heatmap?model=opus` 等精确匹配）。server.ts 的 local-api 服务端六个端点（dashboard、dashboard/sessions、heatmap、hourBuckets、rollup 及共享 model 解析）均已 `params.get("model")` 并展开进 store 调用，AC5 web 通道透传链路闭合。前轮 blocker 已消除。

#### t204_code_f002（important，models 取自过滤后 window_rows 致下拉坍缩）— 已消除

`src/main/core/token-stats/token-stats-store.ts:1282-1301` 的修复路径：

1. `build_dashboard_conditions({ ...query, model: undefined }, query.start, query.end)` 显式剥离 model，生成的 `model_list.conditions` 只含 timestamp/agent/env 边界，**不含** `model = @model`。
2. `CREATE TEMP TABLE window_models AS SELECT DISTINCT model FROM token_stats_records WHERE <边界条件>` —— 从 records 源直接取 distinct，不经 window_rows，因此不受选中模型过滤影响。
3. `SELECT model FROM window_models ORDER BY model` 字典序输出。

`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts` 的 `sonnet` 用例已将原 `toEqual(["sonnet"])` 改为 `toEqual(["opus","sonnet"])`（全窗口语义），并新增 `all` 用例 `all.models toEqual(["opus","sonnet"])`、窗口外 `gemini` 不进列表的断言。Round 1 指出的「store 测试与 view mock 语义不一致」已消除——view 测试 mock 同步用 `models: ["opus","sonnet"]`。前轮 blocker 已消除。

### 本轮新发现

无。逐项扫描结论：

- **p027 单次物化语义**：`window_models` 是独立 temp table，仅供 distinct model 列表；heatmap（store:1302-1311）、metric_buckets（store:1260-1266）、session_buckets（store:1267-1273）、session_page/items 全部仍从 `window_rows` 派生。p027「regions 不重扫基表」的不变量保留。`records_refstoHaveLength(3)` 同步改为 `4`（store 测试 store.ts:565-571），新增的一次 records 引用即 `window_models` 的 CREATE TEMP TABLE，且仍以 `CREATE TEMP TABLE` 开头，符合 p027 测试意图。
- **temp table 泄漏**：`window_models` 与 `window_rows`/`session_meta` 同模式（每次 query_dashboard 起 `DROP TABLE IF EXISTS` + CREATE TEMP TABLE，better_row_cache 由 SQLite session 管理）。query_dashboard 不在显式事务内（`tx` 仅 backfill_hour_rollup 用），无跨请求残留风险。
- **records 扫描成本**：`window_models` 每次查询对 `token_stats_records` 做一次 distinct 扫描。这是 spec 上下文区 s013 已核实决策（「实现从 records 按 agent/platform/range 不含 model 查 SELECT DISTINCT model」），且与 window_rows 的 records 全量扫描处于同一查询，复用同一 buffer pool，未引入独立 N+1 模式。可接受。
- **f001 五处 getter 风格差异**（前三 `filters?.model`、后两 `query.model !== undefined`）：两个判定语义等价（空字符串 falsy 走不到 set，undefined 走不到 set），与各自函数内既有字段的判定风格一致（前三共 `filters?.agent`/`filters?.env`，后两共 `query.start !== undefined`），非缺陷。
- **schema/test 一致性**：`tokenStatsDashboardQuerySchema` 加 `model: z.string().max(200).optional()`，DTO 加 `models: z.array(...).max(500)`，query-cache key 加 `model`，IPC schema 三处 mock 补 `models: []`。所有通道字段对齐，无类型漂移。

### 未进表的提示

无（文件行数、复杂度较 Round 1 无变化，无新增超阈值项）。

### 总体判断

Round 1 两条 blocker（f001 critical / f002 important）均已通过 diff 与代码核实真修，修复未引入新缺陷。AC1-AC6 实现与测试覆盖闭合。

verdict: PASS
