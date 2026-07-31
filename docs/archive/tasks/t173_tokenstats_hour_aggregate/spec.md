# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p014。

代理面板「最近七天」+「小时」粒度柱状图缺最早几天数据（实测 7d 窗口 140,481 行明细，`query_records` 倒序 `LIMIT 100000` 截断，7/26 15:40Z 之前全丢）。`token_stats_records` 是 per-message 明细表（每天约 2 万行，7d 约 14 万行）。t162/t164 已让 day 柱状图走 `token_stats_buckets` 聚合，t170 已让热力图走 `query_heatmap` 查询时聚合（均无截断）；hour 柱状图是唯一仍拉明细的宽窗口路径，且拉 10 万级明细进渲染进程造成性能浪费。根因与实测见 p014、`.scratch/t173/probe*.mjs`。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 后端：`token_stats_records` 上新增查询时 hour 聚合 `query_hour_buckets`（仿 t170 `query_heatmap`，无 LIMIT 截断），按本地整点小时（UTC+8，与热力图同口径）× model 分组，返回 `{ hour_epoch, model, tokens, calls, sessions }`；sessions 为 per-hour distinct session 数。
- 跨层接线：`token_stats_hour` IPC + preload `tokenStats.getHourBuckets`。
- 渲染层：宽窗口（`!is_short_window`，即 >=7d/30d）+ 时间 x 轴 + 小时粒度时，柱状图改走 hour 聚合（新增 `prepareBarDataFromHourBuckets` 铺桶，含零值桶补全）；不再为 hour 图拉 `getRecords` 明细。
- 回归测试：store 聚合（无截断、窗口完整、sessions distinct）、渲染层铺桶（168 桶、零桶、model series）。

### 非范围

- 不改 24h（short window）路径——其 hour 图继续用 records（窗口小、无截断问题）。
- 不改 day 粒度路径（已走 buckets）。
- 不改 project / session x 轴（非时间轴，仍用 records 明细）。
- 不改 collector 采集、不改 `token_stats_records` 明细表结构、不新增持久化聚合表。
- 不动 KPI/donut/热力图/会话表（均已走聚合或无此问题）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：>=7d 窗口 + 小时粒度柱状图，窗口内每天每小时都有数据（含最早日期），不再因 `query_records` LIMIT 截断丢早期数据。
- [ ] AC2：该 hour 图的数据源改为聚合，渲染进程不再为 hour 图接收窗口内全部明细记录（聚合返回行数 ≈ 窗口内 hour×model 组合数，7d 约数百行，不随明细总量增长）。
- [ ] AC3：tokens / calls / sessions 三种 metric 在 hour 图上值正确；sessions 按 per-hour 去重会话数（同一会话跨小时不重复计入各小时）。
- [ ] AC4：全部工具 / 单 agent 过滤与全平台 / Win / WSL 过滤在 hour 图上生效，且与切换筛选前的总量语义一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 非 UTC+8 时区主机上的小时桶对齐：项目时间统一 UTC+8（A17 决策，热力图已按 `+8 hours` 聚合），跨时区行为不覆盖。

### sessions 口径

`query_hour_buckets` 按 (hour, model) 分组 `COUNT(DISTINCT session_id)`，渲染层跨 model 求和——与 t164 day 桶路径语义一致。同会话同小时内切换 model 时，该小时会话数计 2 次；而 24h 短窗口仍走 records，按 project 去重（同项目跨 model 计 1 次），两窗口在会话跨 model 时口径不同。此为聚合路径与 records 路径的固有差异，非 t173 回归，不属 AC3「同一会话跨小时不重复计入各小时」范围。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- AC1/AC3：store 集成测试（真实 better-sqlite3），`upsert_records` 造跨多天、多小时、同 session 跨小时的 records，`query_hour_buckets` 断言：窗口最早日期有数据、无截断、hour 桶对齐本地整点、sessions 为 distinct。
- AC2：断言 `query_hour_buckets` 返回行数 = hour×model 组合数（远小于明细行数）。
- AC4：store 聚合带 agent/env 过滤的用例。
- 渲染层：`chart-data.test.ts` 新增 `prepareBarDataFromHourBuckets` 用例——零桶补全、model series、tokens/calls/sessions 值、越界桶丢弃。铺桶窗口用小小时数（2-4 桶）参数化覆盖，语义等价于 7d 的 168 整点小时（`bucketize` 的 hour 轴逻辑与窗口大小无关）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- hour 桶时区/起点语义已核实：聚合按 UTC+8 本地整点小时分组（`timestamp - ((timestamp + 28800000) % 3600000)` 给出本地整点小时起点的 UTC 毫秒），7d 窗口聚合 428 行/141 小时，首个小时 7/24 14:00Z（最早日期不丢）；内部小时与渲染层 `bucketize` 桶起点全部对齐，含 start 的偏首小时桶经 `idx(ts<=start)→0` 正确映射。验证方式：s005 探针对真实 DB 比对聚合 hour_start_epoch 与 bucketize 桶起点，结论记录于 `docs/spikes/s005_tokenstats_hour_agg/report.md`。

### 风险与回退

- 风险：hour 聚合与渲染层桶边界错位导致数据偏一格；聚合 SQL 在 40 万行 records 上无索引全扫导致查询变慢。
- 回退：改动集中在 hour 柱状图数据源与一个 store 查询，revert 实现 commit 即恢复 records 路径；聚合查询复用 `idx_records_env_ts` 的 (env, timestamp) 索引，仅 agent 过滤时按行过滤。

### 依赖与约束

- 依赖 t170 `query_heatmap` 的查询时聚合先例与 `+8 hours` 时区口径。
- hour 桶 epoch 用本地整点小时的 UTC 毫秒（与渲染层 `bucketize` hour 桶一致）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：token-stats 数据流一节补充 hour 柱状图走查询时聚合（无 LIMIT 截断），与 day buckets / heatmap 并列。
- `docs/specs/ai-cli-token-stats-ui.md`：柱状图数据源描述补 hour 聚合路径。
