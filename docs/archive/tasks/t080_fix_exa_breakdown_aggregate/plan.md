# Task plan

## 步骤与验证

1. 红：`exa-api-response.json` 脱敏移入测试目录；`exa_connector.test.ts` 加真实形态用例（期望 3 行聚合 + 数额 + 总和守恒 + metric_id 稳定）→ 验证：`pnpm vitest run tests/integration/connector/exa_connector.test.ts` 失败。
2. 绿：connector 按 price_name 聚合，metric_id 改 price_name 归一化派生 → 验证：新用例转绿，既有用例不红。
3. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：metric_id 变更使旧历史按旧 key 断档（可接受，价格项本就是展示维度）；price_name 归一化冲突（大小写/空白差异同名合并）。
- 回退：改动集中于 connector 单文件 + 测试，`git checkout` 还原。

## Finalization 时更新的 blueprint

- `docs/specs/` 对应 exa spec 累积：补 cost_breakdown 按 price_name 聚合的口径说明。
