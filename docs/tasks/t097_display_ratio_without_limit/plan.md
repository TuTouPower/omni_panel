# Task plan

## 步骤与验证

1. **UI 显示修复**：`src/renderer/components/UsageRows.tsx`
   - 调整 `percent()` 或 `UsageBarRow` 取值逻辑：当 `displayStyle === "ratio"` 且 `limit` 无效时，value 显示原始 `used`（如 `4.84`），而非 `0%`。
   - 进度条 fill 宽度保持 0（因为没有分母），但标签右侧显示原始数值。
   → 验证：在 `common_services.test.ts` 或新增 `UsageRows` 单测中构造 `displayStyle="ratio"`、`limit=null`、`used=4.84`，断言渲染文本为 `4.84`。

2. **概览过滤修复**：`src/renderer/lib/provider-usage.ts`
   - 修改 `has_valid_quota`：ratio 类型且 `used` 有效时，即使 `limit` 为 null 也应视为有效（仅用于展示，不参与百分比汇总）。
   - 或调整 `build_overview_for_group`：无 limit 的 ratio 周期单独作为「原始数值」条目进入 overview，不计算 percent/limit。
   → 验证：`provider-usage` 单测新增无 limit ratio 周期，断言 overview periods 包含该条目且 `percent/limit` 为 null，不显示「暂无有效用量数据」。

3. **连接器清理**：`connectors/mimo/connector.ts` 与 `connectors/deepseek/connector.ts`
   - 删除 `DEFAULT_LIMIT = 100`。
   - 引入与 getoneapi 一致的 `parse_limit`：未填 / 非数 / ≤0 返回 0，并据此设 `limit = null`、`status = "unknown"`。
   → 验证：更新 mimo / deepseek 集成测试，覆盖 LIMIT 缺失场景；`pnpm test` 对应 connector 测试通过。

4. **回归检查**
   - 运行 `pnpm test`、`pnpm typecheck`、`pnpm lint`。
   → 验证：全绿。

## 风险与回退

- 风险：`has_valid_quota` 改动影响 overview 聚合，可能把无 limit 周期错误地纳入百分比分母（如果代码没处理好）。
- 风险：mimo / deepseek 删除默认 limit 后，老用户未填 LIMIT 的账号会从 `4.84/100` 变成只显示 `4.84`，属于语义修正但视觉上变化明显。
- 回退：如产生回归，可 `git diff` 分块还原 UI 与连接器改动。

## Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：如修改了 `MetricRecord` 展示语义，可补充 ratio/percent 展示规则；无则不更新。
