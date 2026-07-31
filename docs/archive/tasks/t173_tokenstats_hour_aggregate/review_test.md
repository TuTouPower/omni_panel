# Task review t173（reviewer_focus: 测试）

- task：`t173_tokenstats_hour_aggregate`
- spec：`docs/tasks/t173_tokenstats_hour_aggregate/spec.md`
- diff_anchor：`b39c6f105c2840b87aaacf4f246a07d6ba249e3d`
- target：`git diff b39c6f105c2840b87aaacf4f246a07d6ba249e3d`
- round：1
- reviewed_at：2026-07-31 23:25 UTC+8

## Findings

### t173_test_f001 - 渲染层数据源切换接线（view 取数 + BarChart 选源）无测试触达

- 严重度：important
- 锚点：AC1、AC2 的渲染进程侧行为
- 位置：`src/renderer/views/TokenStatsView.tsx:229-231`、`src/renderer/components/token-stats/BarChart.tsx:101-102`；测试侧 `tests/unit/renderer/views/token_stats_view.test.tsx:19-36`（BarChart mock 的 props 类型不含 `hourBuckets`）
- 问题：t173 的核心交付是「>=7d + 小时粒度时柱状图改走 hour 聚合」。但测试只覆盖了两端：store SQL（无截断、聚合值）与纯函数 `prepareBarDataFromHourBuckets`（铺桶、zero-fill）。连接两端的生产接线——TokenStatsView 在非 short window 调用 `getHourBuckets`（`TokenStatsView.tsx:229-231`）与 BarChart 在 `xaxis==="time" && gran==="hour" && hourBuckets.length>0` 时改走聚合（`BarChart.tsx:101-102`）——没有任何测试触达：
    - `token_stats_view.test.tsx` 无用例验证「7d/30d 窗口 + 小时粒度」会调用 `getHourBuckets`，也无用例验证「24h（short window）」不调用；
    - 该文件 BarChart mock 的 props 类型（`{ gran, records, buckets }`）未声明 `hourBuckets`，即使想断言转发也无法编译；
    - `tests/unit/renderer/components/token-stats/` 下无 BarChart 组件测试，`BarChart.tsx:101` 的选择分支无人验证。
      失败场景：若接线回归（例如 `hour_fetch` 守卫写反、`hourBuckets` prop 未转发、选择条件写错），柱状图会静默回退到被 LIMIT 截断的 records 路径，AC1「窗口内每天每小时都有数据」在真实界面重新失效，而全部测试仍绿。同文件已有 day 粒度接线的回归测试（`token_stats_view.test.tsx:362` 「feeds BarChart full multi-day buckets」），t173 缺少与之平行的 hour 粒度用例。
- 建议：在 `token_stats_view.test.tsx` 增加回归用例（仿 day 路径先例）：7d preset + 小时粒度时断言 `getHourBuckets` 被调用、BarChart 收到 `hourBuckets` 且非空；24h 时断言 `getHourBuckets` 未被调用。需先把 BarChart mock 的 props 类型补上 `hourBuckets?: TokenStatsHourBucket[]` 并纳入 `mocked_bar_chart.props` 捕获。

### t173_test_f002 - AC2 行数断言缺失（测试策略列项未落地）

- 严重度：minor
- 锚点：AC2「聚合返回行数 ≈ 窗口内 hour×model 组合数，不随明细总量增长」；上下文区测试策略明确列出「断言 `query_hour_buckets` 返回行数 = hour×model 组合数（远小于明细行数）」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:753-771`（「no LIMIT truncation」）、`773-816`（「aggregates tokens/calls/sessions per hour×model」）
- 问题：两个用例分别断言了「hour 存在」与「聚合值正确」，但没有一条断言行数。4 条明细（3 个不同 hour，其中 1 个 hour 含 2 个 model）实际应返回 4 行，未断言；策略要求的「行数 = hour×model 组合数、远小于明细行数」未落地。聚合值断言间接验证了分组去重（同 hour×model 2 条记录合并为 1 行），故不阻断。
- 建议：在「aggregates tokens/calls/sessions per hour×model」用例补一条 `expect(rows.length)`，断言等于预期的 hour×model 组合数。

### t173_test_f003 - AC3 跨小时同 session 去重未直接断言

- 严重度：minor
- 锚点：AC3「sessions 按 per-hour 去重会话数（同一会话跨小时不重复计入各小时）」；策略「造跨多天、多小时、同 session 跨小时的 records」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:753-771`
- 问题：策略要求的「同 session 跨小时」场景在 fixture 层面满足（4 条记录默认 session_id 均为 `s1`，跨 3 个不同小时），但该用例只断言 hour 存在，未断言各小时 `sessions` 值。per-hour distinct 语义仅由「同 hour 内 s1×2 → sessions=1」用例（`:793`）覆盖；跨小时每个 hour 各计 1 的断言缺失。GROUP BY hour_start, model 结构性保证该行为，故不阻断。
- 建议：在跨小时用例中断言每个 hour 行的 `sessions === 1`。

