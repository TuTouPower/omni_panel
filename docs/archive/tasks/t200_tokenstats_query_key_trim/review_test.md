# Task review t200（reviewer_focus: 测试）

- task：`t200_tokenstats_query_key_trim`
- spec：`docs/tasks/t200_tokenstats_query_key_trim/spec.md`
- diff_anchor：`7303c417097b55f806f4423db2e1116cd3de7d85`
- target：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`
- round：1
- reviewed_at：2026-08-04 10:25 UTC+8

## Findings

### t200_test_f001 - gran 被移出 query cache key，违反 AC4「gran 切换重新请求」与非范围「不把 gran 移出缓存 key」；缓存隔离测试的 gran 用例被删（迁就实现）

- 严重度：critical
- 锚点：AC4「gran 切换重新请求但结果等价」+ 非范围「不把 gran 移出缓存 key（桶粒度是数据形状，s011 结论；day 粒度无法由 hour 桶正确求和——sessions distinct 跨桶不可加）」
- 位置：
    - `src/renderer/lib/token-stats/query-cache.ts:6-11`（`TokenStatsQueryKey` 删除了 `metric`/`xaxis`/`gran`/`session_offset`）
    - `src/renderer/views/TokenStatsView.tsx:329-336`（`query_key` 不含 `gran`）
    - `tests/unit/renderer/lib/token_stats_query_cache.test.ts:61-79`（维度隔离用例删除了 `{ gran: "hour" }`）
- 问题：spec 契约区当前版本（注入版）明确要求 `gran` 保留在缓存 key 中（桶粒度是数据形状，day 无法由 hour 桶正确求和）。实现把 `gran` 从 key 中删除，同时 `TokenStatsView` 内 `loadData` 通过 `session_data_identity`（含 `effective_gran`）在 gran 切换时重建并重跑（`TokenStatsView.tsx:279,408-410`），但 peek 命中旧 gran 的缓存 → `apply_query_data(cached.data)` 直接展示错误桶粒度数据，且不发出新 dashboard 请求。用户切 gran 后图表停留在上一粒度的轴与桶。这与 AC4「gran 切换重新请求」直接冲突，也违反非范围。改测方向复核：旧测试「keeps every query key dimension isolated」原含 `{ gran: "hour" }` 隔离用例，本 diff 将其删除以匹配实现——属于「把旧测试预期改成新实现输出」，未在更高层补回 gran 切换覆盖。当前实现与 s011 spike 报告（report.md:41「缓存 key 可剥离 metric/xaxis/gran」）一致，但与最终 spec（明确保留 gran）冲突，实现应以后者为准。gran 切换行为（重新请求 + 等价）目前完全无测试。
- 建议：把 `gran` 放回 `TokenStatsQueryKey` 与 `loadData` 的 `query_key`；恢复/新增「gran 变化 → 独立缓存条目 / 触发重新请求」用例；新增视图层「切换 gran 触发 getDashboard 新调用」测试（预期与 AC1 的 metric/xaxis 测试对照，验证两类切换语义不同）。

### t200_test_f002 - AC4「与改前等价」缺 oracle / 基线比对测试，旧服务器 chart 构建器被删未留等价验证

- 严重度：important
- 锚点：AC4「dashboard 展示结果与改前在全部选项组合下等价（以 oracle 或既有测试基线核对）」；上下文区未知契约「renderer 本地派生与服务器预派生等价性由 oracle 测试保证」
- 位置：`tests/unit/renderer/lib/token-stats/chart-data.test.ts:895-988`（新增 `prepareBarDataFromDashboardChartData` 用例全部基于手写 fixture + 手算期望）；`docs/spikes/s011_tokenstats_chart_render_derive/code/`（空目录，无 oracle 代码）；旧 `dashboard_chart_from_hour_buckets` / `dashboard_chart_from_rollup`（store :442/:483）已删除
- 问题：AC4 要求的「与改前全部选项组合等价」的验证手段是 oracle 或既有测试基线。旧服务器端 chart 预派生函数已被删除，且未在任何测试中保留其期望输出作为基线；新增派生测试只对手写 fixture 断言手算值（如 sonnet 系列 `[30,20]`、`/alpha` 桶 `[2,0]`），并不比对改前输出。spec 上下文区声称的「oracle 测试保证」在本 diff 与 spike 产物中均不存在。若新派生在「其他」阈值、别名合并、top-20 截断、session 标题等细节与旧输出有偏差，现有测试不会暴露——这正是 AC4 要防护的展示漂移风险。该等价性仅在个别 fixture 上被抽查（store 求和断言 + 派生手算值），非系统性核对。
- 建议：补一个 oracle 测试：对同一固定数据集，把旧 server 侧 chart 构建（可从 git 历史恢复 `dashboard_chart_from_cells`/`dashboard_chart_from_rollup` 输出）与新 renderer 派生结果在 metric×xaxis×gran 组合下逐项 `toEqual`；或至少为「其他」合并、别名、top-20、session 标题截断补针对性等价用例。

### t200_test_f003 - 别名解析迁移到新增 renderer 派生路径后无任何测试覆盖（范围「别名行为不变」未验证）

- 严重度：minor
- 锚点：范围「保持 dashboard 展示正确性与现有筛选 / 别名行为不变」
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:209-215`（别名断言由「series 名 'X' 合计 101」改写为「raw m1/m6 bucket 合计 101」）；`tests/unit/renderer/lib/token-stats/chart-data.test.ts:895-988`（新派生用例均未传 `dirAliases`/`modelAliases`）
- 问题：旧 store 测试验证别名 `X` 出现在 dashboard chart series 中（合计 101）。本 diff 把该断言改为只验 raw bucket 合计，注释注明「alias resolution happens in the renderer derivation (t200)」——即别名解析责任迁移到 `prepareBarDataFromDashboardChartData`/`prepareBarDataFromDashboardRollup`。但新增派生测试调用这些函数时不传别名参数，别名合并行为在 renderer 侧无任何用例；原 `apply_dashboard_aliases`（BarChart.tsx 内，已删除）本就无直接单测，别名展示行为的唯一覆盖点（store 测试）被改写后消失。范围承诺「别名行为不变」无测试支撑。
- 建议：给 `prepareBarDataFromDashboardChartData`（time 轴 project 与 model 系列）与 `prepareBarDataFromDashboardRollup` 补别名合并用例（与旧 `apply_dashboard_aliases` 语义对齐）。

