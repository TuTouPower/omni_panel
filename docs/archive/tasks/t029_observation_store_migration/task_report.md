# Task report T029

本报告所在 commit 即 task commit，SHA 由 `git log --grep T029` 查，不在此记录。

## spec 验收标准勾选

- [x] observation-store 启动时旧 observation.sqlite 自动加 last_error 列。 - PRAGMA table_info 检查 + ALTER TABLE ADD COLUMN（合并到现有 label migration 块）。
- [x] `pnpm test` 全绿。 - 1430 passed（+2 migration test）。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 3 项（ALTER migration + 合并避免冲突 + obs_base 字段补全）

## 遗留问题

- 无。旧 observation.sqlite 重启后自动迁移加 last_error 列，数据恢复。
