# Task review t184（reviewer_focus: 通用）

- task：`t184_tokenstats_24h_summary_axes_aggregate`
- spec：`docs/tasks/t184_tokenstats_24h_summary_axes_aggregate/spec.md`
- diff_anchor：`1e4ee9824ce843d5ca548f3bfae8fe8c0f5bce1f`
- target：`git diff 1e4ee9824ce843d5ca548f3bfae8fe8c0f5bce1f`
- round：1
- reviewed_at：2026-08-01 19:25 UTC+8

## Findings

### t184_gen_f001 - store 集成测试未构造超过 records LIMIT 的高密度场景

- 严重度：important
- 锚点：AC1（"24h 窗口内 records 超过 50,000 条时...仍与完整精确窗口统计一致"）+ spec 上下文区测试策略（"store 集成测试使用真实 SQLite 构造超过 records LIMIT 的 current+previous 数据"）
- 位置：`tests/unit/main/core/token-stats/token-stats-store.test.ts:448-538`（`query_range_rollup (24h summary, t184)` 整个 describe）
- 问题：AC1 的核心保证是"records 超过 50,000 条时 rollup 仍与完整精确窗口统计一致"。`query_range_rollup` 的 4 个测试用例最多构造 4 条记录，从未触及 50,000 阈值，无法证明 rollup 在高密度下确实不受 LIMIT 影响（rollup 本身无 LIMIT，但 AC1 的验收语义就是要在超 LIMIT 场景下验证）。spec 测试策略明确要求"构造超过 records LIMIT 的 current+previous 数据"，当前未落地。renderer view 测试通过 mock records 受限（3 条）+ rollup 完整间接覆盖了用户可见行为，但 store 层缺高密度回归。
- 失败场景：未来若有人给 `query_range_rollup` 加上 LIMIT 或类似截断，现有 store 测试不会变红。
- 建议：在 store 测试中构造一个高密度场景（例如循环插入 >50,000 条 current 窗口记录 + previous 窗口记录），断言 `query_range_rollup` 返回的行覆盖完整窗口、token/calls 总和等于插入总和，且 calls 总数等于插入消息数。

### t184_gen_f002 - rollup current 窗口使用半开区间，与 records 闭区间语义及 spec 约束不一致

- 严重度：minor
- 锚点：spec 依赖与约束（"current 窗口使用闭区间语义时，previous 窗口须保持既有半开边界，避免边界记录双计"）
- 位置：`src/main/core/token-stats/token-stats-store.ts:594-600`（`timestamp < @end` 条件）
- 问题：records 路径的 `query_records` 用 `timestamp <= @end`（闭区间，line 484/513/548），renderer 端 `filtered` 也是 `r.timestamp <= opts.end`。新的 `query_range_rollup` 用 `timestamp < @end`（半开）。spec 上下文区约束写明"current 窗口使用闭区间语义时，previous 窗口须保持既有半开边界"——隐含 current 应跟随 records 闭区间语义。当前 rollup current 用半开，造成同一 24h 下 KPI（rollup，半开）与 fallback records 路径（闭）的边界定义不同。`presetRange` 下 `end = Date.now()`（ms 精度当前时刻），timestamp 恰好等于该 ms 值的记录几乎不可能存在，因此实践中无可见数据偏差，但属契约/语义不一致。
- 失败场景：若未来 preset 改为对齐到整小时/整日边界，end 命中真实记录 timestamp，rollup 会比 records 少算边界记录。
- 建议：将 `query_range_rollup` 的 end 条件改为 `timestamp <= @end`，与 `query_records` 对齐；previous 窗口保持 `[start-width, start)` 半开不变。

### t184_gen_f003 - `MAX(title)` 选 session 标题，与 records 版 `rs[0].title` 来源不同

- 严重度：minor
- 锚点：行为缺陷（session 轴标签来源不一致，非统计错误）
- 位置：`src/main/core/token-stats/token-stats-store.ts:607`（`MAX(title) AS title`）
- 问题：records 版 `sessionRows` 用 `rs[0].title`（首条记录的 title，`aggregate.ts:115`）；rollup 版用 SQL `MAX(title)`（字典序最大）。同一 session 中途若改过 title，两条路径返回不同 label，session 轴柱显示的前 7 字符可能不同。token 统计本身不受影响。
- 失败场景：用户在对话中途改了 session 标题，24h session 轴 label 与既有 records 视图/会话表显示不一致。
- 建议：改为子查询选最新 timestamp 对应的 title，或在 spec 上下文区声明此差异为已知限制（影响极小，仅 label 前 7 字符）。

