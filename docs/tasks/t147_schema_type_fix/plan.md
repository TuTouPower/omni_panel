# Task plan

## 步骤与验证

1. 先补负 cycleDurationMs 拒绝测试 → 验证：现 schema 下失败。
2. 加 nonnegative、收窄 mapping 返回类型、提取 reader helper → 验证：schema 测试转绿、无死分支、三 reader 共用。
3. 运行定向测试与 `pnpm test` → 验证：null/零/正数及统计结果不回归。

## 风险与回退

- 风险：历史数据含负 cycleDurationMs；误提取结构不同的 helper。
- 回退：仅回退 schema 约束或 imports；不触碰 extract_user_text。

## Finalization 时更新的 blueprint

- 无。
