# Task plan

## 步骤与验证

1. 在 `ProviderCard` 中添加副作用：当 `expanded === false` 时调用 `set_l2open(false)`（可用 `useEffect` 依赖 `expanded`）→ 验证：新增单测「展开 → 切账号明细 → 折叠 → 再展开」断言回到概览。
2. 单测模拟序列：
    - `render(<ProviderCard expanded onToggleExpand={fn} />)`
    - `fireEvent.click(screen.getByTitle("账号明细"))` → 断言显示账号明细。
    - `rerender(<ProviderCard expanded={false} onToggleExpand={fn} />)` → 折叠。
    - `rerender(<ProviderCard expanded onToggleExpand={fn} />)` → 再展开。
    - 断言显示概览，L2 高亮在「概览」。
3. `pnpm test` 全量。

## 风险与回退

- 风险：`useEffect` 触发时序问题导致闪烁。
    - 缓解：折叠时 L2 seg 本来就不渲染，重置发生在折叠期间，展开时已是 `l2open=false`，无闪烁。
- 风险：mirror 渲染（`force_collapse` 分支）意外触发 reset。
    - 缓解：mirror 不挂 `expanded` prop（`expandedProviders={is_live ? expanded_providers : undefined}`），`expanded === false` 判断只在 live 树生效。
- 回退：revert commit。

## Finalization 时更新的 blueprint

- 无（纯组件行为修复）。
