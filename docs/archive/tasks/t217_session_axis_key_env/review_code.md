# Task review t217（reviewer_focus: 代码）

- task：`t217_session_axis_key_env`
- spec：`docs/tasks/t217_session_axis_key_env/spec.md`
- diff_anchor：`c41e15e008d74b052d6807ebe9b7a2cba70ebf2d`
- target：`git diff c41e15e008d74b052d6807ebe9b7a2cba70ebf2d`
- round：1
- reviewed_at：2026-08-05 22:00 UTC+8

## 范围核对结论

- 改动范围：`token-stats.ts`（schema + env）、`token-stats-store.ts`（query_range_rollup SQL + 注释）、`chart-data.ts`（session_key）、三个测试文件、`task.md` 状态字段。无范围外大改。
- 三处改动相互依赖且齐备：schema 加 `env` 使 DTO safeParse（`token-stats-ipc.ts:130` / `local-api/server.ts:348`）不再剥离 env，renderer 拿到的 `chart_data.rollup` 行才带 env，`session_key` 读取 `row.env` 才成立。仅改 renderer 或仅改 schema 都会让 `row.env === undefined`、两个 env 仍合并。实现端到端一致。
- 验证：3 个受影响测试文件 165 测试通过；`tests/unit/shared/` 144 测试通过；`pnpm typecheck` 干净；`pnpm exec eslint`（受改文件，`--max-warnings=0`）干净。

## Findings

### t217_code_f001 - 同文件旧 rollup 会话轴路径未同步 env（休眠路径，p040 复发陷阱）

- 严重度：minor
- 锚点：AC 2（session 轴跨 env 不合并）；行为缺陷触发场景：BarChart 的 `rollup` prop 一旦被接线，`prepareBarDataFromRollup` 会把跨 env 同 session_id 会话再次合并
- 位置：`src/renderer/lib/token-stats/chart-data.ts:985`、`:997`、`:1012`、`:822`
- 问题：任务只改了 `prepareBarDataFromDashboardRollup` 的 `session_key`（`:1090`），但同文件并行实现 `prepareBarDataFromRollup` 的 session 轴仍按裸 `r.session_id` 分组（`:985` `groupBy(rows, (r) => r.session_id)`）、索引（`:997`）与会话去重（`:1012` `add(r.session_id)`）；`rollup_group_metric`（`:822`）对 sessions 指标也按裸 `session_id` 去重。当前唯一的 BarChart 调用方 `TokenStatsView.tsx:592` 硬编码 `rollup: never[]`，`:142` 分支不可达，故今日无可观测缺陷；但函数仍导出、`rollup` 仍是 BarChart 公开 prop，一旦未来接线即静默复发 p040（跨平台同 session_id 会话在 session 轴被合并）。
- 建议：与 `prepareBarDataFromDashboardRollup` 一致，把 `prepareBarDataFromRollup` 的会话 key（或 `rollup_group_metric` 的 sessions 去重）改为含 env；或在结论中登记为遗留死代码待清理。

### t217_code_f002 - spec 范围/非范围表述与实现不一致（query_range_rollup SQL 实际被改）

- 严重度：minor
- 锚点：spec 契约区「范围」item 2 与「非范围」段；无行为缺陷，属 spec 过时
- 位置：`src/main/core/token-stats/token-stats-store.ts:1205`（SELECT 新增 `env`）、`:1222`（GROUP BY 新增 `env`）
- 问题：spec 范围 item 2 称「`query_range_rollup` … SQL 已含 env 列，…仅类型收口」，非范围段称「任何 SQL 分组/校验语义变更」不在本次范围；但实际 diff 给 `query_range_rollup` 的 SELECT 与 GROUP BY 都新增了 `env`（diff 前该 SQL 不含 env 列，且用的是直接 cast 而非 `rollup_row_from`）。该 SQL 变更对「返回含 env 的行」与 AC 2（对 `getRangeRollup` IPC / `local-api /v1/rollup` 的消费方，跨 env 同 session_id 必须在 SQL 层拆成两行）是必要的，实现正确，仅 spec 描述过时。
- 建议：修订 spec 范围 item 2 与非范围段，注明 `query_range_rollup` 的 SELECT/GROUP BY 需补 env；不计 FAIL。

## 结论

- 前轮 finding 复核：无（Round 1）
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - 文件过大（均超阈值但本 task 净增仅 0–3 行，未继续堆大，按规则只列不表）：`src/main/core/token-stats/token-stats-store.ts` 1415 行、`src/renderer/lib/token-stats/chart-data.ts` 1218 行、`tests/unit/main/core/token-stats/token-stats-store.test.ts` 2047 行、`tests/unit/renderer/lib/token-stats/chart-data.test.ts` 1458 行、`tests/unit/renderer/views/token_stats_view.test.tsx` 800 行。测试文件与实现文件均为历史积累体量，非本 task 引入。
    - 冗余类型：`store.ts:315` `DashboardRollupRow = TokenStatsRollupRow & { env: TokenStatsEnv }` 在本 task 给 `TokenStatsRollupRow` 加 env 后成为恒等交集，无害，可选 1 行清理（`rollup_row_from` 返回类型可直接用 `TokenStatsRollupRow`）。
    - 死代码（既存，非本 task 引入）：`prepareBarDataFromRollup` 与 `TokenStatsView.tsx:592` 的 `rollup: never[]`（t184 遗留，t200 后主路径改走 `chart_data`）。
    - 复杂度：无函数超阈值；改动均为单行/单字段级。
- 总体判断：核心改动正确且端到端自洽（schema → SQL → renderer key 三处一致），AC 1–4 均有对应实现，测试、typecheck、lint 全绿；仅存两处 minor（休眠路径一致性、spec 措辞同步），不阻断。
- 系统性 follow-up：无。

verdict: PASS
