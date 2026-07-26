# Task spec

## 背景

review_20260726_054747 采纳项 12、19：`observation_to_metric_record` 返回类型虚假可空；`cycleDurationMs` schema 允许负值但类型契约要求 >= 0。

## 范围

- `observation-mapping.ts` 返回类型改 `MetricRecord`，删调用方 `if (record)` 死分支及 `null-filtering` 注释。
- `observation.ts` `cycleDurationMs` 改 `finite_number.nonnegative().nullable().optional()`；补负数拒绝、null/零/正数通过测试。

## 非范围

- 不改聚合逻辑。

## 验收标准

- [ ] 返回类型与实现一致，无残留 null 分支。
- [ ] 负 `cycleDurationMs` 被 schema 拒绝，测试通过。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 无。
