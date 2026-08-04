# Task review t201（reviewer_focus: 测试）

- task：`t201_tokenstats_dashboard_perf`
- spec：`docs/tasks/t201_tokenstats_dashboard_perf/spec.md`
- diff_anchor：`2aff05e390b4b649794bbd878617bba56ee2ecbc`
- target：`git diff 2aff05e390b4b649794bbd878617bba56ee2ecbc`
- round：1
- reviewed_at：2026-08-04 12:45 UTC+8

## Findings

### t201_test_f001 - AC3 stale=true 分支完全无测试

- 严重度：important
- 锚点：AC3（契约区第二分句「存在较新已提交版本时返回的旧响应 `stale=true`」）
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:612-628`（AC3 测试）；缺失断言处：生产 `src/main/core/token-stats/token-stats-store.ts:1309`（`stale: end_version > start_version`）
- 问题：本 diff 新增的 stale 检测逻辑是本次任务的核心新行为（旧实现恒 `stale: false`），但全仓测试只断言 `stale === false`（`token_stats_dashboard.test.ts:87,626`），无任何一处断言 `stale === true`。AC3 第二分句完全无测试，且不在「有意不测」清单（仅列出「不测绝对查询耗时」），spec 可测试性声明明确「全部 AC 可自动测试」。若把 `freshness` 改回 `{ queried_at, stale: false }`（旧行为）或把比较式写反（`start_version > end_version`），当前全部测试仍全绿——stale 机制从未被正面验证。
- 可测性论证：本 diff 同步新增的 `on_sql` 观测钩子（`token-stats-store.ts:1213-1221`）在 `start_version`（行 1224）与 `end_version`（行 1288）两次读版本之间对每条区域/物化语句回调，测试可在回调内重入调用 `traced.upsert_records(...)` 使 `token_stats_data_version` 前进，再断言 `freshness.stale === true`；或用文件型 store 双连接模拟并发提交。分支可测，不应缺。
- 建议：新增一条测试：查询开始后、结束版本读取前触发版本前进（经 `on_sql` 重入 upsert 或第二连接写版本），断言 `dto.freshness.stale === true` 且 `dto.data_version` 为推进后版本。

### t201_test_f002 - AC1 语句级断言存在结构盲区，无法捕获单区域退化直读基础表

- 严重度：minor
- 锚点：AC1（语句级断言是 spec 认可验证手段，但当前断言不完整）
- 位置：`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts:568-574`
- 问题：`region_sqls` 过滤器（`s.includes(" FROM window_rows") || s.includes(" FROM session_meta")`）只收集已引用临时表的语句，再断言它们不含 `token_stats_hour_rollup|token_stats_records`。某区域退化回直读基础表时（如 heatmap 改成 `SELECT ... FROM token_stats_records WHERE ... GROUP BY weekday, hour`），该语句既不匹配过滤器、也不影响 `window_creates` 计数（仍为 2），AC1 测试照常通过。测试注释声称「Every region ... none re-touch ... base tables directly」，但该断言结构性验证不到「区域直读基础表」这种 AC1 核心违规——且除本测试外无其他测试能拦截（heatmap 直读基础表在 fallback 路径下输出相同，行为类断言不敏感）。当前实现正确，属覆盖可更严。
- 建议：改为对**全部**被追踪 SQL 断言基础表引用总数有界——fallback 路径下恰好 `2 × CREATE TEMP TABLE window_rows + 1 × CREATE TEMP TABLE session_meta` 是唯一引用 `token_stats_records` 的语句（DROP TABLE 不引用基础表），rollup 就绪路径下另有 1 条含 `token_stats_hour_rollup` 的物化源；任一区域退化直读基础表都会推高计数而失败。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用（Round 1）
- 改测方向复核：无。diff 仅新增 3 条测试（`token_stats_dashboard.test.ts:544-628`），未修改任何既有测试断言预期；无「迁就实现」改测。生产侧删除的 `read_dashboard_rollup` / `read_dashboard_session_page` 均为内部实现，覆盖经 `query_dashboard` DTO 断言保留，无覆盖丢失。
- 本轮新发现：2 条（f001 important，f002 minor）
- 未进表的提示：
    1. 本机无法实跑测试：`better-sqlite3` 原生模块按 ABI 146 编译，当前 Node v22（ABI 127）加载失败（指向主仓 `node_modules`），`token_stats_dashboard.test.ts` 17 条测试全部因 `beforeEach` 建库抛错而 RED。属环境 ABI 不匹配，非本 diff 测试缺陷；需以项目预期 Node 重建或复跑验证。
    2. `options.on_sql`（`token-stats-store.ts:1213`）是纯测试观测缝，仅 trace 不 mock，未影响生产语义，可接受。
    3. AC4 独立 oracle 链不完整：summary 层（current/previous tokens/sessions/calls）有独立 raw-records oracle（`token_stats_dashboard.test.ts:282-338`）；chart/heatmap/sessions 各区域仅靠「fallback 与 rollup 两路径互比」的既有 t192 测试（`token-stats-store.test.ts:1778-1795`，9 组选项组合）兜底，未逐一对照独立 oracle——两路径共享同一段派生代码，系统性口径错误可能两边同错。
    4. 当前实现里 `session_meta` 物化直读 `token_stats_records`（二次全窗口基础读，`token-stats-store.ts:111` 区域），与 AC1「单次基础窗口读取」字面不完全一致；但这是 spec 已批准的 AC2 机制（未知契约清单 s012 验证的 latest-per-group 单查询），非违规，AC1 测试也只统计 `window_rows` 物化次数，二者一致。
- 总体判断：AC1/AC2 语句级测试与既有 t192 回归对 AC1/AC2/AC4/AC5 覆盖充分，但 AC3 新增 stale 机制的正向分支（`stale=true`）完全无测试且非「有意不测」，存在未解决 important。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-04 12:39 UTC+8)

- task：`t201_tokenstats_dashboard_perf`
- diff_anchor：`2aff05e390b4b649794bbd878617bba56ee2ecbc`
- target：`git diff 2aff05e390b4b649794bbd878617bba56ee2ecbc`
- round：2
- reviewed_at：2026-08-04 12:39 UTC+8
- 测试可运行：`node scripts/ensure_sqlite_abi.mjs node` 后 `npx vitest run tests/unit/main/core/token-stats/` 12 文件 222 passed（含 dashboard 18、store 69）；环境备注 ABI 问题已消除，Round 1 无法实跑的限制不再适用。

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以 diff 与实跑为准，不采信处置表）：
    - **t201_test_f001（important，AC3 stale=true 无测试）——已消除。** 新增测试 `token_stats_dashboard.test.ts:641-671`「AC3: a committed data-version advance mid-query makes the response stale」。生产侧时序核实：`query_dashboard` 先读 `start_version`（`token-stats-store.ts:1219`），首条经 `on_sql` 追踪的语句正是 `materialize_window_rows` 的 `DROP TABLE IF EXISTS window_rows`（`:1227`，经 `prepare` 包装 `:1209-1213`），在 `end_version` 读（`:1283`）之前——`on_sql` 钩子内重入真实 `upsert_records` 提交批次推进 `data_version`，与生产「main 写 / worker 读、两次读版本比较」机制同构。断言 `injected === true`（防钩子未触发的空跑）、`stale === true`、`data_version === 2`（1→2 确定性推进）。灵敏度核对：比较式写反（`start_version > end_version`）或退回恒 `stale: false` 均会使 `stale=true` 断言失败；钩子未触发时版本不推进，同样失败——非恒真、非条件跳过。18 条 dashboard 测试实跑全绿。AC3 两分句（false/true）现均有正面测试，f001 锚定的「机制从未被正面验证」已闭合。
    - **t201_test_f002（minor，AC1 语句级断言结构盲区）——已消除。** `token_stats_dashboard.test.ts:570-575` 改为对全部追踪 SQL 断言：`records_refs`（含 `token_stats_records` 的语句）恰为 3 条且全部 `CREATE TEMP TABLE` 前缀，fallback 路径下无任何语句引用 `token_stats_hour_rollup`。已用独立探针（`.scratch` 临时脚本，已删）实跑 dump 全部 13 条追踪 SQL 核对：3 条 records 引用恰为 2×CREATE window_rows + 1×CREATE session_meta，无 rollup 引用，window_creates=2——计数与当前实现精确吻合。任一区域退化直读基础表会新增一条非 `CREATE TEMP TABLE` 前缀的 records 引用，`toHaveLength(3)` 与前缀循环双处失败；直读 rollup 同理被 `some(...)=false` 拦截。f002 指出的盲区（region_sqls 过滤器只收集已引用临时表的语句）已被全局计数上界闭合。
- 改测方向复核：无。相对 anchor，测试侧仅新增 4 条测试（AC1/AC2/AC3-false/AC3-stale），未修改任何既有测试断言预期；AC1 内部强化属按 f002 建议收严，非「迁就实现」。无 TDD 方向反转。
- 本轮新发现：0 条。
- 危险模式扫描：无 `.skip`/`.only`/`@ts-ignore`/注释断言/删断言/恒真断言/mock 误用/阈值掩盖。`on_sql` 为观测缝非 mock，AC3-stale 重入的是真实 `upsert_records` 写路径。
- 未进表的提示：
    1. AC3-stale 测试经同一连接重入模拟并发提交；生产真实场景为 query-worker 只读连接与 main 写连接并发。`version_b > version_a` 机制与连接身份无关，单元层已完整触达；如需端到端并发可见性验证属 t193 query-worker 范围，非本 diff 缺口。
    2. AC1 语句级断言覆盖 fallback（rollup 未就绪）路径；rollup 就绪路径依赖既有 t192 before/after-backfill 全区域等式测试（`token-stats-store.test.ts:1778-1795`）与共享区域函数兜底，与 Round 1 判断一致，不新增缺口。
    3. Round 1「未进表提示 #3」（AC4 chart/heatmap/sessions 区域仅靠两路径互比、无逐区域独立 oracle）状态不变，仍为可选覆盖扩展，非阻断。
- 总体判断：f001（important）与 f002（minor）均按建议以真实、灵敏、实跑通过的测试消除；本轮无未解决 critical/important，无新 blocker。
- 系统性 follow-up：无

verdict: PASS
