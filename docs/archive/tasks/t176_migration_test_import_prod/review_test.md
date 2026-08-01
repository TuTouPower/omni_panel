# Task review t176（reviewer_focus: 测试）

- task：`t176_migration_test_import_prod`
- spec：`docs/tasks/t176_migration_test_import_prod/spec.md`
- diff_anchor：`242343ad8f46152746d490e46d6412b6b8c916fa`
- target：`git diff 242343ad8f46152746d490e46d6412b6b8c916fa`
- round：1
- reviewed_at：2026-08-01 10:30 UTC+8

## Findings

### t176_test_f001 - 「新 schema 幂等」用例 fixture 缺 display_label，幂等断言仅覆盖 last_error

- 严重度：minor
- 锚点：AC3（迁移后 schema 与迁移前一致）；行为缺陷：无
- 位置：`tests/unit/observation_store_migration.test.ts:76-90`
- 问题：用例 2 的「新 schema」fixture（`CREATE TABLE` 内含 `last_error TEXT`，但无 `display_label`）并不含全部生产列。生产 `migrate_observation_schema` 检测到 `display_label` 缺失后实际执行 `ALTER TABLE ... ADD COLUMN display_label`（observation-store.ts:74-77）。因此用例 2 标题「migration is idempotent on new schema」与注释「列已存在，无 ALTER 错误」不成立——display_label 分支从未进入「列已存在跳过 ALTER」路径，该分支的幂等性未被验证。断言（INSERT/SELECT null roundtrip）真实且通过，无假行为；属 fixture 与意图不匹配。
- 建议：fixture 补 `display_label TEXT`，使迁移在该 schema 上为纯 no-op；或改为断言迁移前后 `PRAGMA table_info` 列集合不变。

### t176_test_f002 - 迁移测试只断言 last_error，label 三列迁移分支被触发但无断言

- 严重度：minor
- 锚点：AC1/AC3 覆盖可更完整；行为缺陷：无
- 位置：`tests/unit/observation_store_migration.test.ts:41-42`
- 问题：用例 1 的 OLD_SCHEMA 缺 `display_label`（有 `raw_label`/`normalized_label`），`migrate_observation_schema` 对该 schema 实际补了 `display_label` + `last_error` 两列，但测试只断言 `has_column(last_error)` 与 last_error roundtrip。若生产逻辑丢弃 label 分支（如 LABEL_COLUMNS 写错），本测试仍全绿。该缺口为历史遗留（改前手写迁移也只处理 last_error），非本次 diff 引入；此处按「可再加一个 case」标 minor。
- 建议：迁移后补断言 `has_column(db, "display_label")` 为 true，覆盖 label 列补列路径。

## 结论

- 前轮 finding 复核：Round 1，无
- 改测方向复核：无。测试改动为删掉手写 `NEW_COLUMN_SQL`/内联 PRAGMA+ALTER 平行实现，改调生产 `migrate_observation_schema`；断言本身（last_error 存在性 + INSERT/SELECT roundtrip）原样保留，未弱化、未删 expect、未让断言迁就实现。符合 AC2 且不违反 TDD。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：`describe("observation-store migration (last_error column)")` 标题过时——生产迁移函数现覆盖 label 三列 + last_error（改名如 `(schema migration)` 更贴合）；范围外命名提示，不进 finding 表。
- 总体判断：diff 干净。生产逻辑字节级同搬至导出函数（observation-store.ts:70-86 与原内联块一致），`create_observation_store` 调用点与顺序不变；测试改 import 生产入口后触达真实实现，相比改前的平行实现覆盖反而提升。危险模式逐条扫描无命中；AC1/AC2/AC3 均有测试且通过。仅 2 条 minor 覆盖扩展项，无未解决 blocker。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-01 10:45 UTC+8)

## Findings

无新 finding。

## 结论

- 前轮 finding 复核（以 diff 与实测为准，不采信处置表自述）：
    - `t176_test_f001` — 已消除。新 schema fixture（`tests/unit/observation_store_migration.test.ts:81-94`）现含全部迁移相关列：`raw_label`/`normalized_label`（NOT NULL）、`display_label TEXT`、`last_error TEXT`，`migrate_observation_schema` 在该 schema 上无缺列，实际走「列已存在跳过 ALTER」纯 no-op 路径；迁移前断言（:95-96）确认 `last_error` 与 `display_label` 均存在。原 fixture 缺 `display_label` 导致幂等分支被误触发的缺陷已消除。实测 `npx vitest run tests/unit/observation_store_migration.test.ts` 2/2 通过。
    - `t176_test_f002` — 已消除。用例 1 补 label 列断言：迁移前 `has_column(db, "display_label")` 为 false（:40），迁移后 `display_label`/`raw_label`/`normalized_label` 均为 true（:45-47），label 补列分支（OLD_SCHEMA 缺 display_label 时实际执行 `ADD COLUMN display_label`）现被断言覆盖。`raw_label`/`normalized_label` 因 OLD_SCHEMA 已含而恒真，属冗余但非弱化。
