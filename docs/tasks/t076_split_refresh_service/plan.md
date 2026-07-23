# Task plan

## 步骤与验证

1. 跑既有单测确认基线绿（`pnpm vitest run tests/unit` 相关子集）→ 验证：基线全绿。
2. 拆出错误分类与路径解析 helper（`is_auth_error` / `is_connection_error` / `resolve_script_path` / `last_success_snapshot`）→ 验证：`pnpm typecheck` 通过。
3. 拆出 params 构造（`build_params`）与 connector 执行（`execute_connector`）→ 验证：相关单测绿。
4. `createRefreshService` 保留编排壳，从子模块 import；各文件 ≤ 400 行 → 验证：`wc -l` 检查 + 全量 `pnpm test`。
5. 收尾复跑 `pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：循环 import（编排模块与子模块互相引用）；子模块抽离后闭包依赖漏传。
- 回退：拆分是纯搬移，`git diff` 可逐块还原；任一阶段测试红即回退到上一绿态。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如 refresh 编排模块边界变化，同步模块清单；无变化则不更新。
