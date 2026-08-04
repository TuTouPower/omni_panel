# Task review t200（reviewer_focus: 代码）

- task：`t200_tokenstats_query_key_trim`
- spec：`docs/tasks/t200_tokenstats_query_key_trim/spec.md`
- diff_anchor：`7303c417097b55f806f4423db2e1116cd3de7d85`
- target：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`
- round：1
- reviewed_at：2026-08-04 10:20 UTC+8

## Findings

### t200_code_f001 - gran 被移出 dashboard 查询缓存 key，违反 spec 明确保留要求与 AC4

- 严重度：critical
- 锚点：spec 范围「gran 决定返回桶粒度，属数据形状，保留在 key 中——s011 结论」；spec 非范围「不把 gran 移出缓存 key」；AC4「gran 切换重新请求但结果等价」
- 位置：`src/renderer/lib/token-stats/query-cache.ts:4-8`（`TokenStatsQueryKey` 无 `gran`）、`:53-58`（`serialize_key` 无 `gran`）；`src/renderer/views/TokenStatsView.tsx:329-336`（`query_key` 无 `gran`）；`tests/unit/renderer/lib/token_stats_query_cache.test.ts:62-69`（维度隔离断言删除了 gran）
- 问题：`gran` 未参与缓存 key 序列化。切换 gran（hour↔day）时 `loadData` 虽因 `session_data_identity` 变化被重建并重跑，但 `query_cache.peek` 命中上次 gran 的缓存（`chart_data` 携带该 gran 的 `axis`/`metric_buckets`/`session_buckets`），不触发新的 dashboard IPC 查询。可观测结果：选中「day」却渲染 hour 桶轴，选中「hour」却渲染 day 桶轴——图表粒度与所选 gran 控件不符且无任何刷新。spec 非范围明确禁止此改动（day 粒度无法由 hour 桶正确求和，sessions distinct 跨桶不可加）；AC4 的「gran 切换重新请求」前提被破坏。`TokenStatsView.tsx:253-255` 注释声称「gran stays in the key」，与实现直接矛盾，说明实现偏离了自身意图。对应单测被改写为把 gran 从 key fixture 中移除并断言不隔离，固化了错误行为（旧测试原断言 gran 维度隔离）。
- 建议：把 `gran` 加回 `TokenStatsQueryKey` 与 `serialize_key`，并在 `TokenStatsView.tsx` 的 `query_key` 字面量中填入 `gran: effective_gran`；恢复 query-cache 测试对 gran 维度隔离的断言；修正 `:253-255` 注释使其与实现一致。

### t200_code_f002 - 数据版本更新后翻页会话页不失效，显示陈旧数据（AC3 违反）

- 严重度：important
- 锚点：AC3「跨筛选/范围/数据版本变化的缓存失效语义保持正确（陈旧数据不展示，新版本触发刷新）」
- 位置：`src/renderer/views/TokenStatsView.tsx:415-454`（翻页 effect）与 `:481-499`（`onUpdated` 处理器）、`:324-328`（identity 检查）
- 问题：`onUpdated` 收到新数据版本后调用 `query_cache.mark_stale()` + `loadData(true)`。`loadData` 中 `last_session_data_identity.current !== session_data_identity` 判断只在 agent/platform/range/gran/aliases 变化时触发 `set_session_offset(0)` + `set_session_page(null)`；数据版本变化不改变 identity，故已加载的第 2+ 页 `session_page` 既不重置也不重取。dashboard 本体（summary/chart/heatmap/首页会话）刷新为新版本，而翻页会话列表继续显示旧版本数据，两区域版本不一致。改前实现 `session_offset` 在 dashboard 查询参数与缓存 key 中，版本更新重取会连带刷新当前页会话，属回归。
- 建议：在 `onUpdated`/`loadData` 的版本变化路径重置 `session_page`（并可按需以当前 `session_offset` 经 `getDashboardSessions` 重取），或把 `last_data_version` 纳入翻页失效判定。

### t200_code_f003 - rollup DTO 丢失 env，renderer session 轴会话身份与旧实现不一致

- 严重度：minor
- 锚点：AC4 等价性；`chart-data.ts:1066` 自述「mirroring the server's dashboard_chart_from_rollup exactly」
- 位置：`src/shared/types/token-stats.ts:219-230`（`tokenStatsRollupRowSchema` 无 `env`）；`src/renderer/lib/token-stats/chart-data.ts:1090`（`session_key` 缺 env）
- 问题：改前服务器 `dashboard_chart_from_rollup` 的 `session_key = ${source}|${env}|${session_id}`；改后 renderer `prepareBarDataFromDashboardRollup` 的 `session_key = ${source}|${session_id}`，且 DTO `rollup` schema 已不含 `env`，renderer 无从区分。tokens/calls + xaxis=session 且 platform=all 时，跨平台同 `session_id` 的两个会话合并为同一分类（distinct 计数低估、标签取首个匹配行）；同时 dashboard 会话列表区（`token-stats-store.ts` `dashboard_session_items`，key 含 env）仍按 `(source,env,session_id)` 身份，两区域身份语义不一致。session_id 为各 CLI 生成的 UUID，实际碰撞概率极低，故按 minor 处置。
- 建议：在 `tokenStatsRollupRowSchema` 补 `env` 并在 renderer `session_key` 恢复 `${source}|${env}|${session_id}`；或至少在 `chart-data.ts` 注释说明有意降级并登记 follow-up。

### t200_code_f004 - dashboard chart 的 otherDetails 与改前不一致（缺 slice 上限与名称 tie-break）

- 严重度：minor
- 锚点：AC4 等价性
- 位置：`src/renderer/lib/token-stats/chart-data.ts:424-428`（`cells_to_bar_data` 的 `otherDetails`）
- 问题：改前服务器 `dashboard_chart_from_cells` 对每个 cell 的 `other_details` 做 `.slice(0, 20)` 与 `b[1]-a[1] || a[0].localeCompare(b[0])` 排序；改后 dashboard 各轴图表改经 `cells_to_bar_data`，无 `.slice(0, 20)` 且仅按值降序。dashboard 图表 tooltip 的「其他」明细条数与同值顺序与改前不同，且明细数量不再有界。模型/目录数通常 <20，实际影响有限。
- 建议：在 `cells_to_bar_data` 的 `otherDetails` 补 `.slice(0, 20)` 并恢复名称 tie-break（对 dashboard 派生路径保持与服务器预派生等价）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：4 条（1 critical、1 important、2 minor）
- 未进表的提示：
    - 文件过大（命中「文件过大标准」，不进 finding 表，仅列行数）：`src/main/core/token-stats/token-stats-store.ts` 1467 行；`src/renderer/lib/token-stats/chart-data.ts` 1217 行；`src/renderer/views/TokenStatsView.tsx` 844 行。三者均超 `src` important 阈值 800，且本 task 均净增行数。store 与 chart-data 因本次大改值得拆分，但未达可观测缺陷，仅提示。
    - 复杂度：`query_dashboard` 拆分为 `dashboard_window_union_builder` / `read_dashboard_rollup` / `read_dashboard_session_page` 等后圈复杂度较改前降低；`prepareBarDataFromDashboardRollup` 新增函数约 CC 8，低于 15 阈值，不进 finding 表。
    - 范围外观察（不进 finding 表）：spec 上下文区声明的「renderer 本地派生与服务器预派生等价性由 oracle 测试保证」未落地——本轮新增测试均用手工 fixture（`chart-data.test.ts:894-983`），无跨端等价 oracle；若存在该 oracle，f003 的 env 偏差应能被捕获。`getDashboardSessions` IPC 与 `/v1/dashboard/sessions` 路由均无 IPC/integration 测试。`query_dashboard_sessions` 每次翻页为填充 `models` 字段重读整窗 rollup（`token-stats-store.ts:1410-1416`），窗口大时成本高，但 AC2 的可观测行为（summary/chart/heatmap 不重算）成立，属性能观察。
    - 证据说明：已运行 `npx tsc --noEmit`（通过）与相关单测（cache/chart-data/shared/store/dashboard/view 全绿）；测试全绿是因测试随实现同步改写了 gran 维度断言（f001），非实现正确。
- 总体判断：`gran` 移出缓存 key 直接违反 spec 范围/非范围与 AC4（f001），数据版本更新后翻页会话显示陈旧数据违反 AC3（f002），存在未解决 critical 与 important，FAIL。
- 系统性 follow-up：无新增 tid；建议后续 task 标题与 slug：`gran 归位 dashboard 查询缓存 key`（阻断：f001）、`数据版本变更失效翻页会话页`（阻断：f002）。

verdict: FAIL

## Round 2 (2026-08-04 11:00 UTC+8)

复核对象：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`（工作区）。已运行 `npx tsc --noEmit`（通过）与相关单测（query-cache / chart-data / token_stats_view / store / shared / ipc / integration 全绿，共 205 条）。

