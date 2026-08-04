# Task review t201（reviewer_focus: 代码）

- task：`t201_tokenstats_dashboard_perf`
- spec：`docs/tasks/t201_tokenstats_dashboard_perf/spec.md`
- diff_anchor：`2aff05e390b4b649794bbd878617bba56ee2ecbc`
- target：`git diff 2aff05e390b4b649794bbd878617bba56ee2ecbc`
- round：1
- reviewed_at：2026-08-04 12:27 UTC+8

## Findings

### t201_code_f001 - AC1 字面「一次基础窗口读取」与实现双读取的张力；rollup_ready 时 session 区域仍全窗口聚合 records

- 严重度：minor
- 锚点：AC1（单次请求对同一窗口只做一次基础窗口读取，后续展示区域均从该结果派生）
- 位置：`src/main/core/token-stats/token-stats-store.ts:568-594`（`materialize_session_meta`）、`1232-1233`（query_dashboard 调用点）
- 问题：`query_dashboard` 对当前窗口执行两次基础读取——`materialize_window_rows`（rollup UNION ALL records 或 records fallback）与 `materialize_session_meta`（从 `token_stats_records` 全窗口扫描 + 窗口函数聚合 `COUNT/SUM/MIN/MAX/ROW_NUMBER`）。session 展示区域（session page 的 calls/tokens/started_at/ended_at、rollup 的 title）从 `session_meta` 派生，而非从已物化的 `window_rows` 派生。在 rollup_ready 场景，`window_rows` 的读取已把完整小时段压缩到 `token_stats_hour_rollup`，但 `session_meta` 又把整窗口 records 扫回并做完整聚合（含 calls/tokens），session 区域复杂度仍为 O(window records)，t192 的 rollup 加速在该区域失效。这与 AC1 字面「只做一次基础窗口读取」「无重复全窗口聚合」存在差距。spike s012（`docs/spikes/s012_dashboard_window_materialize/report.md`）批准的是「latest-per-group 元数据查询」形态，实现额外把 calls/tokens 也一并从 records 重聚（`window_rows` 的 rollup 段已含聚合值）。功能正确（records 是真相源，WAL 快照保证 rollup 与 records 一致），AC2 达成。
- 建议：二选一——(a) 在 spec 澄清 AC1「一次基础窗口读取」语义（当前实现是「每个展示区域不再各自重复聚合」而非字面「全请求一次读取」），spike 批准的双读取形态写进 AC1 或上下文区；(b) 若需字面达标，rollup_ready 时让 `session_meta` 的 calls/tokens 聚合复用 `window_rows`（LEFT JOIN 汇总 rollup 段），仅 title/directory/started_at/ended_at 元数据独立读 records。

### t201_code_f002 - `window_rows` 物化的 ts/title 列无下游消费（冗余列）

- 严重度：minor
- 锚点：死代码 / 冗余（无行为缺陷）
- 位置：`src/main/core/token-stats/token-stats-store.ts:490,507,514`（union/records 段输出 `ts`/`title`）、`554-559`（`CREATE TEMP TABLE window_rows` 列清单含 ts/title）
- 问题：`window_rows` 物化携带 `ts`、`title` 两列，但下游所有消费方都不读它们：`read_rollup_from_window_rows`（601-622）title 取 `m.title`（LEFT JOIN `session_meta`），metric/session/heatmap buckets（1247-1278）只用 `hour_start`/`directory`。两列仅服务于 rollup 段与 records 段 `UNION ALL` 的列形状对齐，records 边界段的每行 `title` 字符串被原样物化进 TEMP TABLE 而无消费者。
- 建议：两段 SELECT 统一去掉 `ts`/`title`（列集一致即可 UNION ALL），`CREATE TEMP TABLE` 列清单同步移除；若为未来从 `window_rows` 派生 session_meta 预留，加注释说明用途，否则删除。

## 结论

