# Task spec

## 背景

T016 遗留 account_operations spec（electron/）测 popup 内 `[aria-label="账号操作"]` 菜单（编辑/删除）。popup UI 重构后（ProviderAccountRow 折叠卡片），该菜单已从 popup 移除——`grep 账号操作 src/renderer/` 0 匹配，`ProviderAccountRow.tsx` 无编辑/删除/aria-label 入口。账号编辑/删除功能移 settings 页（`settings_provider_accounts.spec.ts` electron 覆盖）。popup 版 account_operations 功能不存在，spec 废弃。

## 范围

- 删 `tests/e2e/electron/account_operations.spec.ts`（测已废弃的 popup 账号菜单）

## 非范围

- 不重写（功能不存在于 popup）
- settings 账号操作覆盖由 settings_provider_accounts（electron）承接，不动

## 验收标准

- [ ] `tests/e2e/electron/account_operations.spec.ts` 删除
- [ ] `playwright --project=electron --list` 不含 account_operations
- [ ] 其余不受影响

## 依赖与约束

- 无
