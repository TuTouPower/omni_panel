# Task plan

## 步骤与验证

1. 先补负 `cycleDurationMs` 拒绝测试 → 验证：现 schema 下失败。
2. 加 nonnegative 约束并收窄 mapping 返回类型 → 验证：schema 测试转绿、TypeScript 无死分支。
3. 运行定向测试与 `pnpm test` → 验证：现有 null/零/正数行为不回归。

## 风险与回退

- 风险：历史数据含负值导致读取失败。
- 回退：确认输入边界后仅回退 schema 约束，保留类型清理。

## Finalization 时更新的 blueprint

- 无。