## 结论

- 前轮 finding 复核：无（Round 1）。
- 改测方向复核：
    - `token_stats_query_cache.test.ts` 删除 gran 隔离用例 → 迁就实现且违反当前 spec（f001，critical）。
    - `token_stats_dashboard.test.ts`（main）别名断言改写为 raw bucket → 断言迁就新 DTO 形态，但别名行为覆盖丢失且未在 renderer 侧承接（f003，minor）。
    - 翻页测试改写（`onPageChange` → sessions 通道）→ 合法：行为按 spec 变更（走独立通道、dashboard 不重请求），断言同步正确。
    - 其余 `chart` → `chart_data` fixture/断言改写（store/shared/ipc/server）→ 合法：DTO 契约按 spec 变更，聚合语义等价。
    - 新增 AC1 两用例、store `query_dashboard_sessions` 用例、`chart-data` 派生用例 → 新增语义覆盖，方向正确。
- 本轮新发现：3 条（f001 critical、f002 important、f003 minor）。
- 未进表的提示：
    - 视图层 AC1「展示内容正确派生」的端到端验证较弱：mock BarChart 只断言 `chartData` truthy，派生正确性依赖 chart-data 单测；可接受，可考虑断言切换 metric 后 mock 收到同一 `chartData`（对象引用不变）以证明缓存复用。
    - 新增 IPC `tokenStats:dashboardSessions` 与 `/v1/dashboard/sessions` 路由无 IPC 单测 / 集成测试（thin glue，扩展建议，非阻断）。
    - `chart-data.test.ts` 时间轴派生用例中每个 hour 桶恰好落在一个 day 边界上，未覆盖「hour 桶落于 day 中间需合并」的非对齐映射（minor 扩展）。
    - `src/shared/types/token-stats.ts:319,440` 的 `tokenStatsDashboardChartSchema`/`TokenStatsDashboardChart` 已无引用（死代码）——属 code reviewer 关注点，此处仅提示。
    - 契约区 drift：注入版契约区相对 diff_anchor 有变更（metric/xaxis/gran 三项全剥离 → 仅剥离 metric/xaxis，gran 保留）。实现与旧版/s011 结论一致，与当前 spec 冲突；f001 已按当前 spec 处理。
