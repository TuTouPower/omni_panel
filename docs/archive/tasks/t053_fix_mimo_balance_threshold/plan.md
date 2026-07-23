# Task plan

## 步骤与验证

1. 写失败测试：mimo balance 阈值边界（0.01 critical / 充足 normal / limit 缺失 normal） -> 验证：vitest 红（现实现 0.01 仍 normal）
2. 加 `status_for_balance(balance, limit)`（若项目无共享 helper）：limit<=0 normal；ratio<=0.1 critical；<=0.2 warning；否则 normal -> 验证：typecheck
3. line 160 改用 `status_for_balance(balance, limit)` -> 验证：测试绿
4. 回归：mimo usage items status 不变 -> 验证：现有 mimo 测试全绿

## 风险与回退

- 风险：与未来 P5 阈值集中化重复
- 回退：本 task 内联 helper，P5 集中化时统一抽出，不冲突

## Finalization 时更新的 blueprint

- 无（连接器逻辑修复，不改架构约定）
