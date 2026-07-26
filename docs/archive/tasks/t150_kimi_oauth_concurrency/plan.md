# Task plan

## 步骤与验证

1. 先补 Kimi 登录/登出/刷新交错失败测试 → 验证：现实现下稳定失败。
2. 对齐 Grok 的 mutation queue、generation、refresh 去重 → 验证：新增测试转绿。
3. 运行 OAuth 定向测试与 `pnpm test` → 验证：无供应商行为回归。
4. 黑盒验证并双审 → 验证：按 task 流程门禁。

## 风险与回退

- 风险：异步时序测试不稳定；覆盖 Kimi 特有取消逻辑。
- 回退：保留失败测试，逐块回退 queue/dedup 实现。

## Finalization 时更新的 blueprint

- 视 OAuth 生命周期描述是否变化决定；仅修竞态则无。
