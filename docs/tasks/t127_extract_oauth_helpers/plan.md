# Task plan

## 步骤与验证

1. 红：新建 `tests/unit/auth/oauth_helpers.test.ts`，针对 `is_token_response` / `is_error_response` / `form_encode` / `is_terminal_grant_error` / `compute_expires_at` / `load_tokens` / `store_tokens` / `clear_tokens` 写行为断言（mock VaultBackend）→ 验证：`pnpm vitest run tests/unit/auth/oauth_helpers.test.ts` 失败（模块不存在）
2. 绿：新建 `src/main/core/auth/oauth_helpers.ts`，从 `kimi_oauth_manager.ts` 剪切 8 类型、常量、7 纯函数、`compute_expires_at`、`load_tokens`（`Promise.all` 版）、`store_tokens`、`clear_tokens`，加 `export`；`OAuthLoginResult` 取 kimi 超集版 → 验证：新测试通过
3. 改 `kimi_oauth_manager.ts`：删除本地副本，改为 `import`；保留 kimi 独有 `get_device_id` / `make_default_get_device_id` 与 `KimiOAuthManager` 接口 → 验证：`pnpm vitest run tests/unit/auth/kimi_oauth_manager.test.ts` 全绿
4. 改 `grok_oauth_manager.ts`：删除本地副本改为 `import`；`await_completion` 返回值补 `refresh_token` / `expires_at` 字段以匹配超集 `OAuthLoginResult`；保留 grok 独有并发控制（`token_generations` / `enqueue_token_mutation` / `refresh_in_flight`）与 `GrokOAuthManager` 接口 → 验证：`pnpm vitest run tests/unit/auth/grok_oauth_manager.test.ts` 全绿
5. 全量验证：`pnpm typecheck && pnpm test` 全绿；`wc -l` 确认两个 manager 各减约 48 行
6. 黑盒：`pnpm test`

## 风险与回退

- 风险 1（spike 风险点）：`OAuthLoginResult` 超集化后 grok 调用方可能受多余字段影响。TypeScript 结构类型天然兼容，检查 `await_completion` 调用方（`tests/unit/ipc/grok_auth_ipc.test.ts` 及 main 进程 IPC handler）无精确类型匹配即可。
- 风险 2（spike 风险点）：`store_tokens` 统一后 grok 侧 `expires_at` 计算路径变为 `compute_expires_at`，行为等价（同为 `Date.now() + expires_in * 1000` 的 `String`），由既有 grok 测试覆盖。
- 风险 3（spike 风险点）：grok `load_tokens` 由 3 次串行 `await` 改为 `Promise.all`，vault.get 间无依赖，语义等价且性能略升；若 vault 实现对并发敏感会暴露，由既有测试捕获。
- 风险 4：两 manager 的常量/类型已对外 `export`（如 `HttpPost`、`GROK_*` 常量）。提取前 grep 全仓 import 点，保持原 export 路径不破坏（`oauth_helpers.ts` re-export，或调用点改 import 源）。
- 回退：`git checkout -- src/main/core/auth/ tests/unit/auth/` 恢复两 manager；删除 `oauth_helpers.ts` 与其测试。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：若 auth 模块结构有描述，补 `oauth_helpers.ts` 共享模块一句；无相关描述则不更新
