# Task plan

## 步骤与验证

1. 在 conventions 编码规范加入「新代码 snake_case，存量随触碰迁移」 → 验证：不要求专项全量改名且与全局命名规则一致。
2. 搜索相邻命名规则 → 验证：无重复或矛盾定义。

## 风险与回退

- 风险：「随触碰」范围含糊导致无关大改。
- 回退：收窄为仅修改所在语义块直接涉及的符号。

## Finalization 时更新的 blueprint

- `docs/blueprint/conventions.md`：renderer 存量命名迁移策略。
