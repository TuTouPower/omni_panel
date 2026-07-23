# Task plan

## 步骤与验证

1. 跑 popup 相关单测确认基线绿（`popup_view*.test.tsx` 等）→ 验证：基线全绿。
2. 抽本地 helper（`errorMessage` / `structural_signature` / `arrays_equal` / `account_orders_equal`）为独立模块 → 验证：`pnpm typecheck` 通过。
3. 按区块抽子组件 / 复合 hook 收敛装配层，hook 调用顺序保持不变 → 验证：popup 单测绿。
4. 行数核验（`PopupView.tsx` ≤ 400 行或记录硬约束）→ 验证：`wc -l`。
5. 收尾复跑 `pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：hook 调用顺序改变引发渲染差异；子组件 props 透传漏项；镜像测高（popup-mirror）路径受影响。
- 回退：纯搬移改动，按 `git diff` 分块还原；单测红即回退到上一绿态。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：popup 视图层模块边界变化需同步；无变化则不更新。