- 总体判断：gran 被移出缓存 key 导致 AC4「gran 切换重新请求」行为缺陷且对应测试被删，AC4 等价性亦缺 oracle/基线验证——存在未解决 critical/important，FAIL。
- 系统性 follow-up：无既有 tid；建议两条：
    - 修复 f001：标题「gran 回补 dashboard 查询缓存 key」，slug `t2xx_dashboard_cache_gran_key`，阻断性 critical。
    - 补 oracle：标题「dashboard chart 派生与服务器预派生等价性 oracle 测试」，slug `t2xx_dashboard_chart_oracle`，阻断性 important。

verdict: FAIL

## Round 2 (2026-08-04 11:10 UTC+8)

- task：`t200_tokenstats_query_key_trim`
- spec：`docs/tasks/t200_tokenstats_query_key_trim/spec.md`
- diff_anchor：`7303c417097b55f806f4423db2e1116cd3de7d85`
- target：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`
- round：2
- reviewed_at：2026-08-04 11:10 UTC+8
- 验证方式：全量 `vitest run` 205 文件 2137 passed / 1 skipped（skipped 为预置 `tests/unit/connector/opencode_go.test.ts:568` `it.skipIf`，与本次 diff 无关）；受影响测试文件无 `.skip`/`.only`/`.todo`/新增 eslint-disable（ipc/store 中的 eslint-disable 均存在于 anchor 版本）。

## 前轮 finding 复核（以 diff 与代码为准，不采信处置表）

### t200_test_f001（critical）— 已消除

- `src/renderer/lib/token-stats/query-cache.ts:7` `gran: string` 已回补 `TokenStatsQueryKey`，`serialize_key`（:58）含 `query_key.gran`。
- `src/renderer/views/TokenStatsView.tsx:335` loadData 的 `query_key` 含 `gran: effective_gran`；`effective_gran` 在 loadData 依赖数组（:402），切 gran 重建 loadData → 重新请求；`session_data_identity`（:279）含 `effective_gran`，切 gran 同时重置分页。AC4「gran 切换重新请求」语义恢复。
- `tests/unit/renderer/lib/token_stats_query_cache.test.ts:69` 维度隔离用例恢复 `{ gran: "day" }`。
- 残留（不阻断）：视图层仍无「切换 gran → 触发新 getDashboard 调用」对照测试（Round 1 建议项）；cache 层隔离 + 依赖数组 wiring 已机械保证该行为。标 minor。

### t200_test_f002（important）— 已消除

- `tests/unit/renderer/lib/token-stats/chart-data.test.ts:1018-1319` oracle 等价测试已落地。已将参考实现与 anchor 的 `git show 7303c4:token-stats-store.ts:409-565` 逐段比对，转写忠实（`value_of`、`session_key` 含 env、`ranked_categories` slice 20 + localeCompare tie-break、`other_index` 判定、cells/session_cells 构造、`dashboard_chart_from_cells` 的 top5/其他/other_details slice 20、alias resolver 单 key 覆盖）。
- 覆盖 `prepareBarDataFromDashboardRollup` × 6 组合（tokens/calls/sessions × project/session），dir/model 别名参与，labels/series（名字集合排序后逐个比对 data）/otherDetails 逐项 `toEqual`。
- 残留（均不阻断，见「未进表提示」）：oracle fixture 恰 5 个系列 key，未触发「其他」桶与 other_details 实际内容；time 轴路径不进 oracle；env 维度差异由 oracle 注释显式声明并跟踪 p040。

### t200_test_f003（minor）— 已消除

- chart-data.test.ts:990-1001 project 轴 dir 别名合并用例（/alpha+/beta → "P"，total 40）。
- chart-data.test.ts:1003-1015 time 轴 model 别名合并用例（sonnet+opus → "S"，[40,20]）。
- oracle 中 `prepareBarDataFromDashboardRollup` 在 dir/model 别名下断言等价。renderer 别名解析三条路径均有覆盖。

## 本轮新发现

0 条 blocking。无危险模式命中（无恒真断言、无删/弱化断言、无 `.skip/.only`、无注释断言、无 mock 被测逻辑、无阈值掩盖；AC3 测试的 `get_dashboard_sessions.mock.calls.length).toBeLessThanOrEqual(2)` 为竞态容忍上界，主断言是 v6 展示 + page-2 不落地，非弱化放行）。

## 结论

- 前轮 finding 复核：f001 已消除（gran 回补 key + 测试恢复隔离用例）；f002 已消除（oracle 落地且转写经 anchor 代码逐段核实）；f003 已消除（别名用例补齐）。全部以前轮 blocker 已消除。
- 改测方向复核：本轮无「迁就实现」的改测。查询缓存测试恢复 gran 隔离、翻页测试改写为 sessions 通道、`chart` → `chart_data` fixture/DTO 断言改写均对应 spec 契约变更，语义等价；新增 AC1/AC2/AC3/oracle/别名用例方向正确。
- 本轮新发现：0 条 blocking。
- 未进表的提示：
    - 视图层缺「切 gran → 新 getDashboard 调用」对照测试（f001 建议，cache 层已测，扩展建议）。
    - oracle fixture 未触发「其他」桶（共享 `cells_to_bar_data` 的合并逻辑由 prepareBarDataFromRollup「keeps top 5 projects and merges the rest into 其他」用例覆盖，非缺口）。
    - renderer `prepareBarDataFromDashboardRollup` session_key 缩为 `${source}|${session_id}`（旧含 env）——oracle 全行 env 相同故未暴露，已跟踪 p040，不属本轮新 blocker。
    - 新 IPC `tokenStats:dashboardSessions` 仍无 IPC 单测（thin glue，Round 1 已提示，非阻断）。
    - 契约区 drift（gran 回补）与当前注入契约一致，spec.md 已更新，drift 消解。
- 总体判断：3 条前轮 finding 均按 diff/代码核实修复，无未解决 critical/important，仅有 minor 扩展建议，PASS。
- 系统性 follow-up：无新增；p040（session key 不含 env）沿用既有编号。

verdict: PASS

## Round 3 (2026-08-04 11:16 UTC+8)

- task：`t200_tokenstats_query_key_trim`
- spec：`docs/tasks/t200_tokenstats_query_key_trim/spec.md`
- diff_anchor：`7303c417097b55f806f4423db2e1116cd3de7d85`
- target：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`
- round：3
- reviewed_at：2026-08-04 11:16 UTC+8
- 验证方式：全量 `vitest run` 205 文件 2139 passed / 1 skipped（skipped 为预置 `tests/unit/connector/opencode_go.test.ts:568` `it.skipIf`，与本次 diff 无关）；另单跑 token_stats_view.test.tsx（18）与 chart-data.test.ts（58）均绿。新增测试审读聚焦本轮两处改动：onUpdated 统一重置分页的 AC3 用例、topGroups tie-break 的 oracle 用例。

