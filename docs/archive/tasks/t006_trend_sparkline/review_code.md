# Task review T006

- task：`T006_trend_sparkline`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-21 00:30 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。两 agent 各自从本模板复制，按 reviewer_focus 改文件名和 finding 前缀：`文档+代码` → `review_code.md` / 前缀 `code`；`测试` → `review_test.md` / 前缀 `test`。

## Findings

### T006_code_f001 — log.md 与实现状态严重不同步

- 严重度：medium
- 位置：`docs/tasks/T006_trend_sparkline/log.md:7`
- 问题：log.md 仍写「暂未开始实现。spec/plan 待用户审核」，但 working tree 已完成全部 6 步（store 查询 + idx_trend、IPC handler、local-api 端点、TrendSparkline、ProviderAccountRow 装配、单测）。plan.md §"Finalization 时更新的 blueprint" 列出的 4 处文档（architecture / observation-store / ipc / web-panel specs）也未见落地。log 缺少追溯价值的最小记录：实施完成时间、关键决策（build_trend_series 落位 shared/lib 而非 spec 写的 provider-usage.ts）、EXPLAIN QUERY PLAN 验证结果、与 plan 的偏离。
- 建议：log.md 至少补三段：(1) 实施完成节点；(2) `build_trend_series` 改放 `src/shared/lib/trend.ts` 的原因（main/ipc 与 main/local-api 都要复用，shared 才能跨进程）；(3) 单测 + EXPLAIN QUERY PLAN 验证通过记录。Finalization 阶段再补 blueprint 4 处更新（plan 已列）。

### T006_code_f002 — `build_trend_series` 落位与 spec 不一致（已正当化但未记录）

- 严重度：low
- 位置：`src/shared/lib/trend.ts:18`（实现）；`spec.md:20` / `plan.md:7`（声明落在 `provider-usage.ts`）
- 问题：spec/plan 写「`provider-usage.ts` 新增 `build_trend_series(records, days = 7)`」，实现放在 `src/shared/lib/trend.ts` 且签名去掉 `days`。落位偏离是正当的：`trend-ipc.ts` 与 `local-api/server.ts` 都需要在 main 进程调用该函数，`provider-usage.ts` 在 `src/renderer/lib/` 无法跨进程 import。签名上 `days` 由 `query_trend_series(days)` 在 store 层负责 null-fill 出 days 长度，纯函数只需做点态归一，去掉 `days` 反而更内聚。
- 建议：spec/pln 与实现分歧需要在 log.md 记录决策（见 f001），避免后续读者按 spec 找不到代码。无需改实现。

### T006_code_f003 — `display_style` 未被读取，ratio 归一测试名不副实

- 严重度：low
- 位置：`src/shared/lib/trend.ts:18-39`；`tests/unit/shared/trend.test.ts:87-98`
- 问题：函数签名 `Pick<Observation, "used" | "limit" | "observed_at">` 根本拿不到 `display_style`，纯靠 `used/limit*100` 出 percent。这对当前存储约定（ratio 型也以 `used/limit` 表示占比，例如 0.3/1.0 或 30/100 都得出 30%）成立，但单测 `"normalizes ratio displayStyle to percent"` 传入 `used:25, limit:200, display_style:"ratio"` 期望 13——和 percent 型走同一公式，并未真正验证「ratio 型数据（如 used:0.3, limit:1）也能得出 30%」。如果未来存储约定改为 ratio 型 `used` 直接存 0.3 而 `limit` 存 1.0，函数仍然正确；但如果有人误改函数分支读 display_style，这个测试也会照过，遮蔽回归。
- 建议：（a）测试改为传 `used:0.5, limit:1, display_style:"ratio"` 期望 50，才真正锁死 ratio→percent 归一；（b）或在 `build_trend_series` 顶部注释明确「display_style 不影响归一：used/limit 已是占比」。

### T006_code_f004 — IPC 与 local-api 对 `days` 入参的容错不一致

