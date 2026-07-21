# Task report T025

本报告所在 commit 即 task commit，SHA 由 `git log --grep T025` 查，不在此记录。

## spec 验收标准勾选

- [x] restart case 真跑绿。 - 1 passed（2.8s 含 restart + API 密钥持久化验证）。
- [x] `pnpm test:e2e:electron` 跑通。 - 1 passed，electron project 不破。

## adoption 处置摘要

- 已修 2 项（selector + 真跑）

## 遗留问题

- 无。electron restart 真跑验证成功，settings_provider_accounts selector 已适配 SettingsView 重构。
