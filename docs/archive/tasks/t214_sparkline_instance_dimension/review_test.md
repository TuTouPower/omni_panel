# Task review t214（reviewer_focus: 测试）

- task：`t214_sparkline_instance_dimension`
- spec：`docs/tasks/t214_sparkline_instance_dimension/spec.md`
- diff_anchor：`0ddc79d808f4f89548387cd62e9dc6164416a479`
- target：`git diff 0ddc79d808f4f89548387cd62e9dc6164416a479`
- round：1
- reviewed_at：2026-08-05 18:30 UTC+8

## Findings

### t214_test_f001 - web `/v1/trend` 路径 source_instance_id 透传与过滤无测试

- 严重度：important
- 锚点：AC3（"`trend:getBulk` / `trend:get` / web `/v1/trend` 三条路径的请求都携带 source_instance_id 且后端按其过滤"）
- 位置：`tests/unit/web/usageboard-web.test.ts`（缺 web trend 用例）；`tests/integration/local-api/server.test.ts`（无 `/v1/trend` 用例）
- 问题：AC3 明确列举三条路径。IPC `trend:get` / `trend:getBulk` 透传在 `tests/unit/ipc/trend-ipc.test.ts` 已有断言（`toHaveBeenNthCalledWith(..., "inst-a", ...)`）；SQL 过滤在 `observation-store.test.ts` 与新 `trend-instance-isolation.test.ts` 真实 store 覆盖。但第三条路径 web `/v1/trend` 的两端——前端桥 `src/web/usageboard-web.ts` 把 `sourceInstanceId` 写入 query string、后端 `src/main/core/local-api/server.ts` 解析并传入 `query_trend_series`——零测试断言：
    - `usageboard-web.trend.get` / `trend.getBulk` 调用的 URL 含 `sourceInstanceId=`（与 `tokenStats.getHeatmap` 之于 `/v1/heatmap?agent=...` 的断言风格一致，是本文件既有覆盖模式）
    - local-api `/v1/trend` 缺 `sourceInstanceId` 时返回 400（diff 中 `server.ts:483-487` 新增分支无测试）
    - local-api `/v1/trend` 按 `sourceInstanceId` 过滤（diff 中 `server.ts:492-498` 新增调用无测试）
    - `tests/unit/e2e/mock_server.test.ts:97-107` 测的是 mock fixture 回放，不触达真实 local-api 后端过滤逻辑，不算覆盖
- 建议：在 `tests/unit/web/usageboard-web.test.ts` 加 trend.get / getBulk 用例，断言 fetch URL 含 `sourceInstanceId=inst-a`（参考同文件 `tokenStats.getHeatmap forwards ... as query params` 写法）；在 `tests/integration/local-api/server.test.ts` 加 `/v1/trend?...&sourceInstanceId=...` 真实端点用例，断言 200 + 过滤结果，并加缺 `sourceInstanceId` 返回 400 的用例

## 结论

- 改测方向复核：
    - `observation-store.test.ts:317-345` EXPLAIN 测试：从 `USING INDEX idx_trend\b` + `not.toContain("idx_lookup")` 放宽到 `USING INDEX idx_(trend|lookup)\b` + `not.toMatch(/SCAN observations/)`。这是合理对齐而非迁就实现——加 `source_instance_id` 等值列后 `idx_lookup(provider, account_id, metric_id, source_instance_id, observed_at)` 成为合法更优覆盖索引（5 列覆盖 WHERE 等值 4 列 + observed_at 范围），原 `idx_trend` 不含 `source_instance_id`。核心约束（禁全表扫描）保留，索引选择交给 planner。
    - `observation-store.test.ts` 4 处 `query_trend_series` 调用加 `"tavily-1"` / `"nope"` 实参：签名变更后的参数对齐，非迁就实现。
    - `trend-query-key.test.ts` 3 处调用加 `rec.sourceInstanceId` / `"cpa-1"`：签名变更后的对齐，fixture 原含该字段。
    - `trend-ipc.test.ts` mock 签名与 payload 加 `source_instance_id`：被测点是 trend-ipc 的参数透传，`query_trend_series` 是 mock 的依赖（不是被测点），属合法 unit test 边界。
    - `route_api.test.ts` disabled api 多传一个 `"any"`：对齐 `TrendApi.get` 新签名。
    - `provider_account_row.test.tsx` payload 断言加 `source_instance_id: "cpa-main"`：对齐前端透传契约。
    - 本轮无"迁就实现"的改测。
