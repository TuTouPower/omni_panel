# Task plan

## 步骤与验证

1. `git mv tests/e2e/specs tests/e2e/electron` → 验证：目录就位
2. `playwright.config.ts` default project：name `default`→`electron`，testDir `specs`→`electron` → 验证：grep 无 specs 残留
3. `package.json`：`test:e2e` → `test:e2e:electron`（注释说明手动跑）→ 验证：node parse
4. `pnpm exec playwright test --config=playwright.config.ts --project=electron --list` → 验证：列出 23 spec
5. `pnpm test:e2e:web` → 验证：21 passed 不破
6. `pnpm typecheck` → 验证：过
7. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：default project 改名影响 CI/其他脚本引用 `--project=default` → grep 全仓确认
- 回退：`git mv tests/e2e/electron tests/e2e/specs` + config 还原

## Finalization 时更新的 blueprint

- 无（架构未变，仅目录/project 改名）
