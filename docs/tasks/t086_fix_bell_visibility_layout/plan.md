# Task plan

## 步骤与验证

1. 读 spec 涉及代码 + 定位 -> 验证：file:line 确认
2. 写失败测试 -> 验证：vitest 红
3. 实现至测试通过 -> 验证：vitest 绿 + typecheck
4. 黑盒 pnpm test -> 验证：通过

## 风险与回退

- 风险：见 spec 依赖与约束
- 回退：git revert 本 task commit

## Finalization 时更新的 blueprint

- 按实际改动更新对应 blueprint/specs 条目
