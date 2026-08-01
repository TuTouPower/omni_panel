# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

tests/unit/observation_store_migration.test.ts:26,30,40 仍手写 NEW_COLUMN_SQL 与 PRAGMA table_info；生产迁移逻辑位于 src/main/core/observation/observation-store.ts:119-133，内联于 create_observation_store，未导出独立函数。手写 PRAGMA 与生产迁移存在漂移风险，需先抽取导出迁移函数（小幅 API 暴露），再让测试 import 生产入口。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 从 create_observation_store 抽取迁移逻辑为独立导出函数；observation_store_migration.test.ts 改为 import 生产迁移入口，删除手写 NEW_COLUMN_SQL/PRAGMA。

### 非范围

- 不改迁移逻辑本身（ALTER TABLE 语句与执行顺序不变）。
- 不改其他测试。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：生产迁移逻辑抽取为独立导出函数（如 migrate_observation_schema），create_observation_store 调用该函数。
- [ ] AC2：observation_store_migration.test.ts 删除手写 NEW_COLUMN_SQL 与 PRAGMA table_info，改为 import 并调用生产迁移函数。
- [ ] AC3：迁移测试通过；迁移后 schema 与迁移前一致。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

按项目默认。跑 observation_store_migration.test.ts 与 observation-store 相关测试。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无

### 风险与回退

- 风险：抽取迁移函数时改变执行时机或顺序。
- 回退：revert 实现 commit。

### 依赖与约束

无

### Finalization 时更新的 blueprint

无
