# Task review t192（reviewer_focus: 测试）

- task：`t192_tokenstats_incremental_rollup_version`
- spec：`docs/tasks/t192_tokenstats_incremental_rollup_version/spec.md`
- diff_anchor：`96cbf53211a5c61821dd608364dc7f2528c6211d`
- target：`git diff 96cbf53211a5c61821dd608364dc7f2528c6211d`
- round：1
- reviewed_at：2026-08-03 16:15 UTC+8

## 审查范围与方法

- 已核对 spec 契约区 AC1-AC6 与上下文区（有意不测、测试策略）。
- 已运行并全绿：`token-stats-store.test.ts`（66 tests）、`token_stats_view.test.tsx`（12）、`token-stats-ipc.test.ts`（14）、`manager.test.ts`（12）、`token_stats_dashboard.test.ts`（6）。
- 危险模式扫描：无恒真断言、无删/反转/注释 expect、无 `.skip`/`.only`、无新增 `@ts-ignore`（`eslint-disable no-non-null-assertion` 为基线上既有），mock 均限系统边界（IPC/preload、mock store），store 测试用真实 SQLite 文件 DB + 跨连接读聚合表 + 独立 records 聚合 oracle。
- 改测方向复核：既有断言仅迁移测试 `user_version` 期望 5→6（v4/v2 两处）。v6 迁移为新增，期望升到最新版本是断言新行为（v6 缺失则失败），非迁就实现。结论：无「让断言迁就当前实现」的改测。

## AC 覆盖对照

| AC                                                                 | 覆盖测试                                                                                                                                                              | 判定                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| AC1 新建/既有 DB 生成完整聚合，重复初始化不重复不丢失              | 迁移 v6 建表并 stays unready；增量 rollup 构建；backfill 幂等（两次 backfill 行数不变）                                                                               | 已覆盖（重启后 ready=1 的持久化场景缺专门测试，见 f006）                  |
| AC2 增改替 session 后受影响桶与全量 records 重算一致，未受影响不变 | 单 session 替换无双计、directory 分裂、NULL directory 归组；backfill 后增量 upsert 与独立 oracle 逐行 `toEqual`；9 组 dashboard 查询 records 路径 vs 聚合路径前后相等 | 已覆盖（多 session 增量「未受影响行不变」无直测，见 f001）                |
| AC3 每批只推进一次版本；失败/回滚不推进；DTO 与更新事件同一版本    | 空批次不推进；recount 批次 +1；DTO `data_version` 与 `get_data_version()` 一致                                                                                        | 已覆盖（失败/回滚批次无测试，见 f002；事件版本转发粘合层无测试，见 f004） |
| AC4 版本落后进 stale 刷新、相同复用；竞态不覆盖                    | 相同版本事件不重发请求；更新版本事件触发 revalidate                                                                                                                   | 已覆盖（竞态子句无专门测试，见 f003）                                     |
| AC5 同分组下 records 增十倍响应行数与读取规模不线性增长            | 100x 密度：rollup 表行数恒为 group 数、DTO `bucket_starts`/`sessions.total` 与低密度相等、high=low\*100 密度自检                                                      | 已覆盖（读取规模无直接行数/查询计划断言，见 f005）                        |
| AC6 聚合损坏可安全重建且前后一致                                   | 表外 `UPDATE input_tokens=999999` 后 backfill，current/previous/chart/heatmap/sessions 前后 `toEqual`                                                                 | 已覆盖                                                                    |

## Findings

### t192_test_f001 - AC2「未受影响聚合保持不变」无多 session 增量直测，delete 谓词回归可漏过

- 严重度：minor
- 锚点：AC2（未受影响聚合保持不变子句）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:1119`（incremental describe 块整体）
- 问题：现有增量测试全部单 session（1178 replace 无双计、1196 directory 分裂、1208 NULL directory），dashboard fallback 对比测试（1427 起）在 `upsert_records` 之后立即 `backfill_hour_rollup()`，增量期状态被 backfill 覆盖。若 `delete_hour_rollup_session_stmt`（生产 `src/main/core/token-stats/token-stats-store.ts:113`）丢失 session_id 谓词导致清空其它 session 行、rebuild 只回填被触碰 session，上述测试全部仍绿：单 session 场景 delete 全表与按 session delete 结果相同，多 session 场景被 backfill 掩盖。
- 建议：补「两 session 入库 → 增量 upsert 仅触碰其一 → 不 backfill 直接 `read_rollup == oracle_rollup`」用例，断言未触碰 session 行字节不变。

### t192_test_f002 - AC3 失败/回滚批次不推进版本无测试（测试策略已列「失败回滚」）

- 严重度：minor
- 锚点：AC3（失败或回滚的批次不推进版本子句）；上下文区测试策略「使用真实 SQLite 事务覆盖…失败回滚和重建」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:1119`（incremental describe 块）
- 问题：版本递增（`bump_data_version_stmt`，生产 847 行）与 records 写入、rollup 重建同处一事务，抛错理应整体回滚；但 diff 无任何失败注入用例。现仅测空批次不推进（1172）。非法 record（如 timestamp 类型错误）触发 `upsert_record_stmt.run` 抛错后，版本与 records 行数是否回滚无证据。
- 建议：构造类型非法 record 调 `upsert_records`，断言抛错且 `get_data_version()` 与 `query_records` 行数均不变。