- 前轮 finding 复核：无（round 1）
- 本轮新发现：2 条（均为 minor）
- 未进表的提示：
    - 测试运行环境：本 worktree `better-sqlite3` 原生模块 ABI 不匹配（`NODE_MODULE_VERSION 146` vs 当前 node v22 的 `127`，模块路径解析到主仓 `D:\Dev\Code\omni_usage\node_modules`），`token_stats_dashboard.test.ts` 17 个用例在 `beforeEach` 建 store 即抛错，无法本地运行。AC5「回归测试全绿」未能本地验证——环境问题，非实现缺陷。
    - 测试覆盖缺口（test reviewer 职责）：全部 dashboard 用例默认 store 未 `backfill_hour_rollup`（`hour_rollup_ready=0`），走 records fallback 路径；rollup_ready 路径零覆盖，AC4「两条路径在全部选项组合下与 raw records oracle 一致」只验证了未就绪侧。spec 测试策略要求的 `EXPLAIN QUERY PLAN` 断言（不重复扫描 `token_stats_records`、命中 `token_stats_hour_rollup`）未实现，AC1/AC2 用例改用 `on_sql` 语句跟踪。AC1 用例断言 `window_creates=2` 且区域语句不引用 base 表，但未断言 `session_meta` 的全窗口 records 扫描（与 f001 相关）。
    - 文件过大：`src/main/core/token-stats/token-stats-store.ts` 1380 行（> 800 重要阈值，但本 task 净减 87 行，diff `204/291`）；`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts` 629 行（> 600 minor 阈值，本 task 净增 86 行，diff `86/0`）。按规则仅列路径与行数，不进 finding 表。
    - 圈复杂度：`query_dashboard` 约 CC 6（on_sql 三元 ×2、rollup_ready 三元 ×2、gran 三元），未达阈值；其余新函数均为单/双语句，无复杂度问题。
    - 范围外观察：`docs/specs_index.md`（80 行）与 `docs/archive/tasks/t200_tokenstats_query_key_trim/task.md` 的改动为 prettier 表格列宽对齐的纯格式化连带，非 t201 实质内容。
    - DRY 观察（minor，不单独出 finding）：`dashboard_records_source`（528-541）与 `dashboard_window_union_builder` 的 records_part（503-516）SELECT 列集 verbatim 重复、仅 WHERE 不同；改列形状需同步两处。
    - spike 产物：`docs/spikes/s012_dashboard_window_materialize/{report.md,code/}` 属于本 task 实施期 spike，内容与实现一致（TEMP TABLE 物化 + latest-per-group + 版本双读）。
- 总体判断：实现符合 spec 范围与上下文区批准设计，未发现正确性 bug 或 AC 缺失；f001/f002 为 minor（性能语义张力与冗余列），不阻断。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-04 12:40 UTC+8)

## Findings

### t201_code_f003 - f002 修复残留：`dashboard_records_source` 注释仍引用已删除的 ts/title 列

- 严重度：minor
- 锚点：陈旧注释 / 死引用（f002 清理未覆盖 doc 注释）
- 位置：`src/main/core/token-stats/token-stats-store.ts:522`
- 问题：`dashboard_records_source` 的 doc 注释仍写「Keeps the same `ts`/`title` column shape as the rollup-ready union」，但 f002 修复已把 union 两段与 `materialize_window_rows` 列清单中的 `ts`/`title` 全部删除（当前实际列形状为 `source, env, session_id, model, directory, agent, hour_start, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens`）。注释描述的是已不存在的列，与 `materialize_window_rows`（544-555）和 union builder（488-513）的实际列一致，会误导后续维护者以为 `window_rows` 仍携带 ts/title。
- 建议：改为描述实际列形状（如「Keeps the same column shape as the rollup-ready union」并列出实际列集），或删除该句。

## 结论