### t173_test_f004 - web/local-api hourBuckets 路径无测试

- 严重度：minor
- 锚点：AC4（web 模式下的过滤生效）与平行先例（`getHeatmap` / `/v1/heatmap` 均有测试）
- 位置：`src/web/usageboard-web.ts`（getHourBuckets）、`src/main/core/local-api/server.ts`（`/v1/hourBuckets`）；无对应测试
- 问题：实现新增了 web 桥 `getHourBuckets` 与本地 HTTP 端点 `/v1/hourBuckets`，但 `tests/unit/web/usageboard-web.test.ts` 与 `tests/integration/local-api/server.test.ts` 均无对应用例。平行路径 `getHeatmap`/`/v1/heatmap` 在两者中都有测试（过滤参数转发、无过滤器省略 query string）。web 模式下若 `getHourBuckets` 过滤参数未转发，AC4 在 web 界面失效且无测试发现。实现逐字镜像已验证的 heatmap 路径，风险低，不阻断。
- 建议：仿 `usageboard-web.test.ts:22` 与 `server.test.ts:250` 各补一条 hourBuckets 用例。

### t173_test_f005 - prepareBarDataFromHourBuckets 越界桶丢弃分支无测试

- 严重度：minor
- 锚点：边缘分支覆盖（非 AC 主路径）
- 位置：`src/renderer/lib/token-stats/chart-data.ts:374`（`if (ci < 0 || ci >= n) continue;`）
- 问题：`prepareBarDataFromHourBuckets` 的越界桶丢弃分支（桶起点早于窗口首个整点小时、或晚于窗口末端）无任何用例。现有 `chart-data.test.ts` 三个用例的输入桶全部落在窗口内。若该分支被误删（越界桶未被过滤而溢出 labels 数组），无测试会失败。
- 建议：补一条含窗口外桶的用例，断言其值不进任何 bucket。

### t173_test_f006 - model series 值归属未逐 model 断言

- 严重度：minor
- 锚点：AC3「tokens / calls / sessions 值正确」的呈现层
- 位置：`tests/unit/renderer/lib/token-stats/chart-data.test.ts`（hour bucket describe 三个用例）
- 问题：三个用例均按「跨 series 逐桶汇总」断言 `totals[i]`，只断言 `seriesNames` 含目标 model，未断言具体 model 的 series 取值。若实现把某 model 的值写进另一个 model 的 series（例如 `cell[b.model]` 键写错、model 别名误映射），逐桶汇总仍然正确，测试不会失败。AC3 以用户可见的每 model series 呈现为行为，故值得补强，但不阻断（汇总断言仍能拦截大部分错误）。
- 建议：至少在一个用例中断言某 model 的 `series.data` 具体值。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（首轮）
- 改测方向复核：无。diff 中所有测试改动均为新增（store/chart-data/IPC/view 用例与 mock 接线），未就地修改任何既有测试的预期，「迁就实现」式改测不存在。
- 本轮新发现：6 条（f001 important，f002-f006 minor）
- 未进表的提示：
    - BarChart 的空聚合守卫（`BarChart.tsx:101` `hourBuckets.length > 0`）意味着聚合异常返回空数组时图表静默回退 records 截断路径，该守卫本身无测试锁定——属 f001 的延伸观察，未单列。
    - `TokenStatsView.tsx:229-231` 对所有非 short window 无条件拉取 `getHourBuckets`（即使 day 粒度或非时间 x 轴也用不上），存在不必要全表聚合；属代码层性能观察，交 code reviewer。
    - 本次审阅中一次 4 文件合并运行 `token-stats-store.test.ts` 38 例全部失败（`afterEach` 中 `store` undefined，beforeEach 建库抛错）；单文件与后续多轮重跑均绿，疑似本机首次并发加载 better-sqlite3 的瞬时环境抖动，未归因 t173，未出 finding。
- 总体判断：store 聚合与渲染纯函数两端测试可信且覆盖到位，危险模式扫描未命中；但 t173 的核心——渲染层数据源切换接线——无任何测试触达，AC1/AC2 的界面侧行为未获验证，修复存在静默回退回归的风险。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-07-31 23:55 UTC+8)

复核基准：Round 1 处置表（task.md「Review 处置」Round 1）全部 status=已修。以 `git diff b39c6f105c2840b87aaacf4f246a07d6ba249e3d`（含工作区未提交修复）与测试运行为准。实测运行 6 个改动测试文件全绿：token-stats-store（38）、chart-data（34）、usageboard-web（15）、token-stats-ipc（9）、local-api/server（18）、token_stats_view（13）；另 manager + 4 个 view 测试（getHourBuckets mock 补型）120 例全绿。

## Findings

### t173_test_f007 - spec 承诺的「168 桶」整窗渲染用例未落地（零桶语义已覆盖）

