# d026 worktree 内 pnpm test 与 electron e2e 的 better-sqlite3 ABI 互斥（2026-08-08）

- 来源：t262
- 结论：`scripts/ensure_sqlite_abi.mjs` 会把 better-sqlite3 编译为指定运行时 ABI；`pnpm test` 前置切 `node`（NODE_MODULE_VERSION 127），electron e2e 前置切 `electron`（146）。同一 node_modules 状态下两者不能连跑：跑完 `pnpm test` 直接跑 `pnpm test:e2e:electron`，Electron 启动即崩（`NODE_MODULE_VERSION 127 vs 146`，`Startup failed`，firstWindow 超时），且此失败发生在既有用例上，易被误判为代码回归。
- 证据：t262 中 `pnpm test` 后跑 e2e 全 spec 启动失败（agent 既有用例同崩，非 diff 引入）；切 `node scripts/ensure_sqlite_abi.mjs electron` 后 history e2e 1 passed、agent 回归通过。
- 影响：worktree 内连续跑单测与 electron e2e 时，中间必须重切 ABI（`node scripts/ensure_sqlite_abi.mjs electron`）；怀疑「e2e 全部启动失败」时先排查 ABI 状态，再查代码。
- 现状：有效