## 前轮 finding 复核

- t200_test_f001（critical）、f002（important）、f003（minor）：Round 2 已按 diff/代码核实消除；本轮新增改动（TokenStatsView onUpdated 重置、aggregate.ts topGroups tie-break、chart-data otherDetails sort/slice）不触碰其消除路径，前轮结论维持。f001 的 gran 回补、f002 的 oracle 等价、f003 的别名用例均未回归（全量测试绿）。

## 本轮新发现

### t200_test_f004 - tie-break oracle 用例未验证其声称的 topGroups tie-break：断言 `series.map(s=>s.name).sort()` 掩蔽序列顺序、fixture 未触 Top5 5/6 边界，去掉生产 tie-break 该用例仍通过

- 严重度：important
- 锚点：AC4「dashboard 展示结果与改前在全部选项组合下等价（以 oracle 或既有测试基线核对）」；上下文区未知契约「renderer 本地派生与服务器预派生等价性由 oracle 测试保证」
- 位置：
    - `tests/unit/renderer/lib/token-stats/chart-data.test.ts:1320-1383`（「Top5 边界并列值按名称 tie-break 与改前等价（f005）」用例）
    - `src/renderer/lib/token-stats/aggregate.ts:40`（本轮生产改动：`topGroups` 补 `a[0].localeCompare(b[0])` tie-break）
