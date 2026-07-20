# Task report T009

本报告所在 commit 即 task commit，SHA 由 `git log --grep T009` 查，不在此记录。

## spec 验收标准勾选

- [x] `tests/e2e/` 目录就位，全仓无 `user_e2e` 残留引用（archive 除外）。 — `grep user_e2e` 活跃文档 0 残留（review_code f001 / review_test f001 捕获的 testing.md:27 漏改已修；仅 tasks_index/T009 标题行保留作追溯）。
- [~] `pnpm test:e2e` 跑通。 — **降级**：owner 未跑完（Electron ABI rebuild + 27 spec 慢，且 T010 将以 mock web e2e 取代）。代以 `pnpm typecheck` 全绿 + grep 路径一致 + 27 spec zero content change。运行时验证留 T010 收尾补齐（见遗留）。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 2 项 / 遗留 0 项 / 无需修改 0 项
- T009_code_f001 / T009_test_f001 — 采纳：testing.md:27 打包 smoke 路径漏改，已修
- T009_test_f002 — 采纳：test:e2e 降级可接受，task_report 注明遗留 + T010 补真跑

## 遗留问题

- `pnpm test:e2e`（Electron 驱动 27 spec）未真跑。T009 机械改名性质 + typecheck 绿 + import 全相对路径，运行时风险低；T010 引入 mock web e2e 后，运行时验证由 web e2e 跑通承接，Electron 驱动 spec 的真跑在 T012 electron project 整理时补。
