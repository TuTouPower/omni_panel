# Task review t349（reviewer_focus: 通用）

- task：`t349_chart_data_dedupe`
- spec：`docs/tasks/t349_chart_data_dedupe/spec.md`
- diff_anchor：`3c7021cb37fc9c6b6a32cfaca7043e2848367478`
- target：`git diff 3c7021cb37fc9c6b6a32cfaca7043e2848367478`
- round：1
- reviewed_at：2026-08-13 22:38 UTC+8

reviewed_scope: 3e28c592a4f470c7

## Findings

### t349_gen_f001 - rollup_session_key 提为导出时残留重复 JSDoc

- 严重度：minor
- 锚点：无 AC 违反（注释冗余，功能无影响）
- 位置：`src/renderer/lib/token-stats/chart-data.ts:735-736`
- 问题：`rollup_session_key` 提为导出时新增第二块 JSDoc，旧块（p052/t217）未删除，两个相邻 `/** */` 块并置。TS/ESLint 只认紧跟函数声明的一块，前一块成为被覆盖的死注释。
- 建议：删除旧块或合并为一块注释。

### t349_gen_f002 - prepareBarDataFromRollup 轴 idxOf 仍线性扫描，与 t349 性能目标同构未同步

- 严重度：minor
- 锚点：AC-003 性能目标同源；spec 范围区只列 `prepareBarData`，未列 `prepareBarDataFromRollup`
- 位置：`src/renderer/lib/token-stats/chart-data.ts:871, 888`
- 问题：project 轴 `dirs.indexOf(dir_key(r))` 逐行 O(dirs) 扫描；session 轴 `ranked.findIndex(...)` 逐行 O(rows×20)。rollup rows 有界（数百行），量级可接受，无可观测性能缺陷。属「同形逻辑散落」：t349 已为 `prepareBarData` 建 dir/session Map，`prepareBarDataFromRollup` 同构但未同步。
- 建议：如需彻底一致可同步预构建 Map；否则记录为范围外遗留，不必改。

## 结论

- 本轮新发现：2 条 minor
- AC 复验方式：
  - AC-001（三套镜像收敛为单一生成器，无镜像复制残留）：`re_verified`。逐字比对 11 个入口（agent/composition/model/project × records/buckets/rollup/sessions）与 3 个生成器：agent 键差异保留（records 传 `["claude-code",...]`+`AGENT_LABELS` 连字符键，buckets/rollup 传 `["claude_code",...]`+`BUCKET/ROLLUP_AGENT_LABELS` 下划线键，`agent_color` 经 `replace(/[-_](code)$/,"")` 兼容两套键）；model 默认 valFn 差异保留（`modelSegmentsFromBuckets` 默认 `bucket_tokens`，`modelSegments`/`modelSegmentsFromRollup` 必传）；`top_segments`/`composition_segments` 与原实现逐字一致（含 rest 排序、extra 拼接、escapeHtml、Top5 颜色）。证据：`chart-data.ts:59-64, 415-475, 615-620, 776-781`；三入口 agent 测试分别用 `"claude-code"`（test:81）与 `"claude_code"`（test:615, 821）键且 65 测试全过。
  - AC-002（KPI sessions 与 donut/会话轴按 `source|env|session_id` 去重一致）：`re_verified`。`kpiFromRollup` 改用 `rollup_session_key`（`chart-data.ts:826`），与 `rollup_group_metric`（:756）、`prepareBarDataFromRollup` session 轴（:888, :903）、`prepareBarDataFromDashboardRollup` session 轴（:987, :1032）去重键一致；新增测试（test:807-816）验证跨 env 同 session_id 计 2（裸 session_id 旧实现计 1），断言可区分新旧行为。
  - AC-003（既有单测全过）：`re_verified`。重跑 `pnpm vitest run tests/unit/renderer/lib/token-stats/chart-data.test.ts` → 65 passed；`pnpm typecheck`（tsc --noEmit）退出 0；`eslint src/renderer/lib/token-stats/chart-data.ts tests/unit/renderer/lib/token-stats/chart-data.test.ts --max-warnings=0` 退出 0。
- coverage = 3 / 3
- 未进表的提示：
  - 收敛的 11 个 donut/KPI 函数（agent/composition/model/project 三入口 + kpiFromRollup/kpiFromBuckets）当前生产代码无消费方：视图 `TokenStatsView` 走 dashboard API + `dashboard_segments` + `prepareBarDataFromDashboardChartData`，仅测试消费这些库函数。属既有状态，spec 未要求接入视图。据此，AC-002 中「KPI 面板」表述在当前架构下实际由 `dashboard.current.sessions`（服务端）提供；本 task 对 `kpiFromRollup` 的修复是独立正确的去重键修复，与 rollup 会话轴一致，防未来复用错误。
  - `prepareBarData`（:204-233）与 `prepareBarDataFromRollup`（:918-946）内联的 totals→topGroups→series/otherDetails 逻辑与 `cells_to_bar_data`（:336）同形，未复用。既有重复，spec 范围外。
  - `kpiFromBuckets` 累加 `b.sessions`（buckets 行含 model 维度，同 session 跨 model 可能重复计数）与 `kpiFromRollup` Set 去重口径不同，取决于 SQL 聚合语义。spec 只改 `kpiFromRollup`，范围外。
- 系统性 follow-up：无
- 总体判断：收敛正确、行为等价、AC-001/002/003 均独立复验通过；仅 2 条 minor（注释冗余 + 范围外性能同构未同步），无未解决 critical/important。

verdict: PASS
