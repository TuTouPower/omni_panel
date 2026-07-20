# Task report T024

本报告所在 commit 即 task commit，SHA 由 `git log --grep T024` 查，不在此记录。

## spec 验收标准勾选

- [x] runtime.test.ts 含 crash case。 - `process.exit(2)` → error truthy。
- [x] `pnpm test` 全绿。 - runtime 13 passed（+1）。

## adoption 处置摘要

- 已修 1 项（owner 自审，1 case）

## 遗留问题

- 无。crash 路径 vm 内 = throw，L145 throw case + 新 crash case 双覆盖。
