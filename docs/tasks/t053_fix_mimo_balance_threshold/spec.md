# Task spec

## 背景

review_20260723_opus C2（已主审验证）：`connectors/mimo/connector.ts:160` 余额状态判定方向用反——`status: balance >= 0 ? "normal" : "critical"`，余额 0.01 元（即将耗尽）仍标 normal，只有负数才 critical，违反 domain.md 余额型反向不变量（越低越危险）。同文件 `status_for_usage`（正向）已用于 usage items，但 balance 块未用反向判定。

## 范围

- `connectors/mimo/connector.ts` balance observation 的 status 改用余额反向判定。
- 新增 `status_for_balance(balance, limit)`（与 deepseek 同：`limit<=0 normal`；`ratio=balance/limit`；`<=0.1 critical`；`<=0.2 warning`；否则 `normal`），或复用项目已有同名 helper（若已抽出）。
- line 160 由 `balance >= 0 ? "normal" : "critical"` 改为 `status_for_balance(balance, limit)`。
- 单元/契约测试覆盖阈值边界。

## 非范围

- 不动 `status_for_usage`（usage items 正向判定正确）。
- 不动其他连接器（P5 阈值集中化另立 task）。
- 不重构 balance 块其余字段。

## 验收标准

- [ ] `balance/limit <= 0.1` → critical；`<=0.2` → warning；其余 normal；`limit<=0` → normal。
- [ ] 余额 0.01 / 充足 / limit 缺失三场景断言正确（断言期望行为，非遗留 bug 行为）。
- [ ] 现有 mimo 测试全绿，新增阈值边界测试通过。
- [ ] 不引入 usage items status 回归。

## 依赖与约束

- 无外部依赖；纯连接器逻辑修复。
- 若项目已有共享 `status_for_balance` helper（t054 后或 P5 集中化），优先复用；否则本 task 内联。
