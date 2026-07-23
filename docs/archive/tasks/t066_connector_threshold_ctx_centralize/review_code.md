# Task review t066（reviewer_focus: 代码）

- task：`t066_connector_threshold_ctx_centralize`
- spec：`docs/tasks/t066_connector_threshold_ctx_centralize/spec.md`
- diff_anchor：`64a9ad17884e2080a92cd1aebee4cdf5f0283865`
- target：`git diff 64a9ad17884e2080a92cd1aebee4cdf5f0283865`
- round：1
- reviewed_at：2026-07-24 01:30 UTC+8

## Findings

### t066_code_f001 - spec AC「全连接器用 ctx helper（替代内联）」未完成

- 严重度：important
- 位置：`connectors/{claude,grok,kimi,cpa,opencode_go,deepseek,getoneapi,tikhub,mimo,exa,firecrawl,glm,minimax,tavily}/connector.ts`（共 14 处内联 `status_for_*`）
- 问题：spec 验收标准第二条明确「全连接器用 ctx helper（替代内联）」，但所有连接器仍保留内联 helper，未切换到 `ctx.status.for_pct/for_ratio/for_balance`。grep 命中（节选）：
    - `connectors/claude/connector.ts:45-49` 内联 `status_for_pct`
    - `connectors/deepseek/connector.ts:29-35` 内联 `status_for_balance`
    - `connectors/exa/connector.ts:26-31` 内联 `status_for_cost`
    - `connectors/glm/connector.ts:83-90` 内联 pct + ratio
    - `connectors/mimo/connector.ts:54-63` 内联 ratio + balance
    - 其余 9 个连接器同样未迁移
- 建议：拆 follow-up task 逐连接器迁移，删内联改 `ctx.status.*`；本 task 若结束，spec AC 第二条须显式标注「遗留」并由 adoption 阶段裁决（已修/遗留/撤回）。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：1 条
- 范围外提示（不进 finding 表，供 follow-up 参考）：
    1. **deepseek 内联 `status_for_balance` 与新 helper 语义不一致**：`connectors/deepseek/connector.ts:30` 在 `limit<=0` 返回 `"normal"`，而 `src/shared/lib/connector-thresholds.ts:26` 新 helper 返回 `"unknown"`。follow-up 迁移时行为会变（normal→unknown），须产品决策。
    2. **exa 内联 `status_for_cost` 命名与 helper 不一致**：`connectors/exa/connector.ts:26` 命名 `status_for_cost`，语义对应 `for_ratio`。follow-up 迁移须映射重命名。
    3. **conventions.md 余额反向阈值未列具体数字**：`docs/blueprint/conventions.md:168` 仅说「余额型反向」，未明列 0.1/0.2。helper 与全部现存连接器实践一致用 0.1/0.2，但文档应补数字避免后续歧义。
- 核心机制评估：helper 逻辑正确（pct 90/75、ratio 0.9/0.75+limit<=0、balance 反向 0.1/0.2+limit<=0），ConnectorContext.status 注入正确（`net-client.ts:455-459` 注入、`runtime.ts:149` `...ctx` spread 继承、`refresh-service.ts:155` 生产路径覆盖），19 个测试文件 mock 适配完整（含 `grok_connector.test.ts` / `runtime.test.ts` 多 inline ctx 通过 `...create_ctx()` / `...stub_ctx` 自动继承）。helper 机制就绪可用，缺口仅在迁移未执行。
- 总体判断：spike 性质（helper + 注入 + 单测 + mock 适配）已达成且实现质量合格，但 spec AC 第二条「全连接器迁移」属范围内未完成项，须作为 important finding 进入 adoption 处置。

verdict: FAIL
