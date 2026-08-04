# Task review t204（reviewer_focus: 测试）

- task：`t204_tokenstats_model_filter`
- spec：`docs/tasks/t204_tokenstats_model_filter/spec.md`
- diff_anchor：`571768ca14548038e8e294dc010318ab8a61d799`
- target：`git diff 571768ca14548038e8e294dc010318ab8a61d799`
- round：1
- reviewed_at：2026-08-04 19:05 UTC+8

## Findings

### t204_test_f001 - rollup-ready（union）路径的 model 过滤无自动化覆盖

- 严重度：important
- 锚点：AC2（选定某模型后 KPI/热力/柱状图/会话表只含该模型）+ spec 风险节「SQL 过滤在 union/rollup/records 多路遗漏一侧」
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:673`（t204 三条 store 测试）
- 问题：三条新增 store 测试全部使用默认 `create_token_stats_store(":memory:")`，`hour_rollup_ready` 初值 0，`query_dashboard` 只走 `dashboard_records_source` 单源路径。生产实际状态在 `backfill_hour_rollup()`（或写入期增量 rollup 维护）后 `hour_rollup_ready=1`，走 `dashboard_window_union_builder` 双源 union 路径——该路径两侧新增的 `AND model=@model`（`src/main/core/token-stats/token-stats-store.ts:497` 与 `:514`）只经 spike s013 手工验证，无任何自动化测试触达。若 union 的 rollup 侧或 records 侧遗漏 model 条件，本套测试仍全绿，而生产（rollup-ready）面板筛选错。实测该 union 路径当前实现正确（backfill 后 sonnet 过滤 → tokens=10/sessions=1/calls=1/heatmap=10，与 records 路径一致），故这是覆盖缺口而非现存 bug。
- 建议：新增一条测试——`store.backfill_hour_rollup()` 后以 `{ ...base, model: "sonnet" }` 查询，断言 current/heatmap/chart/sessions 与 records 路径手算值一致；或沿用 AC1 的 SQL 追踪方式断言 union 两侧 SQL 均含 `model = @model`。

### t204_test_f002 - AC4「重开面板保持」的 prefs 恢复路径未验证

- 严重度：minor
- 锚点：AC4（模型选择持久化，重开面板保持）
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx` 「selecting a model refetches the dashboard with the model and persists it (t204)」
- 问题：测试注释写「Prefs persisted: remounting keeps the model selection」，但实际只断言 `localStorage["token-stats-prefs"].model === "sonnet"`，并无 remount / 二次 render。初始化读取路径（`useState(saved.model ?? "all")`，`TokenStatsView.tsx:220`）未被触达；若初始读取不再应用 prefs.model，此测试仍通过。
- 建议：选完模型后 `unmount()` 再 `render(<TokenStatsView />)`，断言下拉初始值为该模型。

### t204_test_f003 - AC3 AND 组合与窗口切换刷新无显式测试

