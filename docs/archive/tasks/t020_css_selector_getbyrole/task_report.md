# Task report T020

本报告所在 commit 即 task commit，SHA 由 `git log --grep T020` 查，不在此记录。

## spec 验收标准勾选

- [x] web/ 下无 `aria-label="${...}"` 拼 label 的 CSS selector。 - grep 0 残留。
- [x] `pnpm test:e2e:web`（real + synthetic）全绿。 - real 41 passed / synthetic 38 passed + 3 skipped。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 0 项 / 遗留 0 项 / 无需修改 2 项（两 review 0 finding）

## 遗留问题

- 无。popup_refresh_state_reset 的 getByRole 无 exact（T016 历史，无 interpolation，非本 task 范围）。
