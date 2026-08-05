# Task review t207（reviewer_focus: 代码）

- task：`t207_fix_trend_metric_id_mismatch`
- spec：`docs/tasks/t207_fix_trend_metric_id_mismatch/spec.md`
- diff_anchor：`c31389e9a1ff25e5280ebdf90d49ccc341196352`
- target：`git diff c31389e9a1ff25e5280ebdf90d49ccc341196352`
- round：1
- reviewed_at：2026-08-05 14:50 UTC+8

## Findings

无进表的 finding。以下为审阅结论与范围外观察。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：0 条。
- 未进表的提示：
    - **文件过大**：无。改动文件最大为新集成测试 `tests/integration/observation/trend-query-key.test.ts`（147 行），远低于测试源码 600 行阈值。
    - **圈复杂度**：无。改动函数（`observation_to_metric_record`、`to_period`、`ProviderAccountRow` 的 `fetch_bulk`）均无新增分支，未触及阈值。
    - **范围外观察（不进表）**：
        - `src/renderer/lib/provider-usage.ts:142` `to_period` 兜底 `item.metric_id ?? item.id`。runtime ready-state 路径下 `observation_to_metric_record` 总是填充 `metric_id`（`src/main/core/scheduler/observation-mapping.ts:26`），兜底仅在 plugin 脚本直接输出路径（schema optional）触发；该路径不经 observation-store，趋势查询恒空为预期行为。兜底不会掩盖 runtime 路径的键不一致（runtime 路径 metric_id 必填）。属 spec 已声明的设计权衡，非缺陷。
        - `tests/integration/scheduler/refresh-service.test.ts:780` fixture 中 `id: "mimo:mimo:mimo:usage"` 与 `metric_id: "mimo:mimo-1:usage"` 的 account_id 段不一致（`mimo` vs `mimo-1`），属既有 fixture 内部一致性问题，与本次修复的查询键链路无关（id 是复合键非查询键）。
- 规格合规核对（AC 全部覆盖，逐条）：
    - **AC1**（sparkline 渲染折线非占位）：`ProviderAccountRow.tsx:106-119` 改用 `period.metric_id` 作查询键，命中 observation-store 后返回非空序列，`valid_points.length >= 2` 时不再走占位分支；`provider_account_row.test.tsx:178-204` 断言 `.trend-svg` 存在且 `.trend-sparkline-empty` 不存在。
    - **AC2**（CPA Claude 与 opencode_go 两类 metric_id 形态）：集成测试 `trend-query-key.test.ts` 两个用例分别覆盖 `claude:acc-1:five_hour`（含 account_id 段）与 `opencode_go:monthly`（无 account_id 段），断言 `non_null.length >= 2`。
    - **AC3**（三条查询路径键一致）：前端唯一键来源在 `ProviderAccountRow.tsx:107,113`（`period.metric_id`）；后端 `trend-ipc.ts:49-54`（getBulk）与 `trend-ipc.ts:31-36`（get）透传 `metricId` 给 `query_trend_series`；web `usageboard-web.ts:327` 把 `period.metric_id` 作为 `metricId` query 参数调 `/v1/trend`，`server.ts:494` 透传给 store。三路径键语义均由 `ProviderUsagePeriod.metric_id` 单点决定，无分叉。
    - **AC4**（跨层集成测试用真实 store 断言非空）：`trend-query-key.test.ts` 用真实 `create_observation_store`（temp db），写入 connector 形态 observation，经 `observation_to_metric_record` 取查询键调 `query_trend_series`，断言序列非空；并含 raw_label 反证用例。
- 不变性与非范围：未触及 sparkline 渲染逻辑、connector metric_id 命名规则、observation-store SQL 与索引、label-map 配置键；改动严格限定在数据模型字段新增与查询键来源替换。
- 总体判断：实现精准闭合 trend 查询键链路（connector observation → store → MetricRecord → ProviderUsagePeriod → 前端查询键 → 后端透传 → store 命中），集成测试覆盖两种 connector metric_id 形态并含反证，无未解决 critical / important / minor。
- 系统性 follow-up：无。spec 已声明 finalization 时更新 `docs/blueprint/architecture.md`（trend 查询键长期契约）与 `docs/findings.md`（dNNN 记录 metric_id 构造规则），属 task 收尾流程，非 review 范围。

verdict: PASS