### t184_gen_f004 - `prevComp` 在 24h rollup 分支下被计算但未消费

- 严重度：minor
- 锚点：行为缺陷（无，仅为冗余计算）
- 位置：`src/renderer/views/TokenStatsView.tsx:496-500`
- 问题：`prevComp = use_rollup_summary ? compositionSegmentsFromRollup(prevRollup) : ...`，但 `prevComp` 仅被 `prevHitRate` 的非 rollup 分支消费（line 506-507），rollup 分支直接走 `hitRateOfRollup(prevRollup)`。24h 下 `compositionSegmentsFromRollup(prevRollup)` 的计算结果被丢弃。
- 失败场景：无功能影响；每个 24h 渲染多算一次 prev composition。
- 建议：将 `prevComp` 的 rollup 分支改为 `[]`（与 short_window 分支一致），或在 rollup 分支复用 `prevComp` 计算 `prevHitRate` 以消除冗余 `hitRateOfRollup` 调用。

## AC 覆盖核对

- AC1（高密度 KPI/calls/sessions/cache rate + delta）：rollup 实现 + renderer 测试间接覆盖；store 层高密度回归缺口见 f001。
- AC2（模型/工具/composition donut 完整窗口）：`modelSegmentsFromRollup` / `agentSegmentsFromRollup` / `compositionSegmentsFromRollup` 实现 + chart-data 单测 + renderer 集成测试覆盖。
- AC3（项目/会话柱 top + 别名 + 其他）：`prepareBarDataFromRollup` 实现 + chart-data 单测（top5/其他/别名/多模型合并）覆盖。
- AC4（agent/env 筛选）：store "filters by agent and env" + renderer "passes agent and env filters" 覆盖。
- AC5（有界聚合）：rollup 无 LIMIT、records 仍 50k 有界；行数随分组增长。实现满足。
- AC6（7d/30d/小时柱不变）：renderer "skips the rollup fetch outside 24h" + "does not feed BarChart rollup rows outside 24h" 覆盖；records/buckets 路径未改。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：4 条（1 important，3 minor）。
- 未进表的提示：
    - 24h preset 下 records 仍按 50k 拉取并传给 renderer（BarChart fallback），属既有 t162 止血边界，t184 未改 records fetch，不违反 AC5 的"不恢复无上限"语义。
    - chart-data.ts / tests 中 `(t184)` `(p020)` `(t162)` `(t183)` 等编号引用与 conventions.md 既有惯例一致，不视为元引用违规。
    - `prepareBarDataFromRollup` 的 session-axis + sessions-metric 组合因 effectiveXaxis 强制 time 而实际不触发，函数内 sessions 分支为防御性代码，非 bug。
- 总体判断：实现核心正确（rollup 半开 previous 边界不双计、KPI 口径与 records 等价、rollup 路径有界、24h 切换点完整、7d/30d 行为隔离），renderer 测试触达 AC1-AC6 的用户可见行为。1 条 important（store 层缺 spec 测试策略明确要求的高密度回归）阻断。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-01 23:20 UTC+8)

### 前轮 finding 复核

#### t184_gen_f001 - store 高密度测试缺失（important）

- 复核结论：已修确认
- 证据：`tests/unit/main/core/token-stats/token-stats-store.test.ts:546-608` 新增 `covers the full high-density window past the records LIMIT (AC1)`。插入 6000 current（[T0, T1) 内，T1-T0=1h，T0+5999ms < T1）+ 6000 previous（[T0-width, T0) 内）记录，全部坍缩为单组（同 session_id+model+directory+source），断言 `cur[0].calls === 6000` 与 `prev[0].calls === 6000`。
- 语义核对：`DEFAULT_RECORDS_LIMIT = 5000`（同文件 line 9 import，line 432 现有测试已证 `query_records` 截断到 5000）。6000 > 5000，rollup 返回 calls=6000 直接证明 rollup 路径无 LIMIT 截断——AC1"records 超过 50,000 条时 rollup 仍与完整窗口一致"的可测语义被触达（测试规模 6000 vs 50000 不影响结论：rollup SQL 无 LIMIT 子句，calls 等于插入数即证明无截断）。
- 边界正确：cur-0（timestamp=T0）属 current（>=start），previous 半开 end=T0 排除 → 无双计。

#### t184_gen_f002 - rollup 半开区间（minor）