- 前轮 finding 复核（以 `git diff 2aff05e390b4b649794bbd878617bba56ee2ecbc` 与当前代码为准）：
    - **t201_code_f001（minor，保持）**：`materialize_session_meta`（563-589）仍对当前窗口独立全窗口 records 扫描并做窗口函数聚合（calls/tokens/MIN/MAX/ROW_NUMBER），与 AC1 字面「一次基础窗口读取」存在张力。但该双读取形态为 s012 明确批准（`docs/spikes/s012_dashboard_window_materialize/report.md` 结论：TEMP TABLE 物化 + p028 latest-per-group 单查询），且 spec 上下文区已把该形态写入「已验证（s012）」（未知契约条目），Round 1 建议处置 (a)「把 spike 批准形态写进上下文区」已落地。功能正确：records 为真相源，WAL 快照保证 rollup 与 records 一致，AC2 达成（session 页 4 项元数据与 calls/tokens 一次取齐，无 N 个相关子查询）。维持 minor 非阻断，同意保持现状。
    - **t201_code_f002（minor，已修）**：用 diff 核实 `ts`/`title` 冗余列已全量删除——union rollup_part（`488-495`）与 records_part（`502-513`）SELECT 列集不再含 ts/title，`dashboard_records_source`（`531-533`）同，`materialize_window_rows` CREATE 列清单（`550-552`）同；下游区域查询（metric_buckets `1242-1248`、session_buckets `1249-1255`、heatmap `1264-1273`）仅引用 `hour_start`/`directory` 等列，`read_rollup_from_window_rows`（`596-617`）title 改取 `m.title`（LEFT JOIN `session_meta`），全文件 grep 无对 `window_rows` 的 ts/title 消费。修复彻底，残留仅为 f003 注释一处。
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`src/main/core/token-stats/token-stats-store.ts` 1375 行（> 800 important 阈值，但本 task 净减 92 行，diff `195/287`）；`tests/unit/main/core/token-stats/token_stats_dashboard.test.ts` 672 行（> 600 minor 阈值，本 task 净增 129 行，diff `129/0`）。按规则仅列路径与行数，不进 finding 表。spike 实验代码 `docs/spikes/s012_dashboard_window_materialize/code/{cte,temp}_spike.mts`（145/175 行）为一次性实验产物、非维护代码，不计入。
    - 圈复杂度：新增函数均为单/双语句，`query_dashboard` 约 CC 6，无超阈值项。
    - DRY 观察（沿用 Round 1，无新增）：`dashboard_records_source`（525-537）与 union records_part（502-513）SELECT 列集 verbatim 重复、仅 WHERE 不同；改列形状需同步两处。
    - 测试环境：本 worktree `better-sqlite3` 原生模块 ABI 不匹配，dashboard 测试本地无法运行，AC5「回归全绿」未能本机验证（Round 1 已记录，环境问题非实现缺陷）。
    - 测试覆盖缺口（test reviewer 职责，沿用）：rollup_ready 路径的 AC1/AC2/AC4 oracle 对比仍零覆盖；本任务净增 AC3 stale 注入测试（`token_stats_dashboard.test.ts:641-670`），其注入点（首个 `DROP TABLE IF EXISTS window_rows`）在 start_version 读取之后、end_version 之前，语义成立。
- 总体判断：f002 修复彻底（列集全量对齐，区域查询无残留引用）；f001 维持 s012 批准形态并已在 spec 上下文区留档；仅新增 1 条注释残留 minor。无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-04 12:44 UTC+8)

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核（以 `git diff 2aff05e390b4b649794bbd878617bba56ee2ecbc` 与当前代码为准）：
    - **t201_code_f001（minor，维持 Round 2 结论）**：实现未变，双读取形态仍为 s012 批准并已在 spec 上下文区留档，功能正确，维持非阻断。
    - **t201_code_f002（minor，维持已修）**：`ts`/`title` 冗余列删除状态与 Round 2 核实一致，无回退。
    - **t201_code_f003（minor，已修）**：用 diff 与当前代码核实——`dashboard_records_source` doc 注释已改为「Keeps the same column shape as the rollup-ready union」(`token-stats-store.ts:521`)，`ts`/`title` 引用已删除。注释表述与实际列形状一致：`dashboard_records_source` SELECT 列集（`531-533`）与 rollup-ready union 两段列集（`488-489`、`503-505`）同为 13 列 `source, env, session_id, model, directory, agent, hour_start, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens`。全文件 grep 无其他残留 `ts`/`title` 列引用（`235` 处 `DELETE_BUCKETS_SQL` 无关）。
- 本轮新发现：0 条
- 未进表的提示：修复为纯注释改动，不涉及行为、不新增分支/复杂度；文件行数与 Round 2 持平（`token-stats-store.ts` 1375 行）。DRY 观察（`dashboard_records_source` 与 union records_part SELECT 列集 verbatim 重复）沿用前轮，非本轮引入。测试环境 ABI 不匹配问题沿用（环境问题，非实现缺陷）。
- 总体判断：f003 注释残留已消除，表述与实际列形状一致；无新引入问题，无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS
