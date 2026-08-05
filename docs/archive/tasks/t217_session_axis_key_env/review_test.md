# Task review t217（reviewer_focus: 测试）

- task：`t217_session_axis_key_env`
- spec：`docs/tasks/t217_session_axis_key_env/spec.md`
- diff_anchor：`c41e15e008d74b052d6807ebe9b7a2cba70ebf2d`
- target：`git diff c41e15e008d74b052d6807ebe9b7a2cba70ebf2d`
- round：1
- reviewed_at：2026-08-05 21:55 UTC+8

## Findings

### t217_test_f001 - AC3「sessions 计数按含 env 的 session key 去重」无直接测试

- 严重度：important
- 锚点：AC3
- 位置：`tests/unit/renderer/lib/token-stats/chart-data.test.ts:1027`（新增用例用 metric `"tokens"`）；缺 sessions metric × 跨 env 同 session_id 用例
- 问题：新增 chart-data 用例「session 轴跨 env 同 session_id 不合并（p040）」只覆盖了 `prepareBarDataFromDashboardRollup`（`src/renderer/lib/token-stats/chart-data.ts:1070`）的 category 分支（`category_of`/`category_totals`，即 AC2）。sessions metric 的去重分支——`category_sessions` Set（chart-data.ts:1098-1110）与 `session_cells`（chart-data.ts:1141-1146）——没有任一行跨 env 同 session_id 的数据触达。具体可观察场景：sessions × project 下，同一目录内 win-s1 与 wsl-s1 两个会话，修复后该目录 sessions 计数应为 2、修复前为 1；该行为无测试断言。store 用例（`tests/unit/main/core/token-stats/token-stats-store.test.ts:590`）只证明 SQL 行按 env 拆开；oracle 用例（chart-data.test.ts:1257 起 `oracle_rows`）全部行 env 相同，注释明示「env 差异由 p040 单独跟踪，不在本 oracle 暴露」。会话 key 是同一闭包变量（AC2 用例已证明含 env，实现正确性风险低），但 AC3 作为独立 AC 的观察行为完全无测试。
- 建议：补一条 sessions metric 用例，例如 `prepareBarDataFromDashboardRollup(rows, "sessions", "project", "dark")`，fixture 为同 session_id、不同 env、同 directory 的两行，断言该目录 cell 计数为 2；或把新用例的 metric 从 `"tokens"` 扩成 `"sessions"` 变体（sessions × session 断言两个 category 各计 1）。

### t217_test_f002 - AC1「schema 含 env，序列化/反序列化不丢字段」无 schema 直接测试

- 严重度：minor
- 锚点：AC1
- 位置：`src/shared/types/token-stats.ts:221-234`（`tokenStatsRollupRowSchema`）；`tests/unit/shared/token-stats.test.ts`（无 rollup schema 用例）
- 问题：store 新用例断言 `query_range_rollup` 返回行含 env，验证了数据路径；但 `tokenStatsRollupRowSchema` 本身以及 dashboard chart data 的 `rollup: z.array(tokenStatsRollupRowSchema)`（token-stats.ts:372）没有 zod parse round-trip 用例。store 返回行是直接 `as TokenStatsRollupRow[]` 强转（token-stats-store.ts:1219），不经 schema 解析，故 schema 含 env 只被类型层间接验证。「序列化/反序列化不丢字段」的直接证据缺失，风险低（只加字段）。
- 建议：在 `tests/unit/shared/token-stats.test.ts` 补 `tokenStatsRollupRowSchema` parse 用例（含 env 的行 parse 后 env 保留）。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无「迁就实现」的改测。被修改的既有测试只改测试名与注释（token-stats-store.test.ts:569），断言未变；各 fixture 补 `env`（chart-data.test.ts:771/945-972、token_stats_view.test.tsx:131）是 `tokenStatsRollupRowSchema` 新增必填字段后的合法性修正，非弱化。
- 危险模式扫描：未命中。diff 无 `.skip`/`.only`/eslint-disable/`@ts-ignore`，无删断言、无恒真断言、无弱化断言。新增两个用例均真实触达生产实现：store 用例在旧 GROUP BY（不含 env）下会合并为 1 行、断言 `toHaveLength(2)` 会红；chart-data 用例在旧 session_key（不含 env）下两行合并为 1 个 category、`toHaveLength(2)` 会红。
- 本轮新发现：2 条（1 important，1 minor）
- 未进表的提示（范围外观察，供 code reviewer / spec 参考）：
    - `prepareBarDataFromRollup`（legacy，`src/renderer/components/token-stats/BarChart.tsx:143` fallback 路径）session 轴按 `r.session_id` 分组（chart-data.ts:985）、sessions 去重按 `r.session_id`（chart-data.ts:1012），不含 env。若该 fallback 仍被跨 env rollup 行触达，p040 合并在该路径持续存在。spec 范围只列 `prepareBarDataFromDashboardRollup`，归实现范围问题。
    - `kpiFromRollup`（chart-data.ts:938）sessions 去重按 `session_id`，KPI sessions 计数跨 env 同 session_id 仍合并；不在本 task 范围（server 侧 `dashboard_summary_from_rollup` 已用含 env key，token-stats-store.ts:368）。
    - `DashboardRollupRow = TokenStatsRollupRow & { env }`（token-stats-store.ts:315）在 env 入 schema 后为冗余交叉类型，cosmetic。
- 总体判断：AC1/AC2/AC4 覆盖成立，AC3 观察行为无直接测试，未解决 important → FAIL。

verdict: FAIL

## Round 2 (2026-08-05 22:04 UTC+8)

- reviewed_at：2026-08-05 22:04 UTC+8
- 复核依据：`git diff c41e15e008d74b052d6807ebe9b7a2cba70ebf2d` 全量 diff + 生产代码 `src/renderer/lib/token-stats/chart-data.ts:1070-1158` / `src/main/core/token-stats/token-stats-store.ts:1202-1225`；受影响 5 个测试文件 196 用例实测全绿（`vitest run`）。

### 前轮 finding 复核

**t217_test_f001（important，AC3 无直接测试）——已消除。**

新增用例 `sessions metric 按含 env 的 session key 去重：跨 env 同 session_id 各计 1（p040）`（`tests/unit/renderer/lib/token-stats/chart-data.test.ts:1071-1121`）：

- metric=`"sessions"` + xaxis=`"session"`，fixture 为 win-s1 与 wsl-s1 两行（同 session_id、同 directory `/alpha`、不同 env）。
- 真实触达去重分支：`metric === "sessions"` 同时走 `category_sessions` Set（chart-data.ts:1098-1101）与 `session_cells` Set（chart-data.ts:1141-1146），两分支均以含 env 的 `session_key`（chart-data.ts:1090-1091）为去重键。
- 断言两个 category（`toHaveLength(2)` + 两 title 均在 labels）+ 各计 1（跨 series 在 win/wsl 两栏求和 `total === 2`）。
- 旧实现判红：session_key 无 env → 两行同 category → `labels` 长度 1 → `toHaveLength(2)` 失败。判红成立。
- 附带 AC2 的 tokens 变体（:1027-1069）同样对旧实现判红。

**t217_test_f002（minor，schema parse 直接证据缺失）——仍存在（未修）。**

处置表称「schema env 序列化断言由 store 跨 env 拆行用例覆盖（行含 env 字段）」，不成立：

- store 跨 env 用例（`token-stats-store.test.ts:590-600`）在 Round 1 diff 中已存在，非本轮新增；Round 1 已明示它只证明「SQL 行按 env 拆开」。
- 该路径是直接强转 `db.prepare(sql).all(params) as TokenStatsRollupRow[]`（token-stats-store.ts:1225），不经 `tokenStatsRollupRowSchema` parse；`env` 经 `DashboardRollupRow = TokenStatsRollupRow & { env }` 交叉类型携带，schema 移除 env 时 store 用例仍绿。
- 真实回归场景无拦截：若 schema 丢 env，IPC 边界 `tokenStatsDashboardDtoSchema.safeParse`（token-stats-ipc.ts:130）会剥掉 rollup 行 env，renderer 会话轴跨 env 合并复现，而 chart-data 用例均直接构造行不经 schema。
- 建议的 schema parse round-trip 用例未补：`tests/unit/shared/token-stats.test.ts` / `token_stats_dashboard.test.ts` 均无非空 rollup 行 parse 用例（`token_stats_dashboard.test.ts:130/208` 恒为 `rollup: []`）。
- 维持 Round 1 的 minor 定级（只加字段、zod 对已声明字段默认保留，风险低），不阻断。

**t217_code_f002（minor，spec 范围表述）——已消除。**

spec.md 范围 item 2 已由「仅类型收口」改写为「SELECT 补 env 列、GROUP BY 补 env（原 SQL 已含 env 列但 GROUP BY 未含，`rollup_row_from` 已取 env）」，与实际 diff（token-stats-store.ts:1202 SELECT 补 env、:1222 GROUP BY 补 env）一致。

### 改测方向复核

无「迁就实现」的改测。

- 被改既有测试仅更新测试名与注释（store.test.ts:569）、fixture 补必填 `env`（chart-data.test.ts:771/948/961、token_stats_view.test.tsx:131），断言未弱化。
- oracle 参考实现（chart-data.test.ts:1158 `OracleRow`、:1233-1234 session_key）在 anchor 已含 env，本 diff 未改动；oracle 行全 `env: "win"`，同 env 下 renderer 与 oracle 的 category 结构等价，不受 session_key 改动影响，测试全绿。

### 危险模式扫描

未命中。新增用例无 `.skip` / `.only` / eslint-disable / `@ts-ignore`，无删断言、恒真断言、弱化断言。`toBeGreaterThanOrEqual(0)` 为 `indexOf` 存在性断言（`indexOf` 返回 -1 时判红），非恒真。

### 本轮新发现

0 条。

### 未进表的提示（范围外观察）

- 无新增。Round 1 提示的 `kpiFromRollup`（chart-data.ts:938）sessions 去重按裸 session_id 与 `DashboardRollupRow` 冗余交叉类型仍属范围外，未变。

### 总体判断

f001（重要阻断项）已真实消除，f002（minor）维持存在但不阻断；本轮无新 blocker，可 PASS。

verdict: PASS
