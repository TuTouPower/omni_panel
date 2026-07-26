# Task spec

## 背景

review_20260726_054747 采纳项 27：renderer 存量 snake_case/camelCase 混用，不做全量迁移，采用随触碰迁移策略，需写入 conventions。

## 范围

- `docs/blueprint/conventions.md` 记录：新代码一律 `snake_case`；存量 `camelCase` 在后续修改相关代码时迁移所触及符号，不做专项全量迁移。

## 非范围

- 不改任何 renderer 源码命名。

## 验收标准

- [ ] conventions.md 明确记录命名迁移策略。

## 依赖与约束

- 仅文档。
