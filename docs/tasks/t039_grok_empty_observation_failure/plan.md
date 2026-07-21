# Task plan

## 步骤与验证

1. 红灯：`tests/integration/connector/grok_connector.test.ts` 加 case "billing 200 但 creditUsagePercent 缺失且 productUsage 全无 usagePercent 时上报 failed_account" → 验证失败。
2. 红灯：`tests/integration/scheduler/refresh-service.test.ts` 加 case "脚本返回 0 observations + 0 failed_accounts 不应清空历史/标 ready 误导" → 验证失败。
3. connector 改造（`connectors/grok/connector.ts`）：汇总 `total_percent` 与 `productUsage` 后，若 `observations.length === 0`，`ctx.report_failed_account("grok","grok","SuperGrok","billing response has no usable usage fields")` 再 `return []`。
4. refresh-service 改造（`refresh-service.ts:298` 附近）：`observations_to_ready_state` 后若 `items.length === 0 && failed_accounts.length === 0`，不写 ready+空 items；改为保留 prior lastSuccess（已有 `last_success_snapshot` 机制）或标 failed（带语义错误）。优先保留历史（符合不变量 2）。
5. 绿灯：两测试通过；`pnpm test` 全绿。
6. 打包验证：`pnpm package` → 真实 Grok 账号场景 → 主面板显示失败/stale 而非"暂无账号"。

## 风险与回退

- 风险 A：合法"零用量"被误判失败（某 provider 真的没用量数据但接口正常）。→ 区分：Grok 语义是"百分比字段缺失"=接口异常，而非 used=0；仅对零有效字段触发，不动 used=0 的合法情况。
- 风险 B：refresh-service 改语义波及其他 connector。→ 仅对"零观测零失败"分支生效；有观测或有 failed 的路径不变。补集成测试覆盖。
- 风险 C：保留 lastSuccess 可能展示过旧数据误导。→ 配 stale 标记 + lastError 文案。
- 回退：connector 改动是脚本层（独立）；refresh 改动是单分支条件还原。

## Finalization 时更新的 blueprint

- `docs/blueprint/domain.md`：不变量 2 补"零有效观测视为采集异常，不得标 ready 清空历史"。
- `docs/blueprint/conventions.md`：连接器开发节补"空结果须 report_failed_account，不得静默返回空数组"。
