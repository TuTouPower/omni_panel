# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

p045（t214 审阅）：t214 给 `query_trend_series` SQL 加 source_instance_id 后，SQLite planner 改用 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)` 全覆盖（WHERE 等值列 + observed_at 范围，无需 filter）。`idx_trend(provider, account_id, metric_id, observed_at)` 对该查询不再被选用。已核实（本 task 创建期读 `observation-store.ts`）：`query_trend_series` 唯一查询路径是含 source_instance_id 的，`server.ts:495` / `trend-ipc.ts:32,51` 全部传 source_instance_id；无其他依赖 idx_trend 列序的不含 source_instance_id 等价查询。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `src/main/core/observation/observation-store.ts`：删除 `idx_trend` 索引（CREATE INDEX 语句 + 迁移逻辑若含它）；同步更新接口 docstring 中「idx_trend 保留」表述。
- 相关测试：索引删除后 trend 查询仍走 idx_lookup、行为不变。

### 非范围

- `idx_lookup` 与 `idx_records_*` 索引（保留）。
- 其它查询路径（observation 之外的索引不动）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 新库创建不再包含 `idx_trend` 索引；已存在该索引的旧库被迁移时移除（或明确文档化不迁移、保留无害）。
- [ ] `query_trend_series` 查询结果与删除前一致（sparkline 数据无变化）。
- [ ] 现有依赖 idx_trend 的查询（若有）无回归——已核实无，但以全量测试为准。
- [ ] `observation-store.ts` 接口 docstring 不再声称「idx_trend 保留供等价查询」。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（集成测试查 PRAGMA index_list + trend 查询结果）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 集成测试：建库后 `PRAGMA index_list(observations)` 不含 idx_trend；`query_trend_series` 返回与删除前一致的序列（可先跑基线再删索引对比）。
- 回归：`tests/integration/observation/observation-store.test.ts` 全量。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：删索引后若有未被 grep 到的等价查询路径退化全表扫描。
- 回退：重新加回 `CREATE INDEX IF NOT EXISTS idx_trend`；执行期先全仓 grep 确认无其他依赖。

### 依赖与约束

- 依赖 t214（source_instance_id 查询路径）。
- schema 变更属 `observation-store` 迁移域；执行期须核对 `migrate_observation_schema` 是否需加 DROP。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：无可累积（索引细节）；如涉及 schema 变更写 observation-store spec。
