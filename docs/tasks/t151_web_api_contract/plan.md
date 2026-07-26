# Task plan

## 步骤与验证

1. 先补 session 返回值与缺失成员契约测试 → 验证：现实现失败。
2. api 直接标注 UsageboardApi，补 stub、修正返回类型、get_json 加泛型 → 验证：去强转后 typecheck 通过。
3. 运行 web 定向测试与 `pnpm test` → 验证：无 runtime TypeError。

## 风险与回退

- 风险：stub 返回语义影响 web UI 分支。
- 回退：逐成员回退，保留契约测试定位不兼容点。

## Finalization 时更新的 blueprint

- 无。
