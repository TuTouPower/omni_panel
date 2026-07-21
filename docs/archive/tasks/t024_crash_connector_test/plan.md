# Task plan / log

## 记录

- vm sandbox（runtime.ts create_sandbox_context L31）只注入 ConnectorContext，无 process；detect_sandbox_escape 拦 process.binding 不拦 process.exit。
- process.exit(2) 脚本在 vm 内 process undefined → ReferenceError → throw → run_connector 返回 error。
- runtime.test.ts 加 case `process.exit(2)` → 断言 error truthy。覆盖 e2e seed_fake_plugin behavior=crash 场景。
- 13 passed（+1）。
