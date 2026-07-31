# Task review t173（reviewer_focus: 代码）

- task：`t173_tokenstats_hour_aggregate`
- spec：`docs/tasks/t173_tokenstats_hour_aggregate/spec.md`
- diff_anchor：`b39c6f105c2840b87aaacf4f246a07d6ba249e3d`
- target：`git diff b39c6f105c2840b87aaacf4f246a07d6ba249e3d`
- round：1
- reviewed_at：2026-07-31 23:23 UTC+8

## Findings

### t173_code_f001 - sessions 指标跨模型重复计数，代码注释对 records 路径的描述不准确

- 严重度：minor
- 锚点：AC3「sessions 按 per-hour 去重会话数」；行为差异：同一会话同小时内使用两个 model 时，7d/30d 小时图该小时会话数显示为 2，而 24h 窗口（records 路径）显示为 1，同一数据两处口径不一致。
- 位置：
    - SQL：`src/main/core/token-stats/token-stats-store.ts:560`（`COUNT(DISTINCT session_id)` 按 `(hour_start, model)` 分组）
    - 渲染聚合：`src/renderer/lib/token-stats/chart-data.ts:377-381`（`prepareBarDataFromHourBuckets` 跨 model 求和）
    - records 路径对照：`src/renderer/lib/token-stats/chart-data.ts:203`（`colorDim = metric === "sessions" ? "project" : "model"`）、250-255（Set 以 project 为键）
- 问题：
    1. 聚合按 (hour, model) 分组后 `COUNT(DISTINCT session_id)`，渲染层再跨 model 求和。同一会话同一小时内出现两种 model（会话中切换模型是真实场景）时，该小时被计 2 次，显示值不是「该小时去重会话数」。
    2. 注释宣称「summing across models in the same hour mirrors the records path (a session on two models counts twice)」不成立：records 路径（`prepareBarData`）sessions 指标按 **project** 分桶（`colorDim="project"`），同项目内两条不同 model 的 message 计入同一个 Set，只计 1 次；只有跨项目才会重计。故「comparable to the pre-t173 chart」对 sessions 指标不成立，且 7d 与 24h 两个窗口对同一小时数据会显示不同会话数。
    3. 附带：该路径下 sessions 系列由 project 改为 model（与 spec 范围声明的 (hour × model) 聚合形态一致，属 spec 内决策，不单独出 finding），但与原 records 路径的 series 语义不同。
- 建议：
    - 若 AC3 取严格口径（per-hour 跨 model 去重），聚合需额外提供每小时的跨 model 去重会话数（或按 session_id 重算），渲染层不能仅靠逐 model distinct 求和——这是 spec 契约调整，需与用户确认后改 spec 与 SQL。
    - 若维持 (hour, model) distinct 口径（与 t164 day 路径语义一致），则修正 `chart-data.ts:377-380` 注释，明确「records 路径按 project 去重、本路径按 model 去重，两者在会话跨 model 时不一致」，避免误导；并在 spec 上下文区补充说明。

### t173_code_f002 - 宽窗口无条件拉取 hour 聚合，默认 day 粒度视图下该查询不被消费

