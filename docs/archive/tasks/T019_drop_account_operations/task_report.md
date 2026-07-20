# Task report T019

本报告所在 commit 即 task commit，SHA 由 `git log --grep T019` 查，不在此记录。

## spec 验收标准勾选

- [x] `tests/e2e/electron/account_operations.spec.ts` 删除。 - git rm。
- [x] `playwright --project=electron --list` 不含 account_operations。 - grep 0 匹配。
- [x] 其余不受影响。 - electron 14 spec（原 15），web/packaged 不动。

## adoption 处置摘要

- 已修 1 项（owner 自审，删废弃 spec）

## 遗留问题

- 无。account_operations popup 版功能已废弃（UI 重构），settings 账号操作由 settings_provider_accounts（electron）承接。
- plugin_failure_modes（T016 遗留）留 electron 合理（强依赖 fake failed 行为，mock 无法造）。