- 严重度：minor
- 锚点：spec 契约区「范围」回归测试列表项「渲染层铺桶（168 桶、零桶、model series）」
- 位置：`tests/unit/renderer/lib/token-stats/chart-data.test.ts`（`describe("prepareBarDataFromHourBuckets")`，四用例窗口均为 2-4 个桶）
- 问题：上下文区测试策略与契约区范围均列「168 桶」为回归测试项，但现有四个用例的窗口（3h/2.5h/1.5h/1.5h）最多铺 4 个桶，无一驱动 7d（168 小时）整窗。零桶补全、model series、tokens/calls/sessions 值、越界丢弃均已覆盖；铺桶逻辑按 `bucketize(start,end,"hour").n` 参数化，大小无关，故语义等价、风险低。属 spec 自列测试项的实义未落地，不阻断。
- 建议：可在一用例中扩展为 7d 窗口断言 `labels.length === 168` 且全窗零桶补全（或注明该项由小窗用例等价覆盖）。

## 结论

- 前轮 finding 复核（以 diff 与测试为准，逐条核实现物，不采信处置表自述）：
    - f001（important，渲染接线）：已消除。BarChart mock props 类型补 `hourBuckets`（`token_stats_view.test.tsx:24,33`）；正向用例（`:477`）点 7 天+小时，断言 `getHourBuckets` 被调、窗口 start/end 转发（end≈now、start≤end-7d）、BarChart 收到非空 `hourBuckets`；负向用例（`:514`）先断言默认 30d/day 不调，再点「24 小时」（`handlePresetChange` 同步设 gran=hour + 短窗，`TokenStatsView.tsx:467-470`）断言仍不调——两个门控（`gran!=="hour"`、`is_short_window`）均被真实驱动，正负两侧接线均锁定。
    - f002（minor，AC2 行数）：已消除。`aggregates tokens/calls/sessions per hour×model` 用例补 `expect(rows.length).toBe(2)`（3 条明细→2 行 hour×model）。
    - f003（minor，AC3 跨小时 sessions）：已消除。跨小时用例补 `for (const row of rows) expect(row.sessions).toBe(1)`。
    - f004（minor，web/local-api hourBuckets）：已消除。web 桥用例断言 `/v1/hourBuckets` 转发 agent/env/start/end；server 用例断言 `GET /v1/hourBuckets` 返回聚合值并入 no-auth 路径清单；另补 IPC 通道未知 sender 拒绝 + 委托 `query_hour_buckets` 两用例。
    - f005（minor，越界桶）：已消除，且实现补了真实缺陷修复。实现新增 whole-hour 范围守卫（`chart-data.ts:378-386`：`hour_start < first_hour || > last_hour` 直接 continue）；用例「drops buckets outside the window」断言与守卫一致。脚本模拟验证：无守卫时 01:00 桶被 idx clamp 进桶 0（totals[0] 变 1199）、04:00 桶进桶 n-1（totals[1] 变 888），用例断言 totals[0]=200、totals[1]=0——无守卫必红、有守卫绿，测试锁定修复。守卫的偏首小时语义（start 非整点时保留整小时桶，与 SQL `timestamp>=start` 口径一致）由「lays hour buckets on the bucketize axis」用例覆盖。
    - f006（minor，逐 model series）：已消除。聚合用例补 `series.find(s=>s.name==="claude-sonnet-4")?.data[0]` 与 `opus?.data[1]` 逐 model 断言。
- 改测方向复核：无。所有测试改动均为新增；既有测试预期零修改。`prepareBarDataFromBuckets` 尾部抽取 `cells_to_bar_data`（`chart-data.ts:404-439`）为行为保持重构（逐行比对 `colorOf` 等逻辑与原实现一致），既有 day 桶用例原样通过（34 例绿），无「迁就实现」式改测。
- 本轮新发现：1 条（f007 minor）。
- 未进表的提示：
    - BarChart 内部路由分支（`xaxis==="time" && gran==="hour" && hourBuckets.length>0`，`BarChart.tsx:99`）仍无组件级测试——但该分支薄（2 行条件路由到已充分单测的纯函数），且与 t164 day 桶路由先例同构（view 测试 mock BarChart 仅断言 props 转发），不单列 finding。若后续愿更严，可补 BarChart 组件渲染级用例，建议 slug `t173_bar_chart_routing_test`。
    - 视图取数与铺桶的 start/end 同源（均 `currentRange`，`TokenStatsView.tsx:235-240,662-663`），无轴对齐分叉风险，已核。
    - sessions metric 跨 model 求和路径未被多 model 用例直接断言，但聚合代码路径与 tokens/calls 同构且被覆盖，属可选扩展，不列 finding。
- 总体判断：Round 1 六条 finding 全部真修（f001 正负接线、f002-f006 断言与修复逐项核实现物，全部与测试运行一致）；危险模式扫描仅命中一处标准 `eslint-disable-next-line @typescript-eslint/unbound-method`（`vi.mocked` 方法引用，非静默错误掩盖）；唯一新增为 minor。当前无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
