# Task report T012

本报告所在 commit 即 task commit，SHA 由 `git log --grep T012` 查，不在此记录。

## spec 验收标准勾选

- [x] `tests/e2e/electron/` 目录就位，无 `specs/` 残留。 — `git mv tests/e2e/specs tests/e2e/electron`（23 spec）；`grep e2e/specs` 活跃文档 0 残留。
- [x] `pnpm test:e2e:electron --list` 列出 23 spec。 — `playwright --project=electron --list` → 65 tests（23 spec × case）解析 OK。
- [x] `pnpm test:e2e:web` 不受影响（21 passed）。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 1 项 / 遗留 0 项 / 无需修改 1 项
- T012_code_f001 — 采纳：CI/testing.md/README 4 处 `pnpm test:e2e` 改新名（ci→test:packaged、nightly→test:e2e:electron、文档列三路）
- T012_test — 无需修改（0 finding）

## 遗留问题

- **Electron 驱动 65 tests 真跑未执行**（同 T009 降级）：机械改名 + `--list` 解析 + typecheck + web 不破 充分。Electron 真跑慢 + 需 packaged/build 产物，日常不跑（nightly 跑）。
- **settings_view case 级拆迁**（T011 遗留）：settings_view 留 electron/ 原样，web 可跑的 4 case 拆 web/ 留后续评估。
