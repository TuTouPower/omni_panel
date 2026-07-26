---
tid: t120
slug: multi_account_overview_risk_color
---

# Task spec

## 背景

Kimi 多账号概览将周额度汇总为 203/400（51%），而其中两个账号已用 83%。当前概览条只按汇总百分比着色，且丢失子账号周期信息，导致 `risk-projected` 退回低风险颜色；用户看不到任一账号已处于高风险状态。

## 范围

- 多账号同标签概览保留聚合用量数值和展示文案，同时基于该标签下各账号分别计算风险色。
- `risk-current` 和 `risk-projected` 均选择各账号中最高风险级别作为概览条颜色；`nine-cycle` 保持既有按索引配色。
- `risk-projected` 使用每个账号自身的 `used`、`limit`、`resetAt`、`cycleDurationMs` 计算预测风险，不用聚合记录推导周期。
- 对缺失/无效周期信息的账号按当前用量风险参与比较；不得因单个无效账号阻断其他账号的有效预测风险。
- 补 Kimi 多账号回归：汇总值低风险但存在 83% 且周期已过约 27% 的账号时，`risk-projected` 概览条为红色。

## 非范围

- 不改变主面板概览显示的总 used/limit 数字。
- 不改 60/85/95 风险色阈值，不改 connector status 阈值。
- 不改单账号详情条的颜色计算规则。

## 验收标准

- [ ] Kimi 多账号 `weekly` 汇总 51%，包含 83% 高风险账号时，`risk-projected` 概览条按最高风险账号显示红色。
- [ ] `risk-current` 概览条按最高单账号当前用量风险着色；`nine-cycle` 输出保持不变。
- [ ] 任一账号缺失 `resetAt` 或 `cycleDurationMs` 时，其他账号仍可提供预测风险色。
- [ ] 账号均无有效周期时，概览按最高单账号当前用量风险着色。
- [ ] 多账号概览的总用量文本仍为聚合值，单账号详情不回归。
- [ ] 定向 renderer 单测、`pnpm typecheck` 与 `pnpm test` 通过。

## 依赖与约束

- 依赖 t119 不成立；本 task 可独立实施与验证。
- 颜色结果必须由纯函数计算，避免在 React 渲染路径重复、分叉风险规则。
- 不读取或持久化任何账号 secret。
