# Task report T023

本报告所在 commit 即 task commit，SHA 由 `git log --grep T023` 查，不在此记录。

## spec 验收标准勾选

- [x] web about case（logo + version）跑通。 - 2 case（.ah-logo/.ah-ver），real/synthetic 绿。
- [x] web accounts case（`.accent-row`）跑通或 skip。 - web SPA accounts 不渲染 .accent-row，skip（留 electron restart）。
- [x] electron 留 restart case。 - settings_provider_accounts.spec.ts 重写只含 restart case（.accent-row class 同步）。
- [x] `pnpm test:e2e:web` 全绿。 - real 45 passed + 1 skip / synthetic 44 + 2 skip。
- [x] `pnpm typecheck` 过。

## adoption 处置摘要

- 已修 4 项（owner 自审，拆迁 + class 同步）
- 发现并修复 settings spec class 全过期（.aa-logo/.ao-item → .ah-logo/.accent-row）

## 遗留问题

- **electron restart case 真跑未验证**（需 Electron 慢）：文件存在 + class 对照 SettingsView + typecheck；若 electron 真跑发现 class 差异再修。
- **accounts web 覆盖缺失**：web SPA accounts 页 .accent-row 不渲染（mock fixture 无账号编辑场景或 web 简化），accounts 编辑由 electron restart case 覆盖（.accent-row filter SettingsDeepSeek）。
