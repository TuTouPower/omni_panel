# Task spec

## 背景

t066 spike 建好 `connector-thresholds.ts` 共享 helper + `ConnectorContext.status` 注入（`for_pct` / `for_ratio` / `for_balance`），但仍有连接器内联各自 status helper 未改用 `ctx.status`。实测 grep：内联残留共 **8 个**连接器——claude / cpa / deepseek / exa / firecrawl / getoneapi / mimo / tikhub（kimi 已无内联 helper，不在范围；全仓尚无连接器使用 `ctx.status`）。exa 的 `status_for_cost` 语义等同 `for_ratio`（used/limit 按 0.9/0.75 分档）。

## 范围

- 8 个连接器（claude / cpa / deepseek / exa / firecrawl / getoneapi / mimo / tikhub）删内联 status helper，改用 `ctx.status.for_pct` / `for_ratio` / `for_balance`（exa 的 `status_for_cost` 替换为 `for_ratio`）。
- 阈值判定行为不变；测试复用既有阈值断言。

## 非范围

- 不改其他模块；不改 `connector-thresholds.ts` 与 `host-io.ts` 的接口。

## 验收标准

- [ ] 上述 8 个连接器源码 grep 无 `status_for_pct` / `status_for_ratio` / `status_for_balance` / `status_for_cost` 内联函数定义残留。
- [ ] 8 个连接器阈值判定均经 `ctx.status.*` 调用；既有阈值断言测试不改动即通过。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无外部依赖。
