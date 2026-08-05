# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

展开多账号 provider（如 8 个 tavily 实例）的任一账号看 sparkline，每天显示的数据点是该 provider 下**随机一个**账号最后采集的值，而非当前展开账号——当前账号的真实采集被丢弃。

DB 实测（tavily:tavily:tavily:total-month，近 7 天）：8 个 source_instance 各 307 行，每天 8 个实例的采集混进同一桶（如 2026-07-29 有 392 行来自 8 实例），`query_trend_series` 每桶只取最新一条 → 留下的是 8 个账号里最后一个被采集的，与当前账号无关。

根因：`observation-store.query_trend_series` 的 SQL `WHERE provider=? AND account_id=? AND metric_id=? AND observed_at>=?` **不含 source_instance_id 维度**（d014 强调的查询键只列了 provider/account_id/metric_id）。而 tavily 等 12 个 provider 的 connector 给所有账号写同一个 account_id（见 t057 评估），账号真实身份压在 source_instance_id 维度。t057 判定「source_instance_id 区分足够」只对 `insert`/`get_latest`（含 instance）成立，对 `query_trend_series`（不含 instance）不成立——t057 漏验 sparkline 路径。

前端 `ProviderUsagePeriod` 已承载 `sourceInstanceId`，但 `trend:getBulk` 请求（TrendBulkRequest）与 store 查询都没传它。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `query_trend_series` SQL 与签名加 `source_instance_id` 维度：`WHERE provider=? AND account_id=? AND metric_id=? AND source_instance_id=? AND observed_at>=?`，按桶取最新时只在同一实例内取。
- `trend:getBulk` / `trend:get` / web `/v1/trend` 三条路径透传 source_instance_id（请求体或 query param）。
- 前端 `ProviderAccountRow` bulk 请求传 `period.sourceInstanceId`（或顶层 source_instance_id，见上下文区未决项）。

### 非范围

- 不改 connector 的 account_id 写法（t057 的 hash 方案）；本 task 用 source_instance_id 维度区分，不动 account_id。
- 不改 observation-store 其他查询（insert/get*latest/list_latest*\* 已含 instance）。
- 不改 sparkline 渲染、不改取点粒度（t208 范围）。
- 不改 metric_id 查询键契约（t207 已修）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 同 provider、同 account_id、同 metric_id 但不同 source_instance_id 的两个 observation，`query_trend_series` 各自只返回本实例的点，互不串入。
- [ ] 展开 8 个 tavily 实例中的任一个，sparkline 显示的是该实例的采集序列（而非 8 个实例混合后取随机最新）。
- [ ] `trend:getBulk` / `trend:get` / web `/v1/trend` 三条路径的请求都携带 source_instance_id 且后端按其过滤。
- [ ] 集成测试：真实 observation-store 写入同 (provider,account_id,metric_id) 下两个 source_instance 的 observation，分别查询断言各自序列只含本实例数据。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC2：sparkline 显示哪条实例数据可由前端测试断言（bulk payload 携带正确 sourceInstanceId、mock 响应按实例区分）；真实多账号采集依赖运行期，集成测试用真实 store + 双实例 insert 模拟。
- 其余 AC：全部可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- `query_trend_series` 加 source_instance_id 过滤用真实 observation-store（temp db）验证，写入双实例 observation，分别查询断言隔离。
- 前端测试：bulk payload 携带 sourceInstanceId、响应按实例映射回各自缓存；缓存键已含 instance（cache_key = provider||accountId||period.id，period.id 含 sourceInstanceId，天然区分，执行期确认）。
- t057 遗留的 firecrawl 双实例测试（provider-usage.test:956）是列表层，不覆盖 sparkline；本 task 补 sparkline 层隔离测试。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 单个 account card 下的 periods 是否恒属同一 source_instance（即 bulk 请求用顶层单一 source_instance_id 是否安全，还是需 per-period 传）：UNVERIFIED-SPIKE，执行期核实 account 聚合规则（build_account_key = sourceInstanceId|accountId，应恒单 instance，但需验），若否则改 per-period 传。

### 风险与回退

- 风险：source_instance_id 是宿主盖（host-authority），历史数据中可能存在实例重建导致 instance_id 变化（旧 instance 数据查不到）。这是数据连续性问题，非本 task 引入，但加维度后更明显。
- 风险：三条 trend 路径（IPC get/getBulk、local-api /v1/trend、web）须同步加 source_instance_id，遗漏一处会退化为旧串接行为。
- 回退：SQL 去掉 source_instance_id 过滤、请求去字段，回到 t207 后状态（串接）。存量数据未动。

### 依赖与约束

- 无新增外部依赖。
- 受影响：`src/main/core/observation/observation-store.ts`（query_trend_series 签名+SQL+idx_trend 覆盖性，见下）、`src/main/ipc/trend-ipc.ts`、`src/main/core/local-api/server.ts`、`src/web/usageboard-web.ts`、`src/shared/types/ipc.ts`（TrendBulkRequest/单发 加 source_instance_id）、`src/renderer/components/ProviderAccountRow.tsx`（传 instance）、`src/preload/index.ts`（签名）。
- 索引覆盖：`idx_trend(provider, account_id, metric_id, observed_at)` 不含 source_instance_id，加维度后范围扫描会多一次 filter；是否需扩 idx_trend 加 source_instance_id 列，执行期按 EXPLAIN QUERY PLAN 判定。

### Finalization 时更新的 blueprint

- `docs/specs/observation-store.md`：`query_trend_series` 条目补 source_instance_id 参数与「同一 provider/account_id/metric_id/source_instance_id 内取最新」；订正 t057 结论适用边界（列表层成立、sparkline 层不成立）。
- `docs/findings.md`：追加 dNNN 记录「sparkline 查询需 source_instance_id 维度；t057 结论的适用边界」。
