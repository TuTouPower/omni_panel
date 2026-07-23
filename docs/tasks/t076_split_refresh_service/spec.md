# Task spec

## 背景

t039 review finding `t039_code_f002`（minor，遗留）：`src/main/core/scheduler/refresh-service.ts` 在 t039 时 418→445 行，已超实现源码 400 行 minor 阈值；当前 450 行，仍超阈值。单文件承担：重试骨架、params 构造、connector 执行、failed_accounts stale 复制、零观测兜底、并发 refreshAll，职责偏多。t039 处置结论：拆分属独立重构，不绑原 task。

## 范围

- 将 `refresh-service.ts` 按职责拆为多个模块（候选边界：错误分类 helper（`is_auth_error` / `is_connection_error`）、params 构造（`build_params`）、connector 执行（`execute_connector`）、refresh 编排（`createRefreshService`）），使各实现源码文件 ≤ 400 行。
- 拆分后导出接口保持兼容，调用方（`src/main/index.ts` 及测试）无需感知文件移动。
- 迁移/调整相关单测 import 路径，行为不变。

## 非范围

- 不改变任何运行时行为（重试策略、超时、日志、failed_accounts 语义、零观测兜底逻辑）。
- 不处理其他超阈值文件（`index.ts` 见 t077，`PopupView.tsx` 见 t078）。

## 验收标准

- [ ] `refresh-service.ts` 拆分后每个实现源码文件 ≤ 400 行。
- [ ] 对外 API（`createRefreshService` / `RefreshServiceDeps` / `ConnectorRefreshService` / 已导出的错误分类函数）签名与语义不变。
- [ ] 既有单测全绿（`pnpm test`），必要时仅调整 import 路径。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

## 依赖与约束

- 无前置 task；不依赖网络。
- 纯文件搬移 + 导出重定向，遵循 TDD：先跑既有测试确认基线绿，再拆分，再复跑。
