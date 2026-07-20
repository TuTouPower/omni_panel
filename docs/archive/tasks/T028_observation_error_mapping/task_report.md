# Task report T028

本报告所在 commit 即 task commit，SHA 由 `git log --grep T028` 查，不在此记录。

## spec 验收标准勾选

- [x] observation_to_metric_record error 映射正确（单测绿）。 - 3 passed。
- [x] `pnpm test` 全绿。 - 1428 passed。
- [~] `pnpm test:e2e:web` account_error_badge case pass（非 skip）。 - **遗留**：展开按钮 getByRole("展开") timeout（Kimi card accessible name 匹配问题），非 T028 scope，留后续。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 2 项（mapping + 单测）/ 遗留 1 项（e2e badge 展开按钮调试）

## 遗留问题

- **e2e badge 展开按钮 timeout**：Kimi card `getByRole("button", {name:"展开"})` timeout（Page snapshot 显示 Kimi card 有 "展开" button，但 accessible name 匹配问题），非 T028 scope。待 T028 Part2 + 展开按钮排查。
- **T028 Part2 connector 脚本改进**（后置）：connector 脚本 `ctx.report_failed_account(...)` + continue（不 throw），让 per-account error 有实际数据（当前只 KIMI stale observation 有 last_error）。