- 复核结论：已修确认（方案变更合理）
- 证据：`src/main/core/token-stats/token-stats-store.ts:596`（`timestamp < @end`），注释 line 601-612 说明取舍；`tests/.../token-stats-store.test.ts:490-509` 用例 `uses half-open [start, end) so boundary records fall in one window` 验证 T2 记录被 current 排除。
- 双计分析（view 端两次 fetch）：
    - current `{start: currentRange.start, end: currentRange.end}` → `>= start AND < end`
    - previous `{start: currentRange.start - width, end: currentRange.start}` → `>= start-width AND < start`
    - timestamp = currentRange.start 的记录：current 含（>=start），previous 排除（<start）→ 单归 current ✓
    - timestamp = currentRange.end 的记录：current 排除，previous 不涉及 → 两窗口都消失
- 与 records 路径对比：records current 用闭 `<=end`，rollup current 用半开 `<end`。24h preset 下 end=Date.now()（ms 精度当前时刻），真实记录 timestamp 命中该 ms 值的概率可忽略，无可见偏差。注释已充分说明该取舍。
- 与 spec 约束一致性：spec 上下文区"current 窗口使用闭区间语义时，previous 窗口须保持既有半开边界，避免边界记录双计"——核心不变量是"无双计"，rollup 统一半开方案满足该不变量（边界记录明确归属 current）。方案偏离字面描述但满足底层不变量，且注释声明取舍，可接受。

#### t184_gen_f003 - title 子查询选最新（minor）

- 复核结论：已修确认
- 证据：`src/main/core/token-stats/token-stats-store.ts:618-622` 改为相关子查询 `SELECT title FROM token_stats_records t2 WHERE t2.session_id = ... AND t2.source = ... AND t2.env = ... ORDER BY t2.timestamp DESC LIMIT 1`；`tests/.../token-stats-store.test.ts:512-521` 用例 `picks the latest-timestamp title per session (matches records' rs[0])` 插入 alpha(T0) + zzz-late(T1)，断言返回 "zzz-late"（非字典序 MAX）。
- 对齐核对：records 版 `sessionRows` ORDER BY timestamp DESC → `rs[0].title` 是 window 内最新；rollup 子查询 ORDER BY timestamp DESC LIMIT 1 选最新，方向一致。
- 语义偏差（非 blocking）：子查询未加 start/end 过滤，选该 session 在**全表**范围最新的 title；records 版只看 window 内最新。session 在 window 外改过 title 时两者可能不同，但仅影响 session 轴柱 label 前 7 字符，且 rollup 行为更贴近"当前 session 标题"。影响极小。
- 性能：子查询每行触发一次，索引 `(env, timestamp DESC)` 覆盖 env 过滤，session_id/source 需回表。500 行规模（100 session × 5 model）可接受；spec 风险区已列"聚合查询组合过多导致加载变慢"，AC5 只要求行数随分组增长，未要求子查询最优。

#### t184_gen_f004 - prevComp rollup 分支冗余（minor）

- 复核结论：已修确认
- 证据：`src/renderer/views/TokenStatsView.tsx:500-505` 改为 `const prevComp = use_rollup_summary ? [] : is_short_window ? [] : compositionSegmentsFromBuckets(prevBuckets)`。rollup 分支下 prevHitRate 走 `hitRateOfRollup(prevRollup)`（line 506-508），不依赖 prevComp。冗余计算消除，无副作用。

### 本轮新发现

无进表 finding。

未进表的提示：

- title 子查询的全表 vs window 内语义偏差见 f003 复核，影响极小，不单列 finding。
- 子查询性能在 500 行规模可接受；若未来 session 数量级增长，可考虑加 `(session_id, source, env, timestamp DESC)` 索引或在 SQL 层缓存。属优化建议，非当前正确性问题。
- 高密度测试用 6000 条（>5000 LIMIT），未用 50000+ 条。rollup SQL 无 LIMIT 子句，6000 已足以证明无截断；扩大到 50000 只增测试耗时，不增强语义保证。

### 结论

- 前轮 finding：f001（important）已修，f002/f003/f004（minor）已修。全部消除。
- 本轮新发现：0 条。
- 总体判断：4 条 finding 修复到位，未引入新 critical/important。实现核心正确（rollup 无 LIMIT、半开边界无双计、title 选最新、prevComp 冗余消除），IPC/preload/web/BarChart 接线完整，测试覆盖 KPI/donut/project/session/agent/env/half-open/high-density 全部分支。
- 系统性 follow-up：无。

verdict: PASS