- 本轮新发现：1 条（t214_test_f001）
- 未进表的提示：
    - `trend-instance-isolation.test.ts` 用例 2 的 `for (const p of a_points) { expect(p.used).not.toBe(999); }` 是合法反证，但更强的断言可以是 `expect(a_points.map(p => p.used).sort()).toEqual([100, 200])`（精确化），属可选改进非阻断。
    - `mock_server.test.ts` 既有 `/v1/trend` 用例（97-107 行）现仍用 3 参数 query，不触达 sourceInstanceId——若将来想以 mock 复放形式补回归，需更新 fixture key 与断言；非本 task 范围。
- 总体判断：AC1/AC2/AC4 与 AC3 的 IPC 两条路径覆盖到位且为真实交互（非 mock 被测点）；AC3 第三条路径 web `/v1/trend` 的两端透传与后端过滤完全无测试，属 AC 部分无覆盖，important 阻断。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-05 19:05 UTC+8)

### 前轮 finding 复核

- **t214_test_f001（web `/v1/trend` 透传/过滤无测试）— 已消除**：
    - 前端桥（`tests/unit/web/usageboard-web.test.ts:231-258`）：`trend.get` / `trend.getBulk` 两用例 mock `fetch`（系统边界 mock 合法），断言调用 URL 含 `sourceInstanceId=inst-a`。URL 由生产 `src/web/usageboard-web.ts:307-312` 的 `URLSearchParams({ provider, accountId, metricId, sourceInstanceId })` 构造，断言点对齐生产写入路径，非 mock 被测逻辑。
    - 后端过滤（`tests/integration/local-api/server.test.ts:705-722` 缺参 400；`724-754` 双实例 200）：起真实 `create_local_api_server` + 真实 observation-store（temp db），写入同 `(provider, account_id, metric_id)` 双实例 observation（inst-a used=100 / inst-b used=500，limit=1000），分别 fetch `?...&sourceInstanceId=inst-a` / `=inst-b`，断言 `points_a[0].percent === 10`、`points_b[0].percent === 50`。全链路触达真实 `query_trend_series` SQL 过滤，非 mock fixture 回放。
    - 缺参分支（`server.ts:483-487` 新增 `!sourceInstanceId` → 400）由 `server.test.ts:705-711` 覆盖，断言 `res.status === 400`。
    - Round 1 提示的 `mock_server.test.ts:97-107`（mock 回放，不触达 sourceInstanceId）不在本轮 diff，仍属范围外观察。

### 改测方向复核

本轮无「迁就实现」改测。

- `usageboard-web.test.ts` 两用例为新增（非修改既有断言）。`expect(url).toContain("sourceInstanceId=inst-a")` 是 web 桥 URL 断言的合理风格（同文件 `tokenStats.getHeatmap` 既有同模式 `toContain("agent=")`），非弱化既有 `toBe`。
- `server.test.ts` 两用例为新增。`percent === 10 / 50` 是精确值断言，非 `>=` / `toBeTruthy` 类弱化。

### 危险模式扫描

新增测试无 `.skip` / `.only`、无 `@ts-ignore` / `eslint-disable`、无恒真断言、无删/反转 expect、无 `if (cond) expect(...)`、无 timeout/容差掩盖、无 mock 被测逻辑本身。AC3 三路径前/后端证据完整。

### 本轮新发现

0 条。

### AC 覆盖复核（AC3 三路径）

| 路径                 | 测试                                                 | 触达                                                       |
| -------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| IPC `trend:get`      | `tests/unit/ipc/trend-ipc.test.ts:64-71`             | mock `query_trend_series`（依赖边界），断言透传 `"inst-a"` |
| IPC `trend:getBulk`  | `tests/unit/ipc/trend-ipc.test.ts:108-128, 150-172`  | 同上，两次 nth 调用均断言含 `"inst-a"`                     |
| web `/v1/trend` 前端 | `tests/unit/web/usageboard-web.test.ts:231-258`      | mock fetch（边界），断言 URL 含 `sourceInstanceId=inst-a`  |
| web `/v1/trend` 后端 | `tests/integration/local-api/server.test.ts:705-754` | 真实 server + 真实 store，400 缺参 + 200 双实例过滤        |

### 未进表的提示

无。

### 总体判断

t214_test_f001 已彻底修复——AC3 第三条路径 web `/v1/trend` 两端均有了真实触达的测试（前端 URL 断言、后端真实 server 双实例隔离 + 400 缺参）。AC1/AC2/AC3/AC4 现均覆盖到位，无假绿、无弱化、无危险模式。本轮无新 finding。

- 系统性 follow-up：无

verdict: PASS