### t192_test_f003 - AC4 竞态子句（更新事件 vs 进行中查询）无专门测试

- 严重度：minor
- 锚点：AC4（更新事件与正在进行的查询竞态不会让旧版本覆盖新版本子句）
- 位置：`tests/unit/renderer/views/token_stats_view.test.tsx:277-307`（两 AC4 用例）
- 问题：两用例只验证「同版本复用 / 更新版本 revalidate」。事件触发 `loadData` 后旧查询晚到被 `request_id` guard 丢弃的竞态只在既有「older response resolves later」用例（390 行）中由 filter 变更驱动，未在「事件触发」路径验证；事件触发 `loadData(true)` 与 filter 变更同走 request_id 机制，但无直接证据。
- 建议：补「查询 in-flight 时触发更新版本事件 → 旧响应晚到不覆盖新数据」用例（用 deferred promise + 事件双触发）。

### t192_test_f004 - AC3「更新事件报告同一已提交版本」的 main→preload 转发粘合层无测试

- 严重度：minor
- 锚点：AC3（dashboard 响应与更新事件报告同一已提交版本子句）
- 位置：`src/main/index.ts`（on_update 发送 `get_data_version()`）、`src/preload/index.ts`（onUpdated 解析 number）；renderer 测试手动注入版本号 `updated_listener?.(5)`（token_stats_view.test.tsx:287）
- 问题：store 侧已证 DTO 版本 == `get_data_version()`（token-stats-store.test.ts:1646），renderer 侧已证视图按事件版本比较；但主进程事件携带的版本是否确实来自 `get_data_version()`、preload 是否原样转发无测试（无 preload 测试文件）。版本在 main→preload 转发中丢失/错位不会被任何用例捕获。
- 建议：在 ipc/preload 层补 onUpdated 事件版本转发用例。

### t192_test_f005 - AC5 读取规模无直接测量，聚合路径误读全量 records 也能 PASS

- 严重度：minor
- 锚点：AC5（主要查询读取规模不随 records 数量线性增长子句）；上下文区测试策略「比较读取行数、查询计划和响应规模」
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:1385-1419`（AC5 describe）
- 问题：断言 DTO `bucket_starts.length`/`sessions.total` 与 rollup 表行数在 100x 密度下平坦。若聚合路径（`window_union`，生产 1229 起）因 bug 改为整窗读 records，输出 DTO 与 rollup 表行数仍与低密度一致（分组与窗口相同），用例照常 PASS；「读取行数 / 查询计划」未直接断言。窗口恰为整点（08:00–11:00），records 边界段为空，正是可加 EXPLAIN QUERY PLAN 的干净场景。
- 建议：对窗口内主查询断言 `EXPLAIN QUERY PLAN` 命中 `token_stats_hour_rollup` 且不 SCAN `token_stats_records`，或断言聚合路径读取行数 == rollup 行数。

### t192_test_f006 - AC1 重启场景（ready=1 持久化 + 重启后续写）无专门测试

- 严重度：minor
- 锚点：AC1（重启或重复初始化后结果不重复、不丢失子句）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:1249-1275`（幂等 backfill 用例）
- 问题：幂等测试只覆盖同进程两次 backfill。ready 标志（`token_stats_meta.hour_rollup_ready`）跨 reopen 是否持久化、重启后 ready=1 时增量续写是否保持与 oracle 一致，无用例；迁移 v6 用例只验证重启前未就绪（stays unready）路径。
- 建议：补「backfill 置 ready → close → reopen → 断言 `is_hour_rollup_ready()` 仍 true、再增量 upsert 后 `read_rollup == oracle_rollup`」。

## 结论

- 前轮 finding 复核（Round 1）：无
- 改测方向复核：无「迁就实现」的改测；v4/v2 迁移测试 `user_version` 期望 5→6 为新迁移下的正确行为断言（缺 v6 则失败），非弱化。
- 本轮新发现：6 条（均 minor）
- 未进表的提示：
    - `data_version` 非法值（负数/非整数）未入 DTO schema reject 用例；zod `.int().nonnegative()` 已被 `data_version: 3` 正常路径间接约束，属可选扩展。
    - AC5 用例 `toMatchObject` 未断言 cache_read/cache_write 列，精确全列比对已由 backfill 用例 `read_rollup == oracle_rollup` 覆盖。
    - 测试内 `hs()` 与生产公式同源（UTC+8 小时对齐），+8 偏移本身由既有 t173 用例用显式北京时间钉住，偏移回归不会漏。
- 总体判断：AC1-AC6 均有对应测试且触达真实生产逻辑（真实 SQLite、独立 records 聚合 oracle、跨连接读聚合表、破坏重建）；危险模式扫描无命中；6 条均为子句级覆盖扩展建议，无未解决 critical/important。
- 系统性 follow-up：无

verdict: PASS
