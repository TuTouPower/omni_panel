---
tid: t120
slug: multi_account_overview_risk_color
---

# Task plan

## 步骤与验证

1. 为多账号概览写失败回归：51% 聚合、单账号 83% 且周期已过约 27% 时 `risk-projected` 期望红色 → 验证：定向组件测试先失败。
2. 提取/扩展纯风险计算，按账号计算后取最高风险 → 验证：`risk-current`、`risk-projected`、`nine-cycle` 的纯函数测试通过。
3. 将概览条接入风险色结果，保持聚合数值文本 → 验证：ProviderCard 渲染测试覆盖概览和账号明细。
4. 覆盖无 reset/cycle、混合有效与无效账号边界 → 验证：对应定向测试通过。
5. 执行质量门与测试实例验证 → 验证：`pnpm typecheck`、`pnpm test`，并确认 Kimi 概览与账号明细颜色符合规则。

## 风险与回退

- 风险：概览颜色与聚合数字语义不同，用户可能误认为颜色代表总额度。
- 缓解：保留聚合数字，并在实现阶段评估是否需添加可访问的风险来源说明。
- 回退：概览条恢复聚合百分比的既有着色；不改变 observation 或 config 数据。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：记录多账号概览值与风险色的聚合规则。
- `docs/guides/testing.md`：无。
