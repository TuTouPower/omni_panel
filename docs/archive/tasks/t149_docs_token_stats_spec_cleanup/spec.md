# Task spec

## 背景

review_20260726_054747 采纳项 6：`ai-cli-token-stats-api.md` §11 Phase 4 Task 4.1 仍要求创建 `aggregator.ts`，与同 spec §4 及 architecture「聚合内联 collector.ts」矛盾。

## 范围

- Phase 4 Task 4.1 改为「聚合逻辑已按 §4 内联 collector.ts，不创建 aggregator.ts」；同步后续前置依赖。

## 非范围

- 不改 collector.ts 实现。

## 验收标准

- [ ] §11 不再要求创建独立 aggregator.ts，与 §4 一致。

## 依赖与约束

- 无。