- 问题：本轮生产改动是 `topGroups` 补名称 tie-break（`aggregate.ts:40`），使并列值在 Top5 边界 5/6 位的入选与「其他」合计确定且与改前服务器一致。新增 oracle 用例旨在钉住该行为，但实际做不到：
    1. fixture 仅 3 个分组（tokens 60/60/20），全部落在 Top5 内、无「其他」桶，未触 5/6 边界——标题声称的「Top5 边界并列值」场景没有进入测试。
    2. 断言 `renderer.series.map((s) => s.name).sort()`（:1375-1377）把序列名称排序后再比，掩蔽了系列顺序；而 `topGroups` tie-break 恰恰只影响系列顺序与 5/6 入选，不影响 labels（labels 来自 `prepareBarDataFromDashboardRollup` 自带的 `ranked_categories` 排序）。逐个核对：去掉 `aggregate.ts:40` 的 tie-break 后，totals={m1:60,m2:60,m3:20} 稳定排序保持插入序 m1,m2,m3，series 名称集合与各 series 数据均不变——该用例仍通过。labels 断言（:1374）虽顺序敏感，但来自 `prepareBarDataFromDashboardRollup` 自己的排序表达式（Round 2 转写时已含 tie-break），钉不住本轮 `topGroups` 改动。
    3. 同理，本轮 `otherDetails` 补 `.slice(0, 20)` 与名称 tie-break（`chart-data.ts:425-430`、`prepareBarData` :285-287、`prepareBarDataFromRollup` :1043-1046）也未获新用例覆盖：tie fixture 无「其他」桶，6 组合 oracle 的 otherDetails 断言（:1298）在别名合并后均为空/最小。
    - 结论：本轮为修复 f005 而做的 `topGroups` tie-break 生产改动目前无任何测试真正钉住（`aggregate.test.ts` 既有 topGroups 用例用互异值 100/80/60/40/20/10，不触 tie）；AC4 tie 场景等价性依赖该用例的「证明」是假象。该可信度缺口与 code reviewer 转手一致（`review_code.md:109`：去掉 topGroups tie-break 该测试仍能通过，转 test reviewer 处置）。
- 建议：把 tie-break oracle 用例改造成真正验证 topGroups 行为——(a) 断言改为顺序敏感：去掉 `series.map(s=>s.name).sort()`，按 `renderer.series.map(s=>s.name)` 与 `oracle.series` 顺序逐项 `toEqual`（系列顺序是图例/堆叠的可观察输出，本就应等价）；(b) 补 ≥6 分组 fixture，让并列值落在 Top5 第 5/6 位，断言入选/并入「其他」及「其他」合计与 oracle 一致；(c) 或给 `aggregate.ts` `topGroups` 直接补一个并列值单元用例（对照改前 `dashboard_named_values` 语义）。