### t200_code_f005 - dashboard 柱图 Top5 选择缺名称 tie-break，与改前服务器不等价（AC4 tie 场景）

- 严重度：minor
- 锚点：AC4「dashboard 展示结果与改前在全部选项组合下等价」
- 位置：`src/renderer/lib/token-stats/aggregate.ts:34-45`（`topGroups` 仅按 `b[1]-a[1]` 降序）；改前服务器 `src/main/core/token-stats/token-stats-store.ts:331-339`（`dashboard_named_values` 用 `b[1]-a[1] || a[0].localeCompare(b[0])`）；调用处 `src/renderer/lib/token-stats/chart-data.ts:421`（`cells_to_bar_data` → `topGroups(totals, 5)`）
- 问题：改前 dashboard 柱图由服务器 `dashboard_chart_from_cells` 预派生，Top5 选择带名称 tie-break（值相同按名称字典序）；改后改由 renderer `cells_to_bar_data` 派生，Top5 经 `topGroups` 只按值降序、tie 时依赖 `Object.entries` 插入序（即 SQL GROUP BY 行序，不确定）。当多个分类值并列（尤其落在 Top5 边界第 5/6 位）时，哪个分类进命名 series、哪个并入「其他」及「其他」合计与改前可能不同。新增 oracle 测试（`chart-data.test.ts:1016+`）的 `calls × project` fixture 恰好有四个分类并列值为 1，但 fixture 行插入序与 localeCompare 序一致，掩蔽了该差异，oracle 无法捕获。
- 建议：`topGroups`（或 `cells_to_bar_data` 的 Top5 选择）补 `a[0].localeCompare(b[0])` tie-break；oracle fixture 补一组乱序并列值用例。

