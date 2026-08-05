# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

用量面板展开任意账号，token 消耗 sparkline 恒显「近 7 天数据不足」，全账号全指标失效。根因：前端 `ProviderAccountRow` 发起 `trend:getBulk` IPC 时，把 `period.raw_label`（短标签，如 `five_hour`、`monthly`）当作 `metric_id` 传给后端；`observation-store.query_trend_series` 的 SQL `WHERE provider=? AND account_id=? AND metric_id=? AND observed_at>=?` 按 `metric_id` 列精确匹配，但该列存的是 connector 写入时构造的完整键，与 `raw_label` 不一致：

- CPA Claude: `claude:${account_id}:five_hour`，raw_label=`five_hour`
- opencode_go: `opencode_go:monthly`，raw_label=`monthly`
- grok: `grok:product:${raw_label}`
- tavily: `tavily:monthly_usage`，raw_label=`total-month`

两者从不相等，查询恒返回 0 行，7 天序列全 null，`valid_points.length < 2` 触发占位文案。回归自 commit 48512085（p022），其「observation store 以 raw_label 为 metricId 索引」的前提错误。详见 `docs/pending.md` p044。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 修正前端 trend 查询键：让 `trend:getBulk` / `trend:get` / web `/v1/trend` 三条路径传入的 `metric_id` 等于 observation-store `metric_id` 列实际存储值，使 sparkline 能取到历史数据。
- 在数据模型上暴露 connector 真实 `metric_id`，供前端作为查询键（当前 `MetricRecord` / `ProviderUsagePeriod` 仅暴露复合 `id` 与 `raw_label`，丢失了原 `metric_id`）。
- 补跨层集成测试：connector observation → store.insert → 前端实际传递的键查询 → 非空。

### 非范围

- 不改 sparkline 渲染逻辑（`TrendSparkline` / `build_trend_series`）。
- 不改 connector 产出 observation 时 `metric_id` 的命名规则。
- 不改 `observation-store` 的 SQL 与索引。
- 不调整 label-map 配置键（仍以 `raw_label` 为 key，与本次查询键分离）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 展开任一有 ≥2 天历史观测的账号，sparkline 渲染折线与数据点，不再显示「近 7 天数据不足」占位文案。
- [ ] 对 CPA Claude（`claude:${account_id}:five_hour` / `:seven_day`）与 opencode_go（`opencode_go:rolling|weekly|monthly`）两类 metric_id 形态，sparkline 均能取到数据。
- [ ] `trend:get`、`trend:getBulk`、web `/v1/trend` 三条查询路径传入的 `metric_id` 与 observation-store `metric_id` 列存储值一致（等价契约校验）。
- [ ] 跨层集成测试：用真实 observation-store 写入 connector 形态的 observation，以前端实际传递的查询键调用 `query_trend_series`，断言返回非空序列。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1：sparkline 是否渲染折线可由单元/集成测试断言（`valid_points.length >= 2` → 非 empty 占位）；真实历史观测依赖运行期采集，集成测试用 fixture 模拟。
- 其余 AC：全部可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 跨层集成测试用真实 `observation-store`（temp db），不 mock `query_trend_series`，以暴露键不匹配类回归。
- connector 形态 fixture 至少覆盖 CPA Claude（`claude:acc:key`，含 account_id 段）与 opencode_go（`provider:raw_label`，无 account_id 段）两种 `metric_id` 构造，防止只覆盖一种。
- 前端 `ProviderAccountRow` 测试断言 bulk 请求 payload 携带与 observation-store 一致的查询键，且响应非空时渲染折线（非占位文案）。
- 现有 `trend-ipc.test.ts` mock store 的用例保留（IPC 透传契约），但须补一组接真实 store 的用例或单独集成测试。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：`MetricRecord` 增加 `metric_id` 字段涉及 schema/序列化层，影响 runtime store 映射、hydrate 路径、web/electron 共享类型；须全链路同步，遗漏一处会导致键再次不一致（MEMORY: convergent functions sync——替换硬编码常量时所有兄弟函数与调用点一起改）。
- 风险：历史已落盘 observation 的 `metric_id` 值不变，本次只改查询键来源，不涉及数据迁移；若误改 connector 命名规则会令存量数据查不到。
- 回退：仅恢复 `ProviderAccountRow` 查询键来源与 schema 字段两处改动，存量 observation 数据未动，回退即恢复原状（占位文案）。

### 依赖与约束

- 无新增外部依赖。
- 受影响共享契约：`src/shared/schemas/plugin-output.ts`（usageItemSchema）、`src/main/core/scheduler/observation-mapping.ts`（映射须保留 metric_id）、`src/renderer/lib/provider-usage.ts`（ProviderUsagePeriod 须承载查询键）、`src/main/core/local-api/server.ts` 与 `src/web/usageboard-web.ts`（透传层，键语义不变）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：若确认「trend 查询键 = observation.metric_id」为长期契约，在趋势/sparkline 相关节注明权威定义，避免再次误用 raw_label。
- `docs/findings.md`：追加 dNNN 记录「observation metric_id 列与 raw_label 的区别 + 各 connector metric_id 构造规则」，供后续连接器遵循。