- 严重度：low
- 位置：`src/main/ipc/trend-ipc.ts:24`（`typeof days === "number" && days > 0 ? days : 7`，未 `Math.floor`）；`src/main/core/local-api/server.ts:326-329`（`Math.floor(Number(days_raw))`）
- 问题：renderer 传 `days: 7.5` 时，IPC 路径会把 7.5 直接进 `query_trend_series`（`now - 7.5*day_ms` 计算无误但语义含糊），local-api 路径会截成 7。两条路径行为不对齐。
- 建议：IPC 也加 `Math.floor`，或抽出共享 `clamp_days(days): number` 工具供两条路径复用。

### T006_code_f005 — Sparkline 缓存 key 用 `:` 拼接，未做转义

- 严重度：low
- 位置：`src/renderer/components/ProviderAccountRow.tsx:64`、`:148`
- 问题：cache_key = `${provider}:${accountId}:${metricId}`。当前 provider/accountId/metricId 取值（`tavily` / `default` / `tavily:monthly_usage`）里 `metricId` 本身就可能含 `:`（如 `tavily:monthly_usage`），与分隔符冲突。当前不会产生真实碰撞（因为前缀也是 `tavily`，组合仍唯一），但约定脆弱：一旦未来 metricId 内含 `:` 的数量变化或 accountId 也含 `:`，解析就歧义。
- 建议：要么换成 `JSON.stringify([provider, accountId, metricId])` 当 key（最稳），要么明确记录「三段内禁含 `:`」并在数据入口处断言。当前实现可保留，但需注释锁死约定。

### T006_code_f006 — ProviderAccountRow 趋势集成缺单测（spec 验收项未覆盖）

- 严重度：low（本 finding 涉及测试，但根因是组件代码缺少可测性抽离，交由测试 agent 复核）
- 位置：`src/renderer/components/ProviderAccountRow.tsx:51-94`；无对应组件单测
- 问题：spec 验收标准 3/4 条（「首次展开触发懒查，收起再展开不重复请求」「失败不写缓存以允许重试」）是 ProviderAccountRow 内嵌行为，现有测试套件只在 popup_view/settings_view 里 mock `trend.get`，没有针对该组件验证：(a) collapsed=false 触发 fetch、(b) 二次展开命中 cache 不发 IPC、(c) fetch reject 时不写 cache 且下次仍能重试。逻辑实现是对的（68-84 行的 try/catch 不 set cache），但无回归保护。
- 建议：补 `tests/unit/renderer/components/provider_account_row.test.tsx`，mock `window.usageboard.trend.get`，断言三次场景的调用次数与 cache 命中。

## 结论

实现完整覆盖 spec/plan 的 6 步范围，无越界。硬约束逐条满足：`--blue`/`--track` 配色（grep 确认 `TrendSparkline.tsx` 与 `globals.css` 均无 `--accent`，且 `--blue`/`--track`/`--text-3`/`--card-bg` 在明暗双主题下均有定义）；每 metric 一条 sparkline、按 metric 纵向排列；IPC 走白名单 + `assert_valid_sender`；`select_trend_api` 分权矩阵对照 T001 的 `select_grok_api` 模式（usage/agent/未知放行，setting/tray disabled），单测覆盖；失败不写缓存的逻辑正确。`idx_trend(provider, account_id, metric_id, observed_at)` 索引覆盖范围扫描，`EXPLAIN QUERY PLAN` 由集成测试断言命中且排除 `idx_lookup`。`query_trend_series` 正确做 UTC 日桶 + 缺日填 null + snake→camel 命名转换（`row_to_observation` 已统一处理）。`build_trend_series` 是纯函数，percent 归一 + clamp 正确。TrendSparkline 的 SVG 结构（viewBox 560×150、0/50/100% 网格、左侧刻度、渐变面积、折线、圆点）与 spec 参考一致。

主要缺陷集中在文档同步：log.md 仍是「未开始」，与已完成的 working tree 严重脱节，且 spec/plan 与实现的落位分歧（`shared/lib/trend.ts` vs `provider-usage.ts`）未在 log 留痕。代码层面仅 4 条 low 级别打磨项（days 容错、cache key 转义、ratio 测试真实性、ProviderAccountRow 单测缺口），不阻塞 adoption。

建议：先补 log.md（f001）解除文档阻塞，f003/f004/f005/f006 列为后续 polish 或交测试 agent 复核。