## 结论（Round 2）

- 前轮 finding 复核（以 diff/代码为准）：
    - `t200_code_f001`（critical）——**已消除**。`gran` 回补 `TokenStatsQueryKey` 与 `serialize_key`（`query-cache.ts:7,58`），`TokenStatsView.tsx:329-337` 的 `query_key` 填入 `gran: effective_gran`，`:251-255` 注释与实现一致；query-cache 单测恢复 `{ gran: "day" }` 维度隔离断言（`token_stats_query_cache.test.ts:65-79`）。
    - `t200_code_f002`（important）——**修不彻底，仍阻断**。预设路径已修：`onUpdated` 预设分支重建 preset 范围 → `currentRange` 前移 → `session_data_identity` 变化 → `loadData`（`TokenStatsView.tsx:324-328`）重置 `session_offset`/`session_page`，翻页落回新首页（新增 AC3 测试覆盖）。但 custom-range（`preset=null`）路径未覆盖：版本更新走 `onUpdated` 的 else 分支 `void loadData(true)`（`:498`），`session_data_identity = agent|platform|currentRange|gran|aliasFp`（`:279`）在 custom 范围下固定不变 → 身份检查不触发重置；翻页 effect（`:417-456`）deps 不含数据版本，`session_page`（第 2+ 页）既不重置也不重取。可复现：用户自定义范围含当前时刻并翻到第 2+ 页，新批次提交 → onUpdated 新版本 → dashboard 本体刷新为新版本、翻页会话列表继续显示旧版本行（`currentSessionItems` 优先 `session_page`，`:512-516`），两区域版本不一致。改前 dashboard 查询带 `session_offset`、版本更新重取会连带刷新当前页会话，属回归，AC3「陈旧数据不展示」违反。
    - `t200_code_f003`（minor）——**遗留**。按处置登记 `docs/pending.md` p040，renderer `session_key = ${source}|${session_id}` 无 env 保持不变，与 f003 建议一致；oracle 测试用同 env fixture 规避该差异并注明 p040。
    - `t200_code_f004`（minor）——**已消除**。`cells_to_bar_data` 的 `otherDetails` 补 `.slice(0, 20)` 与名称 tie-break（`chart-data.ts:425-430`），另 `prepareBarData`（`:285-287`）与 `prepareBarDataFromRollup`（`:1043-1046`）同步补齐，与改前服务器一致。