- 改测方向复核：无迁就实现的改测。本轮测试改动为（1）删手写 `NEW_COLUMN_SQL` 与内联 PRAGMA/ALTER 决策逻辑，改调生产 `migrate_observation_schema`——AC2 要求，测试更贴近真实实现；（2）新增断言（label 列存在性）与 fixture 补列——强化而非弱化，原 last_error 断言逐字保留，无「把预期改成当前实现输出」。
- 契约区 drift 复核：spec 契约区相对 anchor 的改动（范围/非范围/AC2 措辞，允许 `has_column` PRAGMA 仅作断言辅助）与 `t176_code_f001` 处置一致，属澄清而非删减验收义务；测试仍删 `NEW_COLUMN_SQL` 并调生产入口，符合修订后 AC2。不计 finding。
- 危险模式逐条扫描：无命中。无 `.skip`/`.only`、无恒真断言、无删/反转/注释 expect、无 eslint-disable/ts-ignore、无 mock（用真实 better-sqlite3 `:memory:` 库直接触达生产 `migrate_observation_schema`）、无阈值掩盖、无条件跳过。`has_column` 为 spec 非范围明示允许的断言辅助。
- 本轮新发现：0 条。
- 未进表的提示：`describe` 标题「observation-store migration (last_error column)」仍偏窄（生产函数覆盖 label 三列 + last_error），Round 1 已提，命名提示不进表；新 schema fixture 含 `cycleDurationMs`/`source_instance_id_dup` 两列（当前生产 `INIT_SQL` 无），作新 schema 超集不影响迁移逻辑，属 fixture 真实感问题，非缺陷。
- 总体判断：f001/f002 均已按建议真实修复并经 diff 与实测验证，AC1/AC2/AC3 覆盖完整且无危险模式；`observation-store` 集成测试 18/18、迁移单测 2/2 通过。无未解决 blocker，PASS。
- 系统性 follow-up：无

verdict: PASS

## Round 3 (2026-08-01 10:52 UTC+8)

## Findings

无新 finding。

## 结论

- 前轮 finding 复核（以 diff 与实测为准，不采信处置表自述）：
    - `t176_test_f001` — 已消除。幂等用例 fixture（`tests/unit/observation_store_migration.test.ts:81-93`）现含生产 `INIT_SQL` 全部 19 列（`display_label`、`name`、`window`、`used`、`"limit"`、`reset_at`、`last_error` 均在），迁移前断言（:94-95）确认 `last_error` 与 `display_label` 均存在；`migrate_observation_schema` 在该 schema 上 `LABEL_COLUMNS` 与 `last_error` 均无缺，走纯 no-op「列已存在跳过 ALTER」路径，幂等性被真实验证（非被缺列误触发）。实测 2/2 通过。
    - `t176_test_f002` — 已消除。用例 1 迁移前断言 `has_column(db, "display_label")` 为 false（:40，OLD_SCHEMA 无该列），迁移后断言 `display_label` 为 true（:45）；生产 label 补列分支（`missing` 含 display_label，实际执行 `ADD COLUMN display_label`）的触发与结果均被断言覆盖。原 last_error 断言逐字保留。
- 改测方向复核：无迁就实现的改测。本轮 diff 中测试改动全部为（1）删除手写 `NEW_COLUMN_SQL` 与内联 PRAGMA/ALTER 决策逻辑、改调生产 `migrate_observation_schema`——AC2 要求，测试触达真实实现；（2）新增 label 列存在性断言与生产对齐的 fixture——强化覆盖；原始 `last_error` 存在性 + INSERT/SELECT roundtrip 断言结构与预期原样保留，无「把预期改成当前实现输出」。
- 契约区 drift 复核：spec 契约区相对 anchor 的改动（范围/非范围/AC2 措辞，`has_column` 仅作断言辅助）与 Round 2 判定一致，属澄清而非删减验收义务；当前工作区 spec.md 已同步该措辞，AC1/AC2/AC3 实质未变。不计 finding。
- 危险模式逐条扫描：无命中。无 `.skip`/`.only`、无恒真断言充当 AC 证据、无删/反转/注释 expect、无 eslint-disable/ts-ignore、无 mock（真实 better-sqlite3 `:memory:` 直触生产 `migrate_observation_schema`）、无阈值掩盖、无条件跳过弱化、无程序赋值替代交互。用例 1 中 `raw_label`/`normalized_label` 恒真断言（OLD_SCHEMA 已含）为冗余补充，非 AC 证据，Round 2 已注，不重复出 finding。
- 本轮新发现：0 条。
- 未进表的提示：幂等用例 fixture `window TEXT` 缺生产 `NOT NULL`（:87）——迁移按列名判断，空值约束不影响迁移逻辑，属 fixture 真实感差异非缺陷；可选的更广覆盖：构造真实旧 schema 磁盘文件后经 `create_observation_store` 迁移端到端断言（AC1 调用点行为化），当前 18 条集成测试已触达 `create_observation_store` 调用路径，未纳入契约区测试策略，不作 blocking；`describe` 标题「last_error column」仍偏窄（Round 1/2 已提，命名不进表）。
- 总体判断：f001/f002 修复经当前 diff 与实测（迁移单测 2/2、observation-store 集成 18/18 全绿）复核确认真实落地，无新危险模式、无未解决 blocker。PASS。
- 系统性 follow-up：无

verdict: PASS
