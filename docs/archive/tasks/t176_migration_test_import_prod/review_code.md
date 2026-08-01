# Task review t176（reviewer_focus: 代码）

- task：`t176_migration_test_import_prod`
- spec：`docs/tasks/t176_migration_test_import_prod/spec.md`
- diff_anchor：`242343ad8f46152746d490e46d6412b6b8c916fa`
- target：`git diff 242343ad8f46152746d490e46d6412b6b8c916fa`
- round：1
- reviewed_at：2026-08-01 10:30 UTC+8

## Findings

### t176_code_f001 - AC2 措辞与实现不一致：测试仍保留 PRAGMA table_info 断言辅助函数

- 严重度：minor
- 锚点：AC2 字面表述「删除手写 NEW_COLUMN_SQL 与 PRAGMA table_info」；功能意图已满足，无行为缺陷
- 位置：`tests/unit/observation_store_migration.test.ts:30-33`（`has_column` 定义）、`38`、`42`、`87`（断言调用）
- 问题：范围与 AC2 写明测试「删除手写 NEW_COLUMN_SQL 与 PRAGMA table_info」。本 diff 已删除 `NEW_COLUMN_SQL` 常量与旧「`if (!has_column(db, "last_error")) db.exec(NEW_COLUMN_SQL)`」式迁移决策逻辑，两用例均改调生产 `migrate_observation_schema`。但测试保留的 `has_column()` 仍执行 `PRAGMA table_info`，现仅用作断言（迁移前不存在 / 迁移后存在），不再承担迁移决策。属于 spec 字面与实现语义不一致：功能上测试已不再维护独立迁移逻辑，PRAGMA 仅作 schema 断言，恰是 AC3「迁移后 schema 与迁移前一致」的直接验证手段。
- 建议：二选一——保持现状并同步 spec 措辞（把删除对象明确为「手写迁移用的 PRAGMA 判断」，声明断言型 PRAGMA 可保留），或把 `has_column` 改为查询 `sqlite_master` 以完全贴合字面。不计 FAIL。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`src/main/core/observation/observation-store.ts` 315 行（< 400 阈值）、`tests/unit/observation_store_migration.test.ts` 120 行（< 600 阈值），均未达阈值，不适用。
    - 复杂度：`migrate_observation_schema` 近似 CC≈4（1 if + 1 for + 1 if），低于阈值，不适用。
    - 范围外观察：`migrate_observation_schema` 为新建导出函数，若在 `observations` 表不存在时调用会抛 `no such table`；生产路径 `create_observation_store` 先执行 `INIT_SQL`（`CREATE TABLE IF NOT EXISTS`）再调用，测试均先建表，前置条件实际满足。JSDoc 未写明该前置条件，属文档完整性提示，非缺陷。
- 总体判断：AC1 满足（`migrate_observation_schema` 独立导出、`create_observation_store` 在 INIT_SQL 后调用，抽取逻辑逐行未变、执行时机与顺序保持）；AC2 功能意图满足（删除手写迁移 SQL，改 import 生产入口，仅余断言型 PRAGMA，见 f001）；AC3 满足（迁移测试 2/2 通过，observation-store 相关 24/24 通过，typecheck 通过）。无未解决 critical / important，仅 1 条 minor（spec 措辞澄清类），可 PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-01 10:45 UTC+8)

### Findings

#### t176_code_f002 - 用例 1 注释「旧 schema 无 label 列」与实际 fixture 不符

- 严重度：minor
- 锚点：注释准确性（无行为缺陷；断言本身正确，测试实测 2/2 通过）
- 位置：`tests/unit/observation_store_migration.test.ts:39`
- 问题：本轮修复新增注释 `// 旧 schema 无 label 列（T028 前），迁移须补`，与实际 `OLD_SCHEMA`（:7-25）不符——fixture 已含 `raw_label`、`normalized_label` 两列，仅缺 `display_label`。「无 label 列」会误导后续维护者以为旧 schema 完全没有 label 列；下方断言 `expect(has_column(db, "display_label")).toBe(false)`（:40）与迁移后补列断言（:45-47）均正确，无功能缺陷。
- 建议：注释改为「旧 schema 缺 display_label（T028 前），迁移须补」或删除，避免与 fixture 矛盾。

#### t176_code_f003 - 幂等用例 fixture 混入生产 schema 不存在的列

- 严重度：minor
- 锚点：fixture 保真度（无行为缺陷；幂等断言成立，测试实测 2/2 通过）
- 位置：`tests/unit/observation_store_migration.test.ts:92`
- 问题：幂等用例的「新 schema」fixture 含 `cycleDurationMs INTEGER, source_instance_id_dup TEXT`（:92），这两列不在生产 `INIT_SQL`（`src/main/core/observation/observation-store.ts:34-56`）中。fixture 与生产 schema 不一致，读者可能误以为生产含这两列；迁移幂等结论不受影响，但 fixture 应忠实反映生产新 schema。
- 建议：删除两列，或注明来源（若为历史真实 schema 快照则加注释说明）。

### 结论

