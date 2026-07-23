# Task plan

## 步骤与验证

1. 研读 TikHub 文档（已完成，subagent）：`GET /api/v1/tikhub/user/get_user_info`，Bearer，`user_data.balance`/`free_credit`/`email` -> 验证：结论已记入 spec 背景与 task.md 过程记录
2. 写 `connectors/tikhub/manifest.json`（API_KEY/LIMIT，default=`https://api.tikhub.io`） -> 验证：schema 校验
3. 写 `connectors/tikhub/connector.ts`：GET `/api/v1/tikhub/user/get_user_info`，Bearer；balance + free_credit 两 metric；account_id=email；余额反向 status -> 验证：typecheck
4. 契约测试 fixture（正常/错误码/email 缺失回退） -> 验证：`pnpm exec vitest run connectors/tikhub`
5. 黑盒：真实 token 跑一次确认 balance 数值合理 -> 验证：observation.used 接近 dashboard

## 风险与回退

- 风险：email 字段缺失导致 account_id 回退固定字符串（多实例 collapse）
- 回退：回退 `tikhub` 并标注，但优先 email；或对 token 做 hash 作稳定后缀

## Finalization 时更新的 blueprint

- `docs/blueprint/connectors.md`：tikhub 条目（余额型 USD，balance + free_credit 双 metric，account_id=email）
