# Task plan

## 步骤与验证

1. 确认 SPA 渲染 failed connector 的 DOM（ProviderAccountRow `.card-state.err`）→ 验证：grep/读源
2. gen_synthetic push 手造 failed connector + state → 验证：重跑产 synthetic.json 含 failed
3. 写 web/plugin_failure_modes.spec.ts（failed card 断言）→ 验证：test:e2e:web 绿
4. 删 electron/plugin_failure_modes.spec.ts → 验证：electron --list 不含
5. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：SPA 对 failed+空items 渲染逻辑不同于预期（可能渲染空 card 非 err）→ 看 ProviderAccountRow 调整断言或造 items 带 error
- 回退：失败则 plugin_failure_modes 留 electron（T016 决策）

## Finalization 时更新的 blueprint

- 无