- 本轮新发现：1 条（minor）。
- 未进表的提示：
    - 文件过大（不进 finding 表）：`src/main/core/token-stats/token-stats-store.ts` 1467 行、`src/renderer/lib/token-stats/chart-data.ts` 1217 行、`src/renderer/views/TokenStatsView.tsx` 847 行，均超 800 且本 task 净增，同 Round 1。
    - 复杂度：无新增函数达 ≥15 阈值。
    - 范围外观察：Round 1 提示的「oracle 等价测试未落地」已补齐（`chart-data.test.ts:1016+`，6 个 metric×xaxis 组合含别名比对 labels/series/otherDetails）；`getDashboardSessions` IPC 与 `/v1/dashboard/sessions` 路由仍无 IPC/integration 测试（测试域缺口，非本报告阻断项）。新增 DTO 原始桶上限 `TOKEN_STATS_DASHBOARD_MAX_GROUPS=40000`（`token-stats.ts:262`）——合法查询若在一个 ≤401 桶窗口内出现 >100 个不同 group（hour 粒度下约百级目录量）会超限导致整条 dashboard IPC 返回 `INVALID_RESPONSE`，改前 DTO 只回 Top5 聚合无此界；实际目录量通常远低，属低概率观察。`chart_data.rollup` 无界、整窗携带，窗口大时 dashboard 载荷增大，属性能观察。
    - 证据说明：f001/f004 修复后相关单测为真绿；AC3 测试仅覆盖预设路径（测试默认 preset="30d"），custom 路径无测试。
- 总体判断：f001/f004 已消除，f003 按 p040 遗留，但 f002 只修了预设路径，custom-range + 数据版本更新下翻页会话页仍显示陈旧数据，违反 AC3，未解决 important 仍在，FAIL。
- 系统性 follow-up：承接 f002 未竟部分，建议标题与 slug：`数据版本变更失效 custom 范围翻页会话页`（阻断）。已有 tid 无。

verdict: FAIL

## Round 3 (2026-08-04 11:10 UTC+8)

复核对象：`git diff 7303c417097b55f806f4423db2e1116cd3de7d85`（工作区）。已运行 `npx tsc --noEmit`（通过）；相关单测全绿：token_stats_view（18）、chart-data（58）、query-cache（4）、store（69）、dashboard（14）、shared（6）、ipc（15）、integration local-api（23）、manager（12），合计 219 条。

### Findings（Round 3）

本轮无新增 finding。

## 结论（Round 3）

