# Task spec

## 背景

review_20260726_054747 采纳项 10、11：Kimi OAuth `await_completion`/`logout` 未走 mutation queue，`refresh_now` 无并发去重，可能写回已注销 token 或形成混合 token 状态（Grok 已有对应保护）。

## 范围

- `kimi_oauth_manager.ts` 增加 `token_generations`、`token_mutation_tails`、`enqueue_token_mutation`，对齐 Grok 语义。
- `await_completion` 成功响应与 `logout` 进入同一队列并校验 generation。
- 增加按 instance 的 `refresh_in_flight` Map 去重；refresh 保存与终止错误清理进入队列并校验 generation。
- 补并发测试：logout during login、login write during logout、refresh 合并、logout during refresh。

## 非范围

- 不抽取 Grok/Kimi 共用泛型工厂；不改 Grok manager。

## 验收标准

- [ ] Kimi 登录/登出/刷新均经 mutation queue 且校验 generation。
- [ ] 同 instance 并发 refresh 合并为单请求。
- [ ] 新增并发测试通过，现有 OAuth 测试不回归。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 参考 `grok_oauth_manager.ts` 的 queue/generation/refresh_in_flight。TDD：先写失败并发测试。
