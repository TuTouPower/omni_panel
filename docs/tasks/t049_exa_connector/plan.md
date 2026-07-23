# Task plan

## 步骤与验证

1. 读 exa 文档示例响应，定字段映射（total_cost_usd / cost_breakdown[] / period） -> 验证：字段表写入 task.md 过程记录
2. 写 `connectors/exa/manifest.json`（SERVICE_KEY/API_KEY_ID/LIMIT，endpoints default=`https://admin-api.exa.ai`） -> 验证：manifest schema 校验通过
3. 写 `connectors/exa/connector.ts`：GET `/team-management/api-keys/{API_KEY_ID}/usage`，header `x-api-key`；映射 total + breakdown；status 正向 `status_for_cost` -> 验证：typecheck
4. 契约测试 fixture（正常/零用量/错误码） -> 验证：`pnpm exec vitest run connectors/exa`
5. 黑盒：配真实 key 跑一次（或 fixture 覆盖） -> 验证：observation 返回符合 spec

## 风险与回退

- 风险：文档示例字段与实测不符（period 对象缺失/breakdown 字段名差异）
- 回退：以实测为准，更新 spec 字段表 + blueprint `connectors.md`

## Finalization 时更新的 blueprint

- `docs/blueprint/connectors.md`：exa 连接器条目（成本型、无远端 limit、用户自定预算）
