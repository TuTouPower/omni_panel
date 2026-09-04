# p215 存量 lint：token-stats-store.ts:899 prefer-optional-chain

- 现象：`pnpm lint` 报 `token-stats-store.ts:899:17 error Prefer using an optional chain expression instead`（`fallback && fallback.started_at !== null`），主仓与 t448 worktree 均复现；base 2eb2aabb 已存在。
- 影响：`pnpm lint`（max-warnings=0）FAIL，阻断 CI 级门禁。
- 根因：存量代码风格问题，非本次 task 引入（t448 未触碰该文件）；疑似 lint 规则/版本演进后未被存量清理覆盖。
- 测试缺口：无（lint 门禁本身可查；属一次性存量清理）。
- 线索：无
- 处理：未开
