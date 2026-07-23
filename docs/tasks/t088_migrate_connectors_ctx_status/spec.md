# Task spec

## 背景

t066 spike 建好 connector-thresholds.ts 共享 helper + ConnectorContext.status 注入，但 9 个连接器仍内联 status_for_pct/ratio/balance，未改用 ctx.status。

## 范围

- 逐个连接器（claude/firecrawl/cpa/deepseek/exa/getoneapi/mimo/tikhub/kimi）删内联 helper，改用 ctx.status.for_pct/for_ratio/for_balance。测试复用既有阈值断言。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
