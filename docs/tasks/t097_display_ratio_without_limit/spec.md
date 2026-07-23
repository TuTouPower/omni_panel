# Task spec

## 背景

OmniUsage 用量面板的 `UsageBarRow` 把 `used/limit` 渲染为百分比或比例。当 `displayStyle` 为 `"ratio"` 但 `limit` 为 `null` 或 `≤0` 时，`percent()` 直接返回 `0`，`is_ratio` 为 false，最终显示为 **`0%`**。这对余额类、成本类指标具有误导性：用户明明有余额/用量，界面却显示为 0。

受影响场景（经全仓排查）：

| 连接器 | 指标 | limit 何时为 null |
| ------ | ---- | ----------------- |
| getoneapi | 余额 (CNY) | 用户未填 `LIMIT` |
| tikhub | 付费余额 (USD) | 用户未填 `LIMIT`；`free_credit` 永远无 limit |
| exa | 总成本 (USD) | 用户未填 `LIMIT`；breakdown 子项永远无 limit |
| codex | 每日各 model token 用量 | 本地日志无 limit 概念，永远为 null |

mimo / deepseek 当前通过硬编码 `DEFAULT_LIMIT = 100` 规避了该问题，但这是错误做法：用户没设置上限时，界面应如实显示为无上限的原始数值，而不是伪造一个 100 的默认上限。

## 范围

- 修改 `src/renderer/components/UsageRows.tsx`：
  - 当 `displayStyle === "ratio"` 且 `limit` 无效（`null` 或 `≤0`）时，显示原始 `used` 数值（例如 `4.84`），而不是 `0%`。
  - 进度条宽度此时可固定为 0 或隐藏，但数值必须可读。
- 修改 `src/renderer/lib/provider-usage.ts`：
  - `build_overview_for_group` 中的 `has_valid_quota` 不应把「有 used 但无 limit」的 ratio 周期过滤掉，否则概览会显示「暂无有效用量数据」。
- 修改 `connectors/mimo/connector.ts` 与 `connectors/deepseek/connector.ts`：
  - 删除硬编码 `DEFAULT_LIMIT = 100`。
  - 用户未设置 `LIMIT` 时，`limit` 应为 `null`，`status` 为 `"unknown"`，与 getoneapi / exa / tikhub 保持一致语义。
- 新增/更新测试覆盖上述无 limit 场景以及 mimo / deepseek 的 LIMIT 缺失行为。

## 非范围

- 不改 `MetricRecord` schema 或新增 `displayStyle`。
- 不改动 percent/ratio 语义本身（有 limit 时仍按原逻辑渲染）。
- 除 mimo / deepseek 删除 `DEFAULT_LIMIT` 外，不改其他连接器内部逻辑。

## 验收标准

- [ ] getoneapi 未填 LIMIT 时，面板显示余额原始值（如 `4.84`），而非 `0%`。
- [ ] tikhub 的 `free_credit`、exa 的 breakdown 子项、coded 的每日 token 在无限时也能显示原始值。
- [ ] mimo / deepseek 删除 `DEFAULT_LIMIT`；未填 LIMIT 时 `limit=null`、`status="unknown"`。
- [ ] 有 limit 的 ratio 指标保持原有 `used/limit` 或百分比展示不变。
- [ ] `UsageRows` / `provider-usage` 相关单元测试覆盖无 limit 场景；mimo / deepseek 测试更新以反映无 default limit。
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm lint` 全绿。

## 依赖与约束

- 需确保修改后 `build_overview_for_group` 的概览聚合逻辑仍正确，避免把无 limit 的周期错误参与百分比汇总。
- 视觉样式保持现有设计系统，不引入新的颜色或布局。
