# Task plan

## 步骤与验证

1. Edit `main-panel-controller.ts` L121 `"popup"`→`"usage"` → 验证：`grep -n "get_renderer_url" src/main/core/main-panel/main-panel-controller.ts`
2. Write `tests/unit/route_values.test.ts`（静态源码断言五处 route 值）→ 验证：`pnpm exec vitest run tests/unit/route_values.test.ts` 绿
3. `pnpm test` 全量 → 验证：全绿

## 风险与回退

- 风险：静态源码断言对格式敏感（改格式误红）；但守住 route 改名扩散，价值大于脆性（与 first_paint_theme 同风格）
- 回退：`git checkout src/main/core/main-panel/main-panel-controller.ts tests/unit/route_values.test.ts`

## Finalization 时更新的 blueprint

- 无
