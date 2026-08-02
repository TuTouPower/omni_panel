# Task review t189（reviewer_focus: 通用）

- task：`t189_tokenstats_switch_perf_baseline`
- spec：`docs/tasks/t189_tokenstats_switch_perf_baseline/spec.md`
- diff_anchor：`f2f372a77e51c4df02e8029e0b3db1f45ab5b9d9`
- target：`git diff f2f372a77e51c4df02e8029e0b3db1f45ab5b9d9`
- round：1
- reviewed_at：2026-08-02 15:33 UTC+8

## Findings

### t189_gen_f001 - 合成数据未覆盖 buckets/session 查询路径

- 严重度：important
- 锚点：违反 AC1、AC2；基线报告要求覆盖代理面板加载组合，并记录各数据查询和 renderer 阶段规模。
- 位置：`scripts/token-stats-baseline.ts:115-117`、`scripts/token-stats-baseline.ts:176-185`
- 问题：`load_synthetic_records` 只调用 `store.upsert_records`，只写入 `token_stats_records`；`query_buckets` 读取 `token_stats_buckets`，`query_sessions` 读取 `token_stats_sessions`，本次实现没有向这两张表写入数据。运行默认 600,000 条数据时，`buckets` 与 `sessions` 查询在所有场景都返回空数组（`row_count=0`、`serialized_bytes=2`），随后 `prepareBarDataFromBuckets` 和 `sessionRowsFromSessions` 也只处理空输入。实际报告因此没有测到日图 buckets、会话列表及其 payload/renderer 成本，不能作为完整代理面板加载基线。
- 建议：为固定种子数据同时生成并写入与真实面板一致的 daily/session 聚合（或通过对应 store upsert API 构造），并在报告或测试中验证这些查询路径有实际返回数据；若刻意不测，应从范围和报告中移除这些查询并明确声明。

### t189_gen_f002 - 基线测试只验证非负值，无法证明组合和查询真实命中

- 严重度：important
- 锚点：违反 AC5；测试策略要求验证组合覆盖完整、报告统计字段有效，并真实触达 store 查询与 renderer 转换。
- 位置：`tests/unit/main/core/token-stats/token_stats_baseline.test.ts:22-40`
- 问题：测试以 `run_baseline(120)` 运行，固定时间分布下实测 24h 和 7d 场景的各查询均为零行；断言只检查 `scenario.query.length >= 5`、耗时/行数/字节数 `>= 0`，没有断言精确的 36 个 range×agent×platform 组合、必需查询名称，也没有要求查询或 renderer 输入包含数据。因此删除某个查询、破坏筛选、让所有查询返回空数组，测试仍可通过。当前测试实际通过，但不能证明 AC1/AC2/AC5 所需的完整路径和统计有效性。
- 建议：断言完整的 Cartesian 组合和每个场景的精确查询集合（24h 额外包含 rollup），用覆盖每个时间范围、agent、platform 的固定 fixture 验证非空结果与合理行数；对统计字段断言具体 schema/单位，而非只断言非负。

## 结论

- 前轮 finding 复核：Round 1，无前轮 finding。
- 本轮新发现：2 条。
- 未进表的提示：无。
- 总体判断：基线虽能生成报告并通过现有单测，但 buckets/session 数据路径为空，且测试未验证真实查询结果与完整组合，当前报告不具备 AC 要求的完整性能基线可信度。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-02 15:40 UTC+8)

### 前轮 finding 复核

- `t189_gen_f001`：已消除。`load_synthetic_records` 现在从固定记录派生 `TokenStatsSessionUpsert` 与 `TokenStatsDailyUpsert`，并调用 `store.upsert_sessions`；600,000 条实际运行中 `buckets` 返回 36 行、`sessions` 返回 500 行，renderer 也收到非空输入。
- `t189_gen_f002`：部分消除。测试已改为精确查询名称、要求每个查询返回非空结果，并验证三种 range、四种 agent 值、三种 platform 值；但仍未验证 36 个 `(range, agent, platform)` 元组的笛卡尔积唯一且完整。

### t189_gen_f003 - 测试未严格验证 36 个筛选组合

- 严重度：important
- 锚点：违反 AC5；测试策略要求组合覆盖完整。
- 位置：`tests/unit/main/core/token-stats/token_stats_baseline.test.ts:26-35`
- 问题：测试只断言场景总数为 36，并分别断言 range、agent、platform 的取值集合。该组合断言允许重复元组替代缺失元组，例如某一 `(range, agent, platform)` 重复一次、另一元组缺失时，三个 Set 和总数仍全部通过；因此不能证明 36 个筛选组合完整覆盖。当前实现的嵌套循环确实生成 36 个组合，但测试没有守住该契约。
- 建议：将每个场景序列化为 `range|agent|platform`，断言 `new Set(keys).size === 36`，并与明确构造的 36 元组集合做 `toEqual`；同时保留当前查询名称和非空结果断言。

## 结论

- 前轮 finding 复核：`t189_gen_f001` 已消除；`t189_gen_f002` 的非空路径部分已消除，但组合完整性缺口仍存在，追加 `t189_gen_f003`。
- 本轮新发现：1 条。
- 未进表的提示：600,000 条实跑确认派生 `buckets` / `sessions` 查询和 renderer 输入均非空；Round 2 单测 3 tests passed。
- 总体判断：派生数据和查询命中问题已修复，但 AC5 的 36 组合测试仍不严格，当前仍有未解决 important finding。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-02 15:54 UTC+8)

### 前轮 finding 复核

- `t189_gen_f001`：已消除。当前 diff 中 `load_synthetic_records` 继续派生并写入 sessions/daily 数据；600,000 条黑盒报告的 `buckets`、`sessions`、各 records/heatmap/hour_buckets/rollup 查询均返回非空结果，renderer 输出也为非空。
- `t189_gen_f002`：已消除。测试保留精确查询集合、非空查询结果和报告统计字段断言；不再只依赖非负值。
- `t189_gen_f003`：已消除。`tests/unit/main/core/token-stats/token_stats_baseline.test.ts:26-40` 将每个场景序列化为 `(range, agent, platform)` key，断言场景总数为 36、`new Set(scenario_keys).size` 为 36，并断言该 Set 与独立构造的 3×4×3 完整组合 Set 相等。重复组合不能替代缺失组合，唯一性与完整性均被严格验证。

### 本轮新发现

无。

### 未进表的提示

无。

### 结论

- 前轮 blocker 均已由当前 diff 和代码/测试证据消除。
- 目标单测：1 file、3 tests passed。
- 600,000 条黑盒报告：`synthetic_record_count=600000`、36 个场景、range/agent/platform 集合完整、36 个组合 key 唯一、所有查询结果非空，包含各查询与 renderer/total 阶段统计。
- 当前未发现 critical / important finding。

verdict: PASS
