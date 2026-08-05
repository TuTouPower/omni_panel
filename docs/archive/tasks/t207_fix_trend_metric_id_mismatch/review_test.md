# Task review t207（reviewer_focus: 测试）

- task：`t207_fix_trend_metric_id_mismatch`
- spec：`docs/tasks/t207_fix_trend_metric_id_mismatch/spec.md`
- diff_anchor：`c31389e9a1ff25e5280ebdf90d49ccc341196352`
- target：`git diff c31389e9a1ff25e5280ebdf90d49ccc341196352`
- round：1
- reviewed_at：2026-08-05 14:20 UTC+8

## Findings

无 critical / important / minor blocking finding。

范围外提示见「结论 → 未进表的提示」。

## AC 覆盖核对

- **AC1（sparkline 渲染折线，非占位）**：`tests/unit/renderer/components/provider_account_row.test.tsx:200,211,277,279,326,349` 断言 `.trend-svg` 存在、`.trend-sparkline-empty` 不存在；`TrendSparkline.tsx:39-83` 显示这两个 class 由 `valid_points.length >= 2` 分支决定。覆盖。
- **AC2（CPA Claude 与 opencode_go 两类形态）**：`tests/integration/observation/trend-query-key.test.ts` 两个 it 分别覆盖 `claude:acc-1:five_hour`（含 account_id 段）与 `opencode_go:monthly`（无 account_id 段，`provider:raw_label`）。覆盖。
- **AC3（`trend:get` / `trend:getBulk` / web `/v1/trend` 三路径键一致）**：
    - `trend:get` / `trend:getBulk`：`tests/unit/ipc/trend-ipc.test.ts:72,113-114,138-139` 断言 `query_trend_series` 收到 payload 透传的 `metric_id`（IPC 透传契约）。
    - 跨层键对齐（前端查询键 = store `metric_id` 列）：`trend-query-key.test.ts` 用真实 store 验证 `observation_to_metric_record(obs).metric_id` 能查回序列。
    - web `/v1/trend`：无独立断言。`src/main/core/local-api/server.ts:483-494` 直接透传 `metricId` 查询参数到 `store.query_trend_series`，无键变换；AC3 核心风险（前端传 raw_label）已在 IPC + 跨层链路覆盖。详见「未进表的提示」。
- **AC4（跨层集成测试）**：`trend-query-key.test.ts` 用真实 `create_observation_store` + temp db，写入 connector 形态 observation，经生产函数 `observation_to_metric_record` 取查询键，调生产 `store.query_trend_series`，断言非空。覆盖。

## 测试可信

- **生产逻辑可达**：`trend-query-key.test.ts` import 生产 `create_observation_store`、`observation_to_metric_record`，写入真实 SQLite（better-sqlite3），走生产 SQL `idx_trend`；无 mock 被测点。`provider_account_row.test.tsx` 走真实 `ProviderAccountRow` 组件 + 真实 `TrendSparkline` 渲染分支。
- **mock 边界**：跨层测试只 mock 文件系统（temp dir）。前端测试 mock `trend_api.getBulk`（系统边界 IPC），合法；mock 响应的 `metric_id` 与 payload 携带键对齐，是契约要求而非凑数。
- **反证条语义**：`trend-query-key.test.ts:139-146` 用 `raw_label`（`"five_hour"`）查 store，断言全 null。直接证明 raw_label ≠ metric_id 列，回归点被锁死。
- **断言强度**：核心断言用 `toBe`（精确匹配 metric_id）、`toHaveLength(7)`、`toBeGreaterThanOrEqual(2)`、`every(p => p === null)`；无恒真、无 `toBeDefined` 充数。

## 危险模式扫描

逐条扫描，无命中：

- 恒真断言：无。
- 删/反转/注释 expect：无。
- 弱化断言（toBe → toContain / 正则 / >= / toBeTruthy）：无。`non_null.length >= 2` 是 AC1「≥2 折线点」的直接转写，正当。
- 删测试：无。
- `.skip` / `.only` / `@Ignore`：无。
- `eslint-disable` / `@ts-ignore` / `# type: ignore`：无。
- mock 误用：mock 响应回 `metric_id` 与前端查询键一致是 AC3 契约，非 mock 被测点。
- 阈值掩盖：无 timeout / 重试增大。
- 条件跳过：`if (rec.metric_id === undefined) throw` 是窄防御，前置 `expect(rec.metric_id).toBe(...)` 已用 `toBe` 精确断言非 undefined 值；不构成条件跳过弱化断言。
- 程序赋值替代真实交互：N/A（非 UI 交互测试）。
- 存在即通过：无。

## 改测方向复核

`provider_account_row.test.tsx` 改测均为配合生产修复更正 mock 数据：

- mock 响应 `metric_id` 由 `"5h"` → `"claude:auth-a:5h"`：响应应回前端传入的查询键，前端现传 `period.metric_id`（=`claude:auth-a:5h`），原 `"5h"` 是 bug 期遗留的错误 mock。
- payload 断言 `metric_id: "5h"` → `metric_id: "claude:auth-a:5h"`：对应生产行为变更（前端从 `raw_label` 改传 `metric_id`），断言的是**应有的预期**，非迁就实现。

合法。无「迁就实现」式改测。

fixture 类改动（20 个文件）均为 schema 加 `metric_id` 字段连锁，机械补默认值，无语义改动。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 改测方向复核：无迁就实现式改测。
- 本轮新发现：0 条。
- 未进表的提示：
    - AC3 web `/v1/trend` 路径无独立端到端断言。`server.ts:483-494` 仅透传查询参数到 store，无键变换，风险低；IPC 路径 + 跨层测试已覆盖核心键对齐回归。属「可再测」级别，不阻断。
    - `trend-ipc.test.ts` mock store 用短键 `"5h"`/`"5d"` 是 IPC 透传契约测试（测透传不测键对齐），合法；键对齐由 `trend-query-key.test.ts` 承担。如未来想在 IPC 层一并防回归，可让 mock store 校验传入键形态，但当前非必需。
- 总体判断：跨层测试触达真实生产路径（observation-store SQL + observation-mapping + 前端查询键链路），反证条锁死 raw_label 回归，AC1-4 均有测试支撑，无危险模式。PASS。
- 系统性 follow-up：无。

verdict: PASS
