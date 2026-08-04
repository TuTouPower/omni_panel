# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

`query_dashboard`（`src/main/core/token-stats/token-stats-store.ts:1093-1443`）对同一 `[start,end)` 窗口串行执行 current/previous rollup、time chart、session count、session page、heatmap 共 5–6 次全窗口聚合，每次重建 `window_union`（p027 = t191_code_f004）；rollup 每分组与 session page 每 session 各执行多次 title/directory/started_at/ended_at 相关子查询，N 个 session 接近 2N+ 次索引 seek（p028 = t191_code_f005）；`freshness.stale` 硬编码 `false` 不反映真实数据新鲜度（p030 = t191_code_f007）；records 与 rollup 双轨实现语义等价但写法不同，任一区域修正须同步两份（p031 = t192_code_f002）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 单次 dashboard 请求对同一窗口执行一次基础读取，各展示区域（rollup、chart、session、heatmap）复用该结果，消除重复全窗口聚合。
- 消除 per-group / per-session 的重复相关子查询（title / directory / started_at / ended_at），改为有界 join 或临时表一次取齐。
- `freshness.stale` 反映真实数据新鲜度（有更新的已提交数据版本时旧响应 stale）。
- 统一 records fallback 与 rollup 读取路径，消除双轨分叉（含 GROUP BY 维度与 SUM/COUNT 口径一致）。

### 非范围

- 不改变用户可见统计口径、DTO 契约、筛选项或图表样式。
- 不新增持久化表结构（沿用现有 `token_stats_hour_rollup`）。
- 不把查询移出主进程。
- 不处理 t202 已覆盖的增量聚合测试缺口。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：单次 dashboard 请求对同一窗口只做一次基础窗口读取，后续展示区域均从该结果派生（以 SQL 执行计划或语句级断言验证无重复全窗口聚合）。
- [ ] AC2：会话页 N 个 session 的 title/directory/started_at/ended_at 不再产生每 session 独立子查询（执行计划中无 N 次相关子查询）。
- [ ] AC3：同一已提交数据版本下 `freshness.stale=false`；存在较新已提交版本时返回的旧响应 `stale=true`。
- [ ] AC4：rollup 就绪与未就绪（records fallback）两条路径在全部选项组合下产出与完整 raw records oracle 一致的结果。
- [ ] AC5：既有 dashboard 行为（分页、has_more、top-five、别名）保持正确，回归测试全绿。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（SQLite `EXPLAIN QUERY PLAN` + 语句级断言 + oracle 对比）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 不测绝对查询耗时：使用读取规模、查询计划与相对数据规模验证复杂度（沿用 t192 约定）。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- store 集成测试使用真实 SQLite，对 window_union 重构后各区域构造高密度 current/previous 窗口与跨 model/session 数据。
- 用 `EXPLAIN QUERY PLAN` 断言不重复扫描 `token_stats_records` 且命中 `token_stats_hour_rollup`。
- 用完整 raw records 聚合作为 oracle，逐区域对比 records fallback 与 rollup 路径。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 单次窗口读取派生全部区域的可行 SQL 形态（CTE vs 临时表 vs 单条大查询）：`UNVERIFIED-SPIKE`，执行期用实际 schema 与 `EXPLAIN QUERY PLAN` 实验选定，结论写入上下文区。
- 真实 stale 判定的数据来源（`data_version` 与 freshness 语义，参考 t192 AC3/AC4）：`UNVERIFIED-SPIKE`，执行期核对 store 与 renderer 现有版本字段消费后落地。

### 风险与回退

- 风险：聚合路径重构引入统计口径漂移（sessions 计数、别名合并、top/other）；stale 语义误报导致 renderer 反复刷新。
- 回退：保留旧查询实现分支，回退实现 commit 即恢复；不涉及数据迁移。

### 依赖与约束

- 依赖 p027/p028/p030（t191）与 p031（t192）登记。
- 依赖 t192 聚合层与数据版本（`data_version`）。
- 约束：records 保留为真相源；禁止通过提高 LIMIT 恢复完整统计。
- 约束：本 task 的 dashboard 展示维度契约由 t200 另行处理，不在此扩展展示维度。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：dashboard 查询单次读取与 freshness 语义。
- `docs/specs/ai-cli-token-stats-api.md`：dashboard 查询的读取规模与 stale 语义。
