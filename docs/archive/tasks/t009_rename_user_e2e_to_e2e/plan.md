# Task plan

## 步骤与验证

1. 停 packaged OmniUsage.exe（释放 .node 锁） → 验证：electron 进程 0
2. `git mv tests/user_e2e tests/e2e` → 验证：tests/e2e/ 存在、tests/user_e2e/ 不在
3. 改 `playwright.config.ts`（globalSetup + specs/packaged testDir 路径前缀） → 验证：grep user_e2e 无残留
4. 改 `architecture.md` / `testing.md` 路径字样 + 清 visual 注释 → 验证：grep 无 user_e2e
5. `pnpm test:e2e`（ensure_electron_abi + playwright default project） → 验证：现有 spec 跑通
6. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：`test:e2e` 因 ABI/环境/flaky 慢 → 降级：typecheck + grep 一致即视为机械改名成立，e2e 跑通作附加验证
- 回退：`git mv tests/e2e tests/user_e2e` 还原

## Finalization 时更新的 blueprint

- `architecture.md`：tests/ 注释路径同步（user_e2e → e2e，删 visual）