- 严重度：minor
- 锚点：无 AC 违反（性能/浪费，非正确性）；默认视图（30d + day 粒度 + 全平台）每次 load 与 silent refresh 都会执行一次从不被渲染层消费的聚合查询。
- 位置：`src/renderer/views/TokenStatsView.tsx:229-236`（`hour_fetch` 仅按 `is_short_window` 分流，未按 `gran`/`xaxis` 门控）；消费侧门控在 `src/renderer/components/token-stats/BarChart.tsx:101`（须 `gran === "hour"` 才用）。
- 问题：对任意宽窗口（>=7d/30d），无论用户处于 day 粒度还是 project/session x 轴，都发起 `getHourBuckets`。默认预设即 30d，默认粒度 day——即默认主视图每次加载都白跑一次 hour 聚合。且在「全平台」无 env 过滤时该查询无法命中 `idx_records_env_ts`（索引以 env 为首列），退化为对整表（可达 40 万行）的窗口全扫，放大了 spec 风险节已列出的性能顾虑。
- 建议：将 `hour_fetch` 门控为 `!is_short_window && effectiveXaxis === "time" && gran === "hour"`（或至少 `gran === "hour"`），非 hour 图场景直接 `Promise.resolve([])`，与 `records_fetch`/`bucket_filter` 的按需构造保持一致。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件过大（已达 minor 阈值且本 task 净增，按降级规则只列不评）：`src/renderer/lib/token-stats/chart-data.ts` 772 行（+49）；`src/renderer/views/TokenStatsView.tsx` 692 行（+18）；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 844 行（+97）；`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 691 行（+105）。前两文件接近 800 important 阈值，后续 task 再堆需拆分。
    - 范围外观察：
        - 非 UTC+8 主机上 hour 桶错位（SQL 按 +8 聚合、`bucketize` 按主机时区）：属 spec 上下文区「有意不测」已批准决策，不出 finding；仅提示在非 UTC+8 主机上该 hour 图数据桶与轴标签会错位一格，且这是相对旧 records 路径（按主机时区分桶）的语义变化。
        - 全平台（无 env 过滤）时 hour 聚合走全表扫描：spec 风险节已列明，`query_heatmap`/`query_records` 同构，非 t173 新增问题。
    - 复杂度：新函数 `prepareBarDataFromHourBuckets` / `cells_to_bar_data` 分支少，未达阈值；`bucketize`/`prepareBarData` 为既有代码，本 task 未增分支。
    - 验证情况：实现与 spike s005 结论一致（hour 起点 `timestamp - ((timestamp + 28800000) % 3600000)`、桶对齐、偏首桶 `idx(ts<=start)→0`）；store/chart-data/ipc/view 相关单测通过（chart-data 33、store 38、ipc 9、view 11）。
- 总体判断：AC1/AC2/AC4 有实现与测试支撑，AC3 在 sessions 跨 model 边界上存在口径歧义（f001）；仅 minor，无未解决 critical/important，判定 PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-07-31 23:45 UTC+8)

### t173_code_f003 - hour_fetch 门控未覆盖非 time x 轴，小时粒度 + 项目/会话轴仍白跑聚合

- 严重度：minor
- 锚点：无 AC 违反（性能浪费，与 f002 同类）；f002 建议的完整门控 `!is_short_window && effectiveXaxis === "time" && gran === "hour"` 只实现了 `gran === "hour"` 一维。
- 位置：`src/renderer/views/TokenStatsView.tsx:232-240`（hour_fetch 门控）；消费侧 `src/renderer/components/token-stats/BarChart.tsx:96-98`（须 `xaxis === "time" && gran === "hour"` 才用 hourBuckets）。
- 问题：宽窗口（7d/30d）+ 先前选了小时粒度，再切到「项目」/「会话」x 轴后，gran 值仍为 "hour"（gran 控件在非 time x 轴下隐藏但状态保留）。此状态下每次 loadData（含 collector 自动刷新）仍发起 `getHourBuckets` 宽窗聚合，结果写入 state 却从不被 BarChart 消费；全平台无 env 过滤时该查询对整表做窗口聚合（f002 同款性能顾虑）。与 f002 修复前的差别是：默认 30d+day 视图已不再触发，残留态需用户手动先选小时粒度再切 x 轴才可达。
- 建议：门控补 time-x 轴维度（loadData 内联 `(metric === "sessions" ? "time" : xaxis) === "time"`，或把 effectiveXaxis 提入 deps），与 f002 建议对齐；若判定该窄态可忽略，可在处置表标「遗留」。

## 结论（Round 2）

- 前轮 finding 复核（以 diff 与代码为准，不采信处置表自称）：
    - `t173_code_f001`（minor）：已修。`chart-data.ts:389-392` 注释改为准确表述——hour 桶按 (hour, model) distinct、跨 model 求和与 day 桶路径一致，并明确 24h records 路径按 project 去重、两窗口在会话跨 model 时口径不同；`spec.md`「sessions 口径」节已补入上下文区。不再存在「summing mirrors the records path」的误导断言。
    - `t173_code_f002`（minor）：主场景已修。`TokenStatsView.tsx:232-240` 门控 `is_short_window || gran !== "hour"` 短路空数组，默认 30d+day 视图不再拉 hour 聚合；`loadData` 依赖数组补 `gran`（`:295`），切换粒度会正确触发重载。残留窄态（gran=hour + 非 time x 轴）仍白跑聚合，已升为本轮新 finding f003（minor）。另核 `xaxis` 不在 loadData deps 是既有行为（t173 前亦如此），不构成新问题。
    - 新改动增量审阅：越界桶守卫（`chart-data.ts:372-388`）——`first_hour`/`last_hour` 取 window 起止点的本地整点小时，SQL 过滤（`timestamp >= @start AND <= @end`）保证 hour_start 必落在 `[floor(start), floor(end)]`，故守卫只丢弃不可能来自 SQL 的窗口外桶、不会丢合法数据；偏首/偏尾小时桶经 `idx(ts<=start)→0`、`idx(ts>=end)→n-1` 正确映射，与 spike s005 结论一致。`cells_to_bar_data` 抽取为 verbatim 平移（原 day 桶路径色板 `colorForTopModel`、topGroups、series 构造逐行一致），无行为分叉。
- 本轮新发现：1 条（f003，minor）
- 未进表的提示：
    - 文件过大（已达 minor 阈值且本 task 净增，按降级规则只列不评）：`src/renderer/lib/token-stats/chart-data.ts` 785 行（round 2 净增守卫 +14）；`src/renderer/views/TokenStatsView.tsx` 696 行；`tests/unit/main/core/token-stats/token-stats-store.test.ts` 849 行；`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 718 行。chart-data.ts 已逼近 800 important 阈值，后续 task 再堆需拆分。
    - 复杂度：`prepareBarDataFromHourBuckets` 分支 ~5，未达阈值；`cells_to_bar_data` 为表驱动转发，排除。
    - 范围外观察：无新增。非 UTC+8 主机 hour 桶错位仍属「有意不测」已批准决策。
- 验证情况：本任务直接相关的 8 个测试文件全绿（chart-data 34、store 38、view 13、web/ipc/server/manager/popup/settings 153），`pnpm typecheck` 无错。渲染层铺桶、越界桶守卫、view 接线（7d+小时调 getHourBuckets、24h/day 不调）均有断言。
- 总体判断：前轮 2 条 minor 均已处置（f001 彻底、f002 主场景），越界桶守卫正确且有测试锁定；本轮仅新增 1 条 minor（f003 残留窄态性能浪费），无未解决 critical / important，判定 PASS。
- 系统性 follow-up：无

verdict: PASS
