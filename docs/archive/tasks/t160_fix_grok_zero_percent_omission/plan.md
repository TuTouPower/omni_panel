# Task plan

## 步骤与验证

1. 在 `tests/integration/connector/grok_connector.test.ts` 先增加真实脱敏 0% credits fixture：`currentPeriod` 完整、`creditUsagePercent` 缺失、on-demand/prepaid 为 0 → 验证：旧实现应红灯，当前会得到 failed_account 而非 0% observation。
2. 增加边界测试：显式 `creditUsagePercent=0`、非零 percent、缺失 percent 且缺失周期、仅含 deprecated `monthlyLimit/used` → 验证：分别锁定 0%、现有行为、failed/stale、防止遗留金额误映射。
3. 扩展 `connectors/grok/connector.ts` 的 credits 类型与解析：读取 `currentPeriod.type/start/end`；字段缺失且周期有效时按 proto3 默认值解释为 0 → 验证：专项 connector 测试转绿。
4. 将总额度 observation 的 `reset_at` 优先绑定 `currentPeriod.end`，`window` 按 period type 映射；保留旧 `billingPeriodEnd` 兼容路径和 `productUsage` 行为 → 验证：weekly reset、旧 fixture、产品指标回归均通过。
5. 收紧未知响应判据：只有缺少有效 usage 且无法由有效 `currentPeriod` 证明 0% 时才 `report_failed_account` → 验证：t039 零观测测试继续 failed/stale，不出现 `ready + []`。
6. 使用当前正式 Grok 登录执行真实刷新 → 验证：日志显示 ≥1 valid observation；主面板 weekly `0%` 与网页重置时间一致；不记录 secret 或完整响应。
7. 运行 `pnpm vitest run tests/integration/connector/grok_connector.test.ts`、相关 refresh-service 回归、`pnpm test` 与 `pnpm check` → 验证：专项与全量门禁结果如实记录。
8. 按单 task 工作流执行 packaged 黑盒与双审 → 验证：`pnpm test:packaged` 通过；code/test reviewer verdict 均 PASS，findings 全部进入 `task.md` 唯一处置表。
9. Finalization 修正文档中的错误语义并归档 task → 验证：搜索旧表述，不再把合法 weekly 0% 响应描述为“无可用额度”。

## 实现判据

- `creditUsagePercent` 为 number：使用显式值，包括 `0`。
- `creditUsagePercent` 缺失且 `currentPeriod` 完整有效：解释为 proto3 省略的 `0`。
- `creditUsagePercent` 缺失且 `currentPeriod` 无效/缺失：未知响应，保留 failed/stale。
- `monthlyLimit` / `used` 即使存在也不参与 weekly percent observation。
- `USAGE_PERIOD_TYPE_WEEKLY` 映射 `week`；若支持已知 monthly 类型则映射 `month`，未知类型不猜测。

## 风险与回退

- 风险：对任意字段缺失都回填 0 会掩盖未来 schema 漂移。缓解：只在 `currentPeriod` 类型、起止时间完整有效时解释为 protobuf 默认零值。
- 风险：修改 reset 字段优先级可能影响旧响应。缓解：新增新旧响应并行测试，保留 `billingPeriodEnd` 兼容 fallback。
- 风险：deprecated 金额字段名称看似可计算百分比，易再次误用。缓解：spec、代码注释与测试共同明确 USD cents/月度遗留语义。
- 回退：若真实验证与网页不一致，恢复旧 parser 并保留新增 fixture/诊断证据，task 转 blocked，不以 deprecated 金额数据替代。

## Finalization 时更新的 blueprint

- `docs/specs/connector-direct.md`：将 Grok 全零 unified billing 的错误语义改为 proto3 0% 省略规则与未知响应判据。
- `docs/specs/fix_grok_oauth_binding_billing_parse.md`：更正 t159 将合法 0% 响应归类为无可用额度的结论，保留 OAuth 修复部分。
- `docs/blueprint/conventions.md`：更新 Grok connector credits 字段、周期映射、protobuf 默认零值和 deprecated 字段禁用规则。
- `docs/specs_index.md`：task 完成时把 t160 累积到相关生效 spec。
- `docs/bugs.md`：若已有对应未修条目，在原条目追加修复行；不存在则无需补历史条目。
