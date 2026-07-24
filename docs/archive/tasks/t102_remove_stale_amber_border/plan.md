# Task plan

## 步骤与验证

1. 删 `src/renderer/styles/globals.css:615-617` `.card.stale { border-color: ... }` 规则 → 验证：手工触发 stale（如断网刷新）查看卡片外圈无黄框。
2. grep `ProviderAccountRow` / 其他组件是否引用 `.stale` class 且依赖该 CSS：
    - `ProviderCard.tsx:117` 仍输出 `stale` class（保留 class 以备后续使用，或一并删除 class 输出）。
    - `ProviderAccountRow.tsx:126` 输出 `stale` class。
    - 决策：保留组件 class 输出（无 CSS 规则时无副作用），仅删 CSS 规则 → 最小改动。
3. grep 测试断言 `.card.stale` / `toHaveClass("stale")` 用例 → 验证：若仅断言 class 存在仍可保留；若断言 border 样式需删除。
4. `pnpm test` 全量。

## 风险与回退

- 风险：用户可能后续想恢复视觉提示。
    - 缓解：保留 `.stale` class 输出，CSS 规则易恢复。
- 风险：dark/light 主题变量未清理。
    - 缓解：本 task 只删一条 border-color 规则，不涉及主题变量定义。
- 回退：revert commit。

## Finalization 时更新的 blueprint

- 无。