- 前轮 finding 复核（以 diff/代码为准）：
    - `t200_code_f001`（critical）——**已消除（维持）**。`gran` 仍在 `TokenStatsQueryKey` 与 `serialize_key`（`query-cache.ts:7,58`），`TokenStatsView.tsx:335` `query_key` 填 `gran: effective_gran`；query-cache 单测维度隔离列表含 `{ gran: "day" }`（`token_stats_query_cache.test.ts:71`）。无回归。
    - `t200_code_f002`（important）——**已消除**。`onUpdated` 处理器在 `mark_stale()` 后无条件 `set_session_offset(0); set_session_page(null)`（`TokenStatsView.tsx:498-499`），位于 preset/custom 分支之前，custom-range（preset=null、identity 不变）路径同样落回刷新后 dashboard 首页，不再展示陈旧翻页行。验证：
        - 代码路径（custom）：事件版本 > last → 重置 offset/page → `void loadData(true)` → 同一 query_key（custom 范围固定）命中 stale 缓存 → 重取新 dashboard → `currentSessionItems` 回退 `dashboard.sessions.items`（`TokenStatsView.tsx:519-522`），陈旧 `session_page` 已清空。翻页 effect（`:417-456`）offset 归 0 早退、cleanup `active=false` 丢弃在途页请求，无竞态残留。
        - 新增测试 `AC3: custom range + committed bump drops the stale paged session page`（`token_stats_view.test.tsx`）有效守卫：该测试中 apply-custom-range 后 `session_data_identity` 固定，若无 onUpdated 无条件重置，`session_page` 保持第 2+ 页 → `not.toHaveTextContent("page-2")` 断言失败，故测试确能捕获 Round 2 回归（非恒真）。
        - 预设路径测试 `AC3: a committed data-version bump drops the stale paged session page` 同时保留。
    - `t200_code_f003`（minor）——**遗留（维持，p040）**。renderer `session_key` 仍无 env，按 Round 2 处置登记 `docs/pending.md` p040，本轮未再触及。
    - `t200_code_f004`（minor）——**已消除（维持）**。`cells_to_bar_data` 的 `otherDetails` 含 `.slice(0, 20)` 与名称 tie-break，本轮无回归。
    - `t200_code_f005`（minor）——**代码层面已消除**。`topGroups`（`aggregate.ts:40`）补 `b[1]-a[1] || a[0].localeCompare(b[0])`，与改前服务器 `dashboard_named_values`（`token-stats-store.ts:334`）完全一致；`cells_to_bar_data`（`chart-data.ts:421`）及全部 10 处调用统一获得确定性名称序。tie-break 使并列值在 Top5 边界 5/6 位的入选与「其他」合计确定且与改前等价，AC4 tie 场景满足。
- 本轮新发现：0 条。
- 未进表的提示：
    - f005 配套 oracle 用例偏弱（`chart-data.test.ts`「Top5 边界并列值按名称 tie-break 与改前等价（f005）」）：仅 3 个分组（均在 Top5 内，未触 5/6 边界），且断言 `series.map(s=>s.name).sort()` 掩蔽序列顺序——去掉 topGroups tie-break 该测试仍能通过。代码修复本身正确、与服务器一致，故不构成代码 finding；此测试可信度缺口转 test reviewer 处置。
    - 文件过大提示同 Round 2（token-stats-store.ts 1467 行 / chart-data.ts 1217 行 / TokenStatsView.tsx 847 行，超 800 阈值，本 task 净增），仍不进 finding 表。
    - 复杂度：Round 3 改动（onUpdated 内 2 行状态重置、topGroups 排序表达式）无新增分支，无达阈值函数。
- 总体判断：f001/f004/f005 已消除，f002 custom-range 陈旧翻页路径已无条件重置并新增有效测试覆盖，无未解决 critical / important，PASS。
- 系统性 follow-up：无新增。f002 曾建议的 `数据版本变更失效 custom 范围翻页会话页` 已由本轮修复闭环，无需立项。

verdict: PASS
