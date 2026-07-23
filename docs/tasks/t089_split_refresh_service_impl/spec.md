# Task spec

## 背景

承接 t076（spike close 评估型关闭，commit `1a0fb27`，未实施即归档），本 task 为 impl 落地。`refresh-service.ts` 450 行，超 400 行 minor 阈值。职责：重试骨架 + params 构造 + connector 执行 + failed_accounts stale + 零观测兜底 + 并发 refreshAll。

## 范围

- 抽 `error-classification.ts`（is_auth_error/is_connection_error）+ `connector-execution.ts`（build_params/execute_connector）；refresh-service.ts re-export 兼容。行为不变，测试仅调 import 路径。

## 非范围

- 不改其他模块；不改变任何运行时行为（重试策略、超时、日志、failed_accounts 语义、零观测兜底）。

## 验收标准

- [ ] `error-classification.ts` 与 `connector-execution.ts` 拆出，`refresh-service.ts` re-export 保持对外 API（`createRefreshService` / `RefreshServiceDeps` / `ConnectorRefreshService` / 错误分类函数）签名不变。
- [ ] 拆分后 `refresh-service.ts` 与新拆出的每个实现源码文件均 ≤ 400 行（`wc -l` 核验）。
- [ ] 既有单测不改动断言即全绿（仅允许调整 import 路径）。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

## 依赖与约束

- 无外部依赖；先于 t084（per-account error 改造）执行可避免大面积冲突。
