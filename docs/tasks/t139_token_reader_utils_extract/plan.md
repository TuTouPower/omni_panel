# Task plan

## 步骤与验证

1. 确认三个 reader helper 逐字等价 → 验证：函数体与调用语义一致。
2. 提取 `calendar_date_of`、`num` 并替换 import → 验证：无本地重复定义。
3. 运行 token-stats 定向测试和 `pnpm test` → 验证：统计结果不变。

## 风险与回退

- 风险：误提取消息结构不同的 helper。
- 回退：仅回退 imports 与新 utility；不触碰 `extract_user_text`。

## Finalization 时更新的 blueprint

- 无。
