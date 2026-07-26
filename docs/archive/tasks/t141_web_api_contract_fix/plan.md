# Task plan

## 步骤与验证

1. 先补 session 返回值与缺失 API 成员契约测试 → 验证：现实现失败。
2. 用 `UsageboardApi` 直接约束 api 对象，补 stub 与修正返回类型 → 验证：移除双重强转后 typecheck 通过。
3. 运行 web 定向测试和 `pnpm test` → 验证：无 runtime TypeError。

## 风险与回退

- 风险：stub 返回值语义影响 web UI 分支。
- 回退：逐成员回退实现，但保留契约测试定位不兼容点。

## Finalization 时更新的 blueprint

- 无。
