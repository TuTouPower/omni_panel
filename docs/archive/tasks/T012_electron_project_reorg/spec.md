# Task spec

## 背景

T011 迁 5 个可平移 spec 到 `web/`，剩 23 个 Electron 专属 spec 在 `specs/`。`specs/` 命名在 web/electron/packaged 三路 e2e 并存时歧义。把 `specs/` 改名 `electron/`，playwright config 的 default project 改名 electron + testDir 同步，日常 `pnpm test:e2e` 跑 web，`pnpm test:e2e:electron` 手动跑 Electron 专属。

## 范围

- `git mv tests/e2e/specs tests/e2e/electron`
- `playwright.config.ts`：default project（name: default → electron，testDir: specs → electron）
- `package.json`：`test:e2e` → `test:e2e:electron`（手动跑 Electron 专属）；日常 e2e 用 `test:e2e:web`
- `tests/e2e/electron/` 内 spec 内容不动（仍 Electron 驱动）

## 非范围

- 不改 spec 内容（Electron 专属保持原样）
- 不动 web/、packaged/、fixtures/、pages/
- settings_view case 级拆迁（T011 遗留）暂不做，留 electron/ 跑原样

## 验收标准

- [ ] `tests/e2e/electron/` 目录就位，无 `specs/` 残留
- [ ] `pnpm test:e2e:electron --list` 能列出 23 个 spec（config 解析 OK，不要求真跑）
- [ ] `pnpm test:e2e:web` 不受影响（21 passed）
- [ ] `pnpm typecheck` 过

## 依赖与约束

- Electron 驱动 spec 真跑慢 + 需 packaged/build 产物，验收用 `--list` 代替全跑
