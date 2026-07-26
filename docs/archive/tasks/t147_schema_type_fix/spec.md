# Task spec

## 背景

review_20260726_054747 采纳项 12、19、14（合并原 t138/t139）：`observation_to_metric_record` 返回类型虚假可空；`cycleDurationMs` schema 允许负值；三个 token reader 的 `calendar_date_of`/`num` 逐字重复。

## 范围

- `observation-mapping.ts` 返回类型改 `MetricRecord`，删调用方 `if (record)` 死分支及 `null-filtering` 注释。
- `observation.ts` `cycleDurationMs` 改 `finite_number.nonnegative().nullable().optional()`；补负数拒绝、null/零/正数通过测试。
- 新建 `reader-utils.ts` 导出 `calendar_date_of`、`num`；三 reader 改为 import，删本地副本。

## 非范围

- 不改聚合逻辑；不提取 `extract_user_text`。

## 验收标准

- [ ] mapping 返回类型与实现一致，无残留 null 分支。
- [ ] 负 cycleDurationMs 被 schema 拒绝，测试通过。
- [ ] 三 reader 共用同一 calendar_date_of/num，token-stats 测试不回归。
- [ ] `pnpm test` 通过。

## 依赖与约束

- 仅提取逐字等价 helper。
