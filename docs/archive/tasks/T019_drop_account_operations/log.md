# Task log

## 记录

- account_operations spec 测 popup `[aria-label="账号操作"]` 菜单（编辑/删除）。popup UI 重构（ProviderAccountRow 折叠卡片）后，`grep 账号操作 src/renderer/` 0 匹配，ProviderAccountRow 无编辑/删除/aria-label 入口——功能已从 popup 移除。
- 账号编辑/删除移 settings 页，settings_provider_accounts.spec.ts（electron）覆盖。
- popup 版 account_operations 废弃，删 spec。
