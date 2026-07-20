# Adoption T019

owner 自审（删 1 废弃 spec，改动极小，不派 review agent）。

| 项                         | 决策 | rationale                                                                                        | status |
| -------------------------- | ---- | ------------------------------------------------------------------------------------------------ | ------ |
| 删 account_operations spec | 采纳 | popup 账号菜单功能 UI 重构后已移除（grep 0），功能移 settings（settings_provider_accounts 覆盖） | 已修   |

## 处置说明

- account_operations spec 测 popup `[aria-label="账号操作"]` 菜单。`grep 账号操作 src/renderer/` 0 匹配，ProviderAccountRow 无该入口——功能已从 popup 移除。
- 账号编辑/删除移 settings 页，settings_provider_accounts.spec.ts（electron）覆盖。
- 删 electron/account_operations.spec.ts，`playwright --project=electron --list` 不再含该 spec，electron 14 spec（原 15）。