## 结论

- 前轮 finding 复核：f001/f002/f003 维持已消除（Round 2 已核实；本轮新增改动未回归其覆盖路径）。
- 改测方向复核：本轮无「迁就实现」的改测。新增两个 AC3 视图测试（token_stats_view.test.tsx:464-564）与一个 oracle tie-break 用例均为新增；aggregate.ts / chart-data.ts 生产改动未要求改写任何既有测试（aggregate.test.ts 与既有 chart-data 断言未动，全量测试绿）。
- 本轮新发现：1 条（f004，important）。
- 未进表的提示：
    - 视图层「切 gran → 新 getDashboard 调用」对照测试仍缺（Round 1/2 建议项，cache 层已机械保证，扩展建议）。
    - AC3 两个新用例（:464-564）可信且有效：`get_dashboard_sessions.mock.calls.length).toBeLessThanOrEqual(2)` 为竞态容忍上界，主断言是 v6 展示 + page-2 不落地，非弱化放行（与 Round 2 接受的既有模式一致）。custom-range 用例（:513-564，preset=null）实测能钉住本轮 onUpdated 重置：该路径 bump 后 preset 分支不生效、loadData 的 `session_data_identity` 不因范围变化而重置，若去掉 onUpdated 的 `set_session_offset(0); set_session_page(null)`（TokenStatsView.tsx:498-499），session_page 保持 page-2 使 `not.toHaveTextContent("page-2")` 失败——有效回归测试。preset 用例（:464-511）验证 preset 路径 AC3 行为（range 移位经 identity 重置兜底）。
    - 视图层 AC1 用例的 `mocked_bar_chart.props?.chartData` truthy 断言为次级补充，主断言是 `get_dashboard` 调用次数（缓存命中），Round 2 已接受。
    - 契约区 drift（gran 回补）与当前注入契约一致，spec.md 已更新，无新 drift。
- 总体判断：Round 2 PASS 后新增的 onUpdated 分页重置与两个 AC3 视图测试可信、有效（custom-range 用例真实钉住新重置代码）；但配套的 tie-break oracle 用例未验证其声称的生产改动（topGroups tie-break 去掉后仍通过，序列顺序被 `sort()` 掩蔽、5/6 边界未入 fixture），AC4 tie 场景等价性未被该用例真正验证，且该缺口由 code reviewer 明确转交 test reviewer——存在未解决 important，FAIL。
- 系统性 follow-up：无新增；p040（session key 不含 env）沿用既有编号。

verdict: FAIL

## Round 4 (2026-08-04 11:30 UTC+8)