- 严重度：minor
- 锚点：AC3（模型与工具/平台/时间范围组合 AND 语义；切换窗口后模型列表与数据同步刷新）
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:673`、`tests/unit/renderer/views/token_stats_view.test.tsx` 「lists window models… (t204)」
- 问题：store 测试只单独测 model 过滤，既有测试单独测 agent/platform 过滤，无 model+agent 或 model+platform 组合断言；视图测试也未覆盖「切换时间范围后下拉模型列表随之刷新」（模型选项从 `dashboard.models` 响应式派生，窗口切换刷新是隐含行为）。属可补用例，非假绿。
- 建议：补一条 store 组合过滤用例与一条窗口切换后 dropdown 选项刷新的视图用例。

### t204_test_f004 - 其余通道 model 透传与 range_rollup 过滤无显式测试

- 严重度：minor
- 锚点：AC5（local-api 与 IPC 两通道透传 model 且行为一致）+ 范围节（range_rollup 按 model 过滤）
- 位置：`tests/integration/local-api/server.test.ts` 「GET /v1/dashboard forwards an optional model filter (t204)」
- 问题：local-api 在 `/v1/dashboard/sessions`、`/v1/heatmap`、`/v1/hourBuckets`、`/v1/rollup` 四个端点也新增了 model 透传（`src/main/core/local-api/server.ts:362/413/428/443`），但集成测试只覆盖 `/v1/dashboard`；electron IPC 通道走 schema 泛型透传，无显式断言；store 的 `query_range_rollup` model 条件（`token-stats-store.ts:1170`）无测试（heatmap/hour 已测）。均为薄透传层，风险低。
- 建议：可在现有集成测试中补 `/v1/dashboard/sessions` 一条透传断言；range_rollup 补一条 store 过滤用例。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无
- 改测方向复核：无「迁就实现」的改测。既有测试的修改全部是给 DTO 新必填字段 `models` 补 fixture（ipc/local-api/shared/view 各加 `models: []` / `["sonnet"]`），属合法适配；query-cache 测试补 `model` 进 key 工厂与维度数组，是新增需求要求的必要扩展。无删 expect、无弱化断言、无 `.skip`/`.only`、无 `@ts-ignore`/`eslint-disable`。
- 本轮新发现：4 条（1 important + 3 minor）
- 未进表的提示：AC2 的 KPI 三指标（tokens/sessions/calls）与 model_token_totals 均按手算值精确断言，heatmap/chart/sessions 区域经求和与长度断言，测试触达真实生产 store（非 mock 被测逻辑），mock 边界止于 IPC / dispatcher 系统边界，测试可信度高。union 路径经我独立探针实测正确。
- 总体判断：AC1-AC6 均有对应测试且断言用户可观察行为，无危险模式命中；唯一 important 是 rollup-ready 生产路径的 model 过滤缺自动化回归覆盖（s013 spike 手工验证不能替代）。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-04 20:30 UTC+8)

### 前轮 finding 复核

- **t204_test_f001（important）— 仍存在**：本轮 diff 未在 store 层新增任何 rollup-ready（union 双源）路径的 model 过滤自动化用例。`token-stats-store.test.ts`（baseline 已有的 `matches the records fallback after backfill` 参数化用例，1778-1795 行）的 `queries` 数组只覆盖 agent/platform/metric/xaxis/gran 组合，**无 model 维度**，且该文件本轮零改动。t204 新增的三条 store 测试（`token_stats_dashboard.test.ts:674/762/794`）继续使用 `create_token_stats_store(":memory:")` 默认 `hour_rollup_ready=0`，仅触达 `dashboard_records_source` 单源 fallback。生产 `backfill_hour_rollup()` 后切换到的 `dashboard_window_union_builder` 双源路径（`token-stats-store.ts:497` 与 `:514` 的 `AND model=@model`）依旧零自动化覆盖，若任一侧 model 条件被改坏，本套测试全绿。f001 未消除。
- **t204_test_f002（minor）— 仍存在**：`token_stats_view.test.tsx` 「selecting a model refetches... persists it」未追加 remount，仍仅断言 `localStorage["token-stats-prefs"].model === "sonnet"`。
- **t204_test_f003（minor）— 仍存在**：无 model+agent 或 model+platform 组合 store 用例；无窗口切换后 dropdown 选项刷新的视图用例。
- **t204_test_f004（minor）— 部分处置**：本轮新增 `tests/unit/web/usageboard-web.test.ts` 三条用例覆盖 `/v1/dashboard`、`/v1/dashboard/sessions`、`/v1/heatmap`、`/v1/hourBuckets`、`/v1/rollup` 的 model 透传（URL 含 `model=...`），薄透传层断言到位。剩余缺口：store 的 `query_range_rollup` model 过滤仍无单测；electron IPC 通道（schema 泛型透传）无显式断言。

### 本轮新 finding

无新增 important / critical。无新增 minor（本轮新增 web 透传三例虽为薄 URL 断言，但与 f004 同类判定，已归并到 f004 复核）。

### 改测方向复核

本轮新增测试无「迁就实现」式改测：web 三例 mock fetch 后断言 URL query，是合法边界 mock + 用户可观察接口（HTTP 请求形态）断言；view 新增三例通过 `userEvent.selectOptions` 触发真实交互，断言 query 调用次数与参数；无删 expect、无 `.skip`、无 `@ts-ignore`、无弱化断言。

### 本轮新发现

0 条。

### 未进表的提示

- view 缓存用例（`sonnet → opus → sonnet → all`，调用次数停在 3）是对 AC6「模型筛选变化使缓存失效并重新查询」的精确固化，可信度高。
- store 测试 `sonnet.models === ["opus", "sonnet"]`（过滤后仍返回全窗口列表）对应 AC1「选项列表 = 当前筛选窗口内实际出现过的模型名」，防止选中后下拉收窄的实现回归。

### 总体判断

f001 important 持续未消除——union 双源路径的 model 过滤自动化覆盖在本轮未补，AC2 在生产实际执行路径（rollup-ready）下的回归保护仍缺。

verdict: FAIL

## Round 3 (2026-08-04 20:35 UTC+8)

### 前轮 finding 复核

- **t204_test_f001（important）— 已消除**：本轮 diff 仅改 `tests/unit/main/core/token-stats/token-stats-store.test.ts`，在该 describe 块新增两处针对 union 双源路径的 model 过滤覆盖，已实际触达 rollup-ready 生产路径：
    1. 参数化用例 `matches the records fallback after backfill`（1792 行起的 for-of）的 `queries` 数组新增第 11 项 `{ ..., model: "sonnet-4" }`（1779–1788 行）。该用例先以 records 单源查 `before`，再 `backfill_hour_rollup()` 后以 union 双源查 `after`，对 current/previous/chart_data/heatmap/sessions 五区域做 `toEqual` 逐项比对。窗口 `[2026-07-10T07:30, 2026-07-11T12:15]` 跨越多完整小时，`has_full_hours=true`，backfill 后 `is_hour_rollup_ready()=true`，必然走 `dashboard_window_union_builder`（生产代码 `token-stats-store.ts:497` rollup 侧 + `:514` records 侧，两处 `${model_where}`）。若 union 任一侧 model 条件被改坏，`after ≠ before`，测试红——这是真实的回归保护，非冒充覆盖。
    2. 新增独立用例 `union dual-source path filters every region by model after backfill (t204)`（1810 行起）：backfill 后以 `{ model: "sonnet-4" }` 查询，断言 `current.calls === 5`（fixture sonnet-4 current 窗记录 a1/a2/a3/d1/a4 恰 5 条）、`sessions.items` 仅含 s1/s4、`chart_data.metric_buckets` 与 `chart_data.rollup` 每行 `model === "sonnet-4"`。断言针对用户可观察的 KPI/会话/图表区域，且 `every(... === "sonnet-4")` 是行为断言非存在性断言。
    - 实跑验证：`pnpm vitest run ... -t "after backfill"`（13 passed，含新增 model 项）与 `-t "union dual-source path"`（1 passed）均真实绿，非 skip。
    - f001 要求「backfill 后断言 union 两侧 model 过滤正确」已由上述两例满足。PASS。
- **t204_test_f002（minor）— 遗留 p043**：未追加 remount 覆盖。已登记 `docs/pending.md:37` p043。
- **t204_test_f003（minor）— 遗留 p043**：无 model+agent/platform 组合 store 用例，无窗口切换刷新 dropdown 视图用例。已登记 p043。
- **t204_test_f004（minor）— 遗留 p043**：store 的 `query_range_rollup` model 过滤、electron IPC 通道透传仍无显式断言。Round 2 已补 web 通道五端点透传；本轮无新增。已登记 p043。

### 本轮新 finding

无。本轮新增的参数化用例注释（1776–1778 行）与独立用例内注释（「KPI only counts sonnet-4 records (a1/a2/a3/d1/a4 = 5 calls)」等）与 fixture 实际数据一致，断言强度合理，无危险模式。

### 改测方向复核

无「迁就实现」式改测。本轮新增是对既有参数化 for-of 的维度扩展（新增一项 query）与一条全新独立用例，均断言生产路径的正确行为（model 过滤后值与手算一致、union 与 records 路径逐区域相等），未改任何既有断言的预期值。无删 expect、无 `.skip`/`.only`、无 `@ts-ignore`/`eslint-disable`、无弱化断言。

### 本轮新发现

0 条。

### 未进表的提示

- 参数化 for-of 现已含 11 个 query 组合，model 维度作为其中一项并入比对循环，结构整洁，未引入重复样板。
- 独立用例选择 `every(b => b.model === "sonnet-4")` 而非逐桶 toEqual，是合理的强度/可读性折中（fixture sonnet-4 跨多桶，逐桶手算冗长且价值低）。

### 总体判断

f001 important 已由两条新增/扩展用例真实消除——union 双源（rollup-ready）路径的 model 过滤现在有自动化回归覆盖，且实跑通过。剩余 minor f002/f003/f004 已登记 p043 不阻断。

verdict: PASS
