# p116 danger Button 暗色对比 2.78 低于 3.0 大字线

- 来源：t283 review Round 2 提示（t268 token 基线）
- 内容：danger 按钮 `bg-[var(--color-error)] text-[var(--color-on-primary)]`，暗色 error-dark=#ff6b6b，白字对比 2.78 < DESIGN 3.0 大字验收线。t283 e2e 未取样 danger 按钮故未红。需调暗 error-dark 或按钮特调；注意 error-dark 也用于错误文字（调暗提升文字对比，方向一致，需复核）。
- 处理：未开
