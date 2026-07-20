# Task spec

## 背景

`tests/user_e2e/` 目录名在即将引入 web e2e 测试类型后产生歧义（`user_` 前缀冗余，且 web/electron/packaged 三路 e2e 并存时 `user_e2e` 命名不准）。先机械改名 `user_e2e → e2e` 并同步所有引用，验证现有 Electron 驱动 e2e 仍跑通。web 基建与 spec 迁移在后续 task（T010-T012）。

## 范围

- `git mv tests/user_e2e tests/e2e`
- 更新引用：`playwright.config.ts`（globalSetup + specs/packaged 两个 testDir）、`docs/blueprint/architecture.md`、`docs/guides/testing.md` 的路径字样
- 清理 `architecture.md` 注释里已删的 visual 字样

## 非范围

- 不改 `docs/guides/testing.md` 分层结构（留 T013）
- 不动 spec 内容、fixture、page object
- 不引入 web project（留 T010）

## 验收标准

- [ ] `tests/e2e/` 目录就位，全仓无 `user_e2e` 残留引用（archive 除外）
- [ ] `pnpm test:e2e` 跑通（Electron 驱动 specs/ 不变）
- [ ] `pnpm typecheck` 过

## 依赖与约束

- packaged OmniUsage.exe 需先停（释放 better-sqlite3.node 锁，`ensure_electron_abi` rebuild 需要）