- 前轮 finding 复核：
    - t176_code_f001（minor，AC2 措辞与实现不一致）——已消除。spec.md 契约区已同步：非范围补「测试内 has_column 断言辅助（PRAGMA 读列存在性）保留，仅作迁移前后断言，不再承担迁移决策」，AC2 改「has_column PRAGMA 仅作断言辅助」。该 drift 即 f001 建议的「保持现状并同步 spec 措辞」方案，AC1/AC3 未变，属措辞澄清而非需求变更；代码侧 `has_column`（:30-33）现仅用于 expect 断言，旧迁移决策逻辑（`if (!has_column(...)) db.exec(NEW_COLUMN_SQL)`）已删除，测试改 import 生产 `migrate_observation_schema`，符合新 AC2。判已消除。
- 本轮新发现：2 条（均 minor：f002 注释准确性、f003 fixture 保真度）
- 未进表的提示：
    - 文件过大：`src/main/core/observation/observation-store.ts` 316 行（<400）、`tests/unit/observation_store_migration.test.ts` 130 行（<600），均未达阈值。
    - 复杂度：`migrate_observation_schema` 近似 CC≈4（1 if + 1 for + 1 if），低于阈值。
    - 范围外观察：沿用 Round 1——`migrate_observation_schema` 导出函数 JSDoc 未写明「observations 表须已存在」前置条件；生产路径先 `INIT_SQL` 后调用，条件实际满足，非缺陷。
- 总体判断：AC1（`migrate_observation_schema` 独立导出、`create_observation_store` 调用）、AC2（测试删除手写 NEW_COLUMN_SQL、import 生产入口、PRAGMA 仅作断言）、AC3（迁移测试 2/2、observation-store 集成 18/18 实测通过；抽取逻辑逐行未变、执行时机与顺序保持）均满足；f001 已按建议同步 spec 消除；本轮 2 条 minor（注释与 fixture 保真度），无未解决 critical / important，可 PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-01 10:55 UTC+8)

### Findings

#### t176_code_f004 - 幂等用例 fixture 声称对齐生产 INIT_SQL，但 window 列缺 NOT NULL 约束

- 严重度：minor
- 锚点：fixture 保真度（无行为缺陷；幂等断言成立，测试实测 2/2 通过）
- 位置：`tests/unit/observation_store_migration.test.ts:87`（`window TEXT`）对比生产 `src/main/core/observation/observation-store.ts:46`（`window TEXT NOT NULL`）
- 问题：f003 修复后 fixture 增补 `display_label/name/window/used/"limit"/reset_at` 六列，注释（:80）称「对齐生产 INIT_SQL 的完整新 schema」。但 fixture 的 `window TEXT`（:87）缺生产 INIT_SQL 的 `NOT NULL` 约束（:46）。该差异 load-bearing：用例 2 的 INSERT（:101-120）省略 window 列，仅在 fixture 声明 window 可空时才合法；若真正对齐生产约束，该 INSERT 会抛 NOT NULL 约束违规。读者可能误以为生产 window 可空，「对齐」措辞不成立。
- 建议：fixture 改 `window TEXT NOT NULL`，并为用例 2 INSERT 补 window 值；或删除「对齐生产 INIT_SQL」措辞，注明为简化快照。

### 结论

- 前轮 finding 复核：
    - t176_code_f002（minor，用例 1 注释与实际 fixture 不符）——已消除。注释改为「// OLD_SCHEMA 已有 raw_label/normalized_label，仅缺 display_label 与 last_error」（:39），与 OLD_SCHEMA（:7-25 含 raw_label/normalized_label、不含 display_label/last_error）一致；用例 1 另新增 `expect(has_column(db, "display_label")).toBe(false)`（:40）佐证。判已消除。
    - t176_code_f003（minor，幂等用例 fixture 混入生产 schema 不存在的列）——已消除。fixture 删除 `cycleDurationMs`、`source_instance_id_dup` 两列，增补 `display_label/name/window/used/"limit"/reset_at`，现覆盖生产 INIT_SQL 全部 20 列；仍存在 window NOT NULL 约束级差异，见 f004。
- 本轮新发现：1 条（minor）
- 未进表的提示：
    - 文件过大：`src/main/core/observation/observation-store.ts` 315 行（<400）、`tests/unit/observation_store_migration.test.ts` 128 行（<600），均未达阈值。
    - 复杂度：`migrate_observation_schema` 近似 CC≈4（1 if + 1 for + 1 if），低于阈值。
    - 范围外观察：沿用前轮——`migrate_observation_schema` JSDoc 未写明「observations 表须已存在」前置条件；生产路径先 INIT_SQL 后调用、测试均先建表，条件实际满足，非缺陷。spec 契约区 drift 与 Round 2 已确认的 f001 修复一致（非范围补「has_column 断言辅助保留」、AC2 措辞改「仅作断言辅助」），无新增 drift。
- 总体判断：AC1（`migrate_observation_schema` 独立导出、`create_observation_store` 调用、抽取逻辑逐行未变且执行时机与顺序保持）、AC2（测试删除手写 NEW_COLUMN_SQL、import 生产入口、PRAGMA 仅作断言）、AC3（迁移测试 2/2、observation-store 集成 18/18 实测通过）均满足；f002/f003 已消除，本轮 1 条 minor（fixture 约束保真度），无未解决 critical / important，可 PASS。
- 系统性 follow-up：无

verdict: PASS
