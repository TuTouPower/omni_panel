# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p016（t174_code_f001 / t174_test_f001）+ p017（t174_test_f002）。

t174 把 stale 副本保留原 `observed_at` 后，`observation-store.ts` 的查询层 dedupe 加了 `stale DESC` tie-breaker（line 164/171/187），但 `prune_stmt`（:195-202）的 MAX 保护子查询仍只按 `MAX(o2.observed_at)` 选保留行——同 ts 下原观测与副本都命中「保留每键最新行」保护，prune 对该键失效。insert 前的 `delete_stale_dup_stmt`（:214）已堵住同 ts 累积，prune 是次要冗余清理层；但 tie-breaker 不对齐会让该层在失败-恢复循环中逐渐失活。同时 `UsageRows.tsx` 的 `AccountUsageRow` observedAt 优先取数路径（t174 对称改动）无测试覆盖。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `prune_stmt` 的 MAX 保护子查询补 `stale DESC` tie-breaker，与查询层 dedupe 一致（同 ts 优先保留 stale=1 的副本，与 latest 查询的取舍对齐）。
- `tests/unit/renderer/views/usage_rows.test.tsx` 补 `AccountUsageRow` observedAt 优先取数路径断言。
- `observation-store.test.ts` 补 `SELECT COUNT(*)` 行数断言，锁住「同键同 ts 不累积」防护（删 `delete_stale_dup` 后测试应变红）。

### 非范围

- 不改 `delete_stale_dup_stmt` 或 insert 路径（已防累积）。
- 不改 latest/trend 查询的 tie-breaker（已对齐）。
- 不重构 observation-store 的 dedupe 架构。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：prune_stmt 在同键同 ts（原观测 + stale 副本）场景下，按 `stale DESC` tie-breaker 选保留行，与 latest 查询返回的行一致。
- [ ] AC2：`AccountUsageRow` 在 observedAt 优先取数路径下显示正确时间（observedAt 非空时取 observedAt，否则回退）。
- [ ] AC3：`observation-store.test.ts` 有用例断言「连续失败-恢复循环后同键同 ts 行数不增长」；删除 `delete_stale_dup_stmt` 调用后该用例变红。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- store 测试用真实 SQLite 构造「原观测 + stale 副本同 ts」→ prune → 断言保留行 stale 字段与 latest 查询一致 + `SELECT COUNT(*)` 不增长。
- AC3 的「删 delete_stale_dup 后变红」通过先写绿测试、再临时删调用确认变红、最后恢复（TDD 纪律）。
- renderer 测试 mock observedAt 路径，断言显示时间。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：prune tie-breaker 改动影响现有 dedupe 测试（可能改变保留行选择）；AccountUsageRow observedAt 路径需确认组件 props 形态。
- 回退：恢复 prune 的 MAX-only 子查询 + 删新增测试（无数据迁移）。

### 依赖与约束

- 依赖 t174 已建立的 stale 副本语义（observed_at 保留原值、stale DESC tie-breaker）。
- 不与 task-run 队列冲突。

### Finalization 时更新的 blueprint

- 无（observation-store dedupe 语义已文档化，本次仅补齐次要清理层 + 测试）。
