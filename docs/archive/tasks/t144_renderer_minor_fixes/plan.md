# Task plan

## 步骤与验证

1. 先补布尔记录 key 顺序测试 → 验证：现 JSON stringify 比较失败。
2. 实施浅比较、声明顺序、noopener 与分隔符字段小修 → 验证：行为测试与分隔符数量不变。
3. 运行 renderer 定向测试和 `pnpm test` → 验证：无 UI 回归。

## 风险与回退

- 风险：菜单分隔符位置偏移；比较函数漏处理 key 数量。
- 回退：逐项独立回退，保留可证明行为的测试。

## Finalization 时更新的 blueprint

- 无。
