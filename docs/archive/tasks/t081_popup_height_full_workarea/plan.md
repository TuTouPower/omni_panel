# Task plan

## 步骤与验证

1. 红：改 `popup_height_controller.test.ts` 上限断言（>75%<100% 锁内容高、>100% 锁工作区全高、min>max 反转取 max）→ 验证：`pnpm vitest run tests/unit/main/popup_height_controller.test.ts` 失败。
2. 绿：`MAX_HEIGHT_RATIO` 改 1.0 + 注释同步 → 验证：单测转绿。
3. e2e：更新 `popup_window_constraints.spec.ts` 中 75% 断言并实跑 electron e2e → 验证：通过。
4. 全仓 grep `0.75` / `MAX_HEIGHT_RATIO` / `75%` 确认无遗漏引用（含 docs）→ 验证：仅剩无关命中。
5. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：e2e 多显示器场景（`popup_multi_display.spec.ts`）对高度有隐式依赖；全高弹窗在 macOS 遮托盘锚点的观感回归。
- 回退：改动集中在常量 + 注释 + 测试，`git checkout` 还原。

## Finalization 时更新的 blueprint

- `docs/blueprint/`：如架构/约定文档记有 75% 上限口径，同步为工作区全高；无则不更新。
