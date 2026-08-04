# Task review t206（reviewer_focus: 通用）

- task：`t206_t204_model_filter_test_coverage`
- spec：`docs/tasks/t206_t204_model_filter_test_coverage/spec.md`
- diff_anchor：`9d7b3c6cc9d1839e54e28eed136249694f881748`
- target：`git diff 9d7b3c6cc9d1839e54e28eed136249694f881748`
- round：1
- reviewed_at：2026-08-04 10:35 UTC+8

## Findings

无。

## AC 覆盖核实

逐条对照 diff 与源码确认覆盖完整性与断言真实性。

**AC1（remount 从 prefs 恢复 model）** — `token_stats_view.test.tsx:469-493`

- TokenStatsView `model` state 初始值 `saved.model ?? "all"`（`TokenStatsView.tsx:220`），`saved` 来自 `load_prefs()` 读 `localStorage[PREFS_KEY]`（`:188-207`）。
- getDashboard 在 `model !== "all"` 时把 `model` 加入请求（`TokenStatsView.tsx:361`）。
- 测试先 selectOptions sonnet → save_prefs 写入 → unmount → remount → 新实例 `load_prefs` 返回 `{model:"sonnet"}` → 首次 getDashboard 带 `model:"sonnet"`。断言 `objectContaining({model:"sonnet"})` 触达真实恢复路径，非默认 "all"。mockClear 确保断言针对 remount 后的首次调用。成立。

**AC2（model+agent AND + 切范围刷新 models）** — `token_stats_view.test.tsx:495-521`

- 选 sonnet 后断言 `objectContaining({model:"sonnet"})`；再点 "Grok" 断言 `objectContaining({agent:"grok", model:"sonnet"})`，验证两者同请求携带（AND）。getDashboard 请求构造（`TokenStatsView.tsx:353-361`）同时读 `agent` 与 `model` state，逻辑一致。
- 切 "7 天" 触发重新拉取（mockClear + toHaveBeenCalled），返回 multi（models=["opus","sonnet"]），下拉 option 含两者。dashboard DTO 的 `models` 字段驱动下拉渲染，覆盖"刷新 models 列表"语义。成立。
- 注：spec 措辞"mock 返回新 models 列表"，测试未显式切换前后不同列表，但 mockClear + 重新拉取 + 断言 option 来自响应已构成可观察覆盖。非 blocking。

**AC3（local-api 四端点透传 model）** — `server.test.ts:630-656`

- `server.ts` 四端点（:359-444）均 `params.get("model")` 后 `...(model ? {model} : {})` 透传给 store 方法。
- 测试对四方法各建 spy，fetch 带 `model=sonnet`，断言 `toHaveBeenCalledWith(objectContaining({model:"sonnet"}))`。spy 直接挂在真实 store 对象上，验证生产透传路径。成立。

**AC4（IPC handler 透传 model）** — `token-stats-ipc.test.ts:405-446`

- heatmap/hourBuckets/rollup handler 无 schema 校验，直接 `store.method(filters ?? {})`（`token-stats-ipc.ts:85/96/107`）。测试传 `{start,end,model}` 精确断言透传。
- dashboardSessions handler 经 `tokenStatsDashboardSessionsQuerySchema.safeParse`（:159），schema 接受 `model`（`token-stats.ts:383`）。测试传完整 request 对象，断言 `query_dashboard_sessions` 收到相同对象。createMockDeps 补 `query_dashboard_sessions` mock 返回 `{items,total,has_more}`，匹配真实 DTO 形态（`token-stats-store.ts:1371-1375`）。成立。

**AC5（query_range_rollup model 过滤）** — `token-stats-store.test.ts:674-688`

- `query_range_rollup`（`token-stats-store.ts:1158-1173`）在 `filters.model` 存在时加 `model = @model` 条件。
- 测试种 sonnet + opus 两 record，分别按 model 查询各断言 `toHaveLength(1)` 且 `[0].model` 匹配，再查 `{}` 断言 `toHaveLength(2)`。rollup 行含 model 字段（`rollup_row_from:645`）。触达真实过滤 SQL，非 mock。两模型均验证，成立。

## 范围合规

- diff 仅触及 4 测试文件 + task.md 状态字段。src/ 无改动，符合非范围声明。
- 无生产代码改动，无 mock 掉被测逻辑（AC5 用真实 store；AC1/AC2 用真实组件 + 已有 get_dashboard mock；AC3 spy 挂真实 store；AC4 mock store 但 handler 透传逻辑真实）。
- 无危险模式（恒真、删 expect、.skip、@ts-ignore on test file）。IPC 测试中 `eslint-disable @typescript-eslint/unbound-method` 是 vi.mocked 用法标配，非断言弱化。
- createMockDeps 补 query_dashboard_sessions mock 是必要基础设施补全，非删减。

## 结论

- 本轮新发现：0 条
- 未进表的提示：AC2 "新 models 列表"语义边界略宽，当前测试用相同 multi 返回 + mockClear 验证刷新路径，已触达可观察行为；如需更强保证可后续补"前后不同列表"场景，但非本 task 范围缺口。
- 总体判断：4 测试文件覆盖 AC1-AC5 全部，断言均触达真实透传/过滤逻辑，无非任务范围改动，无假绿或危险模式。
- 系统性 follow-up：无

verdict: PASS
