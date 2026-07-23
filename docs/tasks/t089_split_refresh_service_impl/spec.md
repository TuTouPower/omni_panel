# Task spec

## 背景

refresh-service.ts 450 行，超 400 行 minor 阈值。职责：重试骨架 + params 构造 + connector 执行 + failed_accounts stale + 零观测兜底 + 并发 refreshAll。

## 范围

- 抽 error-classification.ts（is_auth_error/is_connection_error）+ connector-execution.ts（build_params/execute_connector）；refresh-service.ts re-export 兼容。行为不变，测试仅调 import 路径。

## 非范围

- 不改其他模块。

## 验收标准

- [ ] 见范围具体条目。
- [ ] pnpm test / typecheck / lint 全绿。

## 依赖与约束

- 无外部依赖。
