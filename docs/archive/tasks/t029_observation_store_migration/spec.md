# Task spec

## 背景

`observation.sqlite` 是用户数据（109MB 历史观测），路径 `%APPDATA%/OmniUsage/observations.sqlite`（root，不在 states/）。`clear_runtime_state` 删 `states/`（runtime cache）不影响 observation.sqlite。但 `observation-store.ts` 新代码（T026 加 MetricRecord.error → last_error 列）INSERT/SELECT 用 `last_error`，旧 observation.sqlite 无此列，INSERT 失败，observation-store 空，UI 显示无数据（"数据没了"）。

## 范围

- `src/main/core/observation/observation-store.ts`：在 `CREATE TABLE observations`（L35-55）后加 `ALTER TABLE observations ADD COLUMN IF NOT EXISTS last_error TEXT`（兼容旧 DB）。
- `tests/unit/observation-store-migration.test.ts`（新）：旧 schema（无 last_error 列）CREATE TABLE → INSERT/SELECT last_error 失败 → ALTER TABLE 加列 → INSERT/SELECT 通过。

## 非范围

- 不改 `clear_runtime_state`（删 states/ 不影响 observation.sqlite）
- 不改 paths.ts（observation.sqlite 在 root，正确）
- 不迁移 states/ 内容（runtime-store cache，clear_runtime_state 清合理）

## 验收标准

- [ ] observation-store 启动时旧 observation.sqlite 自动加 last_error 列（ALTER TABLE IF NOT EXISTS）
- [ ] `pnpm test` 全绿
- [ ] `pnpm typecheck` 过

## 依赖与约束

- SQLite 3.35.0+（Electron 42 内置）支持 `ADD COLUMN IF NOT EXISTS`
- observation.sqlite 在 `%APPDATA%/OmniUsage/`（root），非 states/
