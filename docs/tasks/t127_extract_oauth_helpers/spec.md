# Task spec

## 背景

t118 code_f002 遗留：`grok_oauth_manager.ts` 与 `kimi_oauth_manager.ts` 存在约 150 行低层 helper 重复。s001 spike 已完成逐函数边界评估并采纳 Layer 1 方案：提取纯函数 / 类型 / 常量到共享模块，消除两文件间最机械的重复，不触碰两者行为差异部分。

## 范围

- 新建 `src/main/core/auth/oauth_helpers.ts`，按 s001「结论 → 提取方案 Layer 1」提取：
    - 7 个顶层纯函数：`is_token_response`、`is_error_response`、`form_encode`、`to_error`、`make_default_http_post`、`clear_tokens`、`is_terminal_grant_error`
    - 8 个共享类型/接口：`HttpPost`、`DeviceCodeStart`、`LoginStatus`、`RefreshResult`、`AutoRefreshOptions`、`TokenResponse`、`TokenErrorResponse`、`StoredTokens`
    - 共享常量：`DEVICE_CODE_GRANT`、`REFRESH_TOKEN_GRANT`、`OAUTH_TOKEN_KEY` / `OAUTH_REFRESH_TOKEN_KEY` / `OAUTH_EXPIRES_AT_KEY`、`SLOW_DOWN_PENALTY_SECONDS`、`REFRESH_MARGIN_MS`、`REFRESH_RETRY_DELAY_MS`、`MAX_REFRESH_RETRIES`、`MIN_REFRESH_DELAY_MS`、`MAX_TIMEOUT_MS`
    - 统一 `load_tokens`（用 `Promise.all`）、提取 `compute_expires_at`、统一 `store_tokens`
- `OAuthLoginResult` 统一为 kimi 超集版（含 `refresh_token?` / `expires_at?`），grok 侧 `await_completion` 补传字段。
- 两个 manager 改为从 `oauth_helpers.ts` import，删除各自本地副本。

## 非范围

- 不提取：`refresh_now`、`logout`、`form_headers` / `build_headers`、`await_completion`、`schedule_retry`（引用 `refresh_now` 闭包）。
- 不提取 grok 独有并发控制：`token_generations` / `advance_token_generation` / `enqueue_token_mutation` / `refresh_in_flight`。
- 不做 s001 Layer 2（闭包函数 + `OAuthRefreshState` 参数化，约 55 行）。
- 不改变 grok / kimi OAuth 任何可观察行为。

## 验收标准

- [ ] `src/main/core/auth/oauth_helpers.ts` 建立，包含上述 7 函数 + 8 类型 + 常量 + 统一 `load_tokens` / `store_tokens` / `compute_expires_at`
- [ ] `grok_oauth_manager.ts` 与 `kimi_oauth_manager.ts` 各减少约 48 行，重复定义全部移除
- [ ] `pnpm typecheck` 通过
- [ ] `pnpm test` 全绿（含既有 `tests/unit/auth/grok_oauth_manager.test.ts` / `kimi_oauth_manager.test.ts` 不删改断言语义）
- [ ] grok / kimi OAuth 行为零变化（既有测试全部原样通过即视为证据）

## 依赖与约束

- 前置：s001 spike 已完成（边界与风险已定），无代码依赖。
- 遵循 s001 风险小节：grok `load_tokens` 由串行 await 改为 `Promise.all`（vault.get 间无依赖，语义等价）；`store_tokens` 统一经 `compute_expires_at`（grok 行为等价）。
