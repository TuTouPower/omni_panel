# Task plan

## 步骤与验证

1. **实测字段**（前置）：用用户提供的真实 API_KEY 跑 `POST https://api.getoneapi.com/back/user/balance`，确认 `data` 真实结构（余额字段名/类型） -> 验证：字段名写入 task.md 过程记录
2. 写 `connectors/getoneapi/manifest.json`（API_KEY/LIMIT，default=`https://api.getoneapi.com`） -> 验证：schema 校验
3. 写 `connectors/getoneapi/connector.ts`：POST `/back/user/balance`，Bearer；余额反向 `status_for_balance` -> 验证：typecheck
4. 契约测试 fixture（基于实测响应） -> 验证：vitest run
5. 黑盒：真实 key 跑一次确认余额数值合理 -> 验证：observation.used 接近 dashboard 显示

## 风险与回退

- 风险：文档示例 `data:{}` 空，字段名臆测错误
- 回退：必须先实测再写映射；实测前不推进 Step 3

## Finalization 时更新的 blueprint

- `docs/blueprint/connectors.md`：getoneapi 条目（余额型 CNY）