- task：`t200_tokenstats_query_key_trim`
- spec：`docs/tasks/t200_tokenstats_query_key_trim/spec.md`
- diff_anchor：`7303c417097b55f806f4423db2e1116cd3de7d85`
- target：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`
- round：4
- reviewed_at：2026-08-04 11:30 UTC+8
- 验证方式：单跑 aggregate.test.ts（17 passed）与 chart-data.test.ts（58 passed）全绿；对去掉 `aggregate.ts:40` tie-break 的变异灵敏度用独立 node 脚本复算确认（未改工作区任何文件）。

## 前轮 finding 复核（以 diff 与代码为准，不采信处置表）

### t200_test_f004（important）— 已消除

- oracle 用例（`chart-data.test.ts:1320-1375`）重写为本轮描述形态，逐项核对：
    1. fixture 6 个 model 分组（m1..m4 合计 100/80/60/40，m5 与 m6 并列 30），并列值恰落 Top5 第 5/6 位，触 5/6 边界；`/a6`（m6）cell 插在 `/z5`（m5）之前，使 renderer 侧 `cells_to_bar_data` 的 `totals` 插入序为 m1,m2,m3,m4,m6,m5——无 tie-break 时稳定排序按插入序把 m6 选进 Top5，与改前服务器 name 序相悖。Round 3 f004 问题 1（fixture 未触边界）消除。
    2. 断言改为顺序敏感：`renderer.series.map((s) => s.name)).toEqual(oracle.series.map(s => s.name))`（:1366，`toEqual` 数组按序比，无 `sort()` 掩蔽）+ 显式 `some(name==="m5")).toBe(true)` / `some(name==="m6")).toBe(false)`（:1368-1369）。Round 3 f004 问题 2（`sort()` 掩蔽序列顺序）消除。
    3. 变异验证（node 复算，不改代码）：去掉 tie-break 后 `topGroups` 对同一 totals 得 top5=[m1,m2,m3,m4,m6]、rest=[m5]，与 oracle 序列 [m1,m2,m3,m4,m5,其他] 不等 → 顺序敏感断言与 m5/m6 成员断言均失败；恢复 tie-break 后 top5=[m1,m2,m3,m4,m5]。该用例真正钉住 `topGroups` tie-break。
- `aggregate.test.ts:105-114` 新增 topGroups 并列值单测（x:100, z:50, a:50，z 插入在前）：tie-break 时 top=["x","a"]、rest=["z"]；变异复算无 tie-break 时 top=["x","z"]，断言必失败。函数级直接钉住 tie-break，与 oracle 用例互为冗余双保险。
- 锚定基准核实：diff_anchor `token-stats-store.ts:325` `dashboard_named_values` 用 `b[1]-a[1] || a[0].localeCompare(b[0])`（name tie-break），与 `aggregate.ts:40`、oracle `oracle_named_values`（:1038）一致——renderer tie-break 语义与改前服务器等价，测试断言方向正确。

## 本轮新发现

0 条 blocking。无危险模式命中：新增断言均为严格 `toEqual`/`toBe(true/false)`，无恒真/弱化/`.skip`/`.only`/注释断言/eslint-disable（已 grep 两个改动测试文件，无标记）；`expect(o).toBeTruthy()`（:1371）为 `s.data toEqual o?.data` 前的查找守卫，非主断言，去掉也会因 `o?.data` 为 undefined 而失败，沿用 Round 2 已接受形态。

## 结论

- 前轮 finding 复核：f004（important）已消除——oracle 用例重写后触 5/6 边界、断言顺序敏感、变异时必失败（node 复算确认）；`aggregate.ts` 函数级单测另加一重直接钉住。f001/f002/f003 维持 Round 2/3 已消除结论，本轮测试改动不触碰其覆盖路径（全量相关测试绿）。
- 改测方向复核：本轮无「迁就实现」的改测。两处改动均为新增测试（aggregate 单测 + oracle 用例重写），生产代码（`aggregate.ts:40` tie-break）自 Round 3 起未再改动，无既有断言被改写。
- 本轮新发现：0 条 blocking。
- 未进表的提示：
    - tie 用例仍不直接断言 `renderer.otherDetails`，且任何 fixture 均未触「同 cell 多个 rest 键并列值」的 otherDetails 排序/slice 内容；但 其他 系列的 data 断言（:1370-1374）已验证 m6 的 30 落入「其他」且位置正确，otherDetails 排序表达式与 oracle `other_details`（:1061-1066）转写逐句一致，`slice(0,20)`/name tie-break 属工具提示条目的边缘排序，Round 2 已按非阻断残余处理，维持 minor 扩展建议（不阻断）。
    - 视图层「切 gran → 新 getDashboard 调用」对照测试仍缺（Round 1/2 建议项，cache 层已机械保证，扩展建议）。
- 总体判断：f004 已按 diff/代码核实真修（oracle 用例变异时必失败 + aggregate 函数级单测双重钉住），无未解决 critical/important，仅有 minor 扩展建议，PASS。
- 系统性 follow-up：无新增；p040（session key 不含 env）沿用既有编号。

verdict: PASS
