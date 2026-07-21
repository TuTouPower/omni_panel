# Task plan

## 步骤与验证

1. 确认 vitest 能 import .mjs（vitest config / 直接 import 路径）→ 验证：写最小测跑通
2. 写 `tests/unit/e2e/mock_server.test.ts`：create_mock_handler 喂 fake responses + http req/res mock → 断言
3. 覆盖 health/connectors/state 精确/secrets 精确/trend 精确/POST/404
4. `pnpm test` → 验证：全绿
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：vitest import .mjs 失败（ESM/CJS 互操作）→ 改用 dynamic import 或 ts wrapper
- 风险：http req/res mock 复杂 → create_mock_handler 接 Node IncomingMessage/ServerResponse，用最小 stub

## Finalization 时更新的 blueprint

- 无
