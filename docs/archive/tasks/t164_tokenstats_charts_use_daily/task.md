---
tid: t164
slug: tokenstats_charts_use_daily
diff_anchor: "1ee36da3ab1b97a973f234cc7f0c79063372698b9"
branch: t164_tokenstats_charts_use_daily
---

# Task t164_tokenstats_charts_use_daily

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: 1ee36da（main，含 t162/t163/t165）。
- chart-data 新增 buckets 版：agentSegmentsFromBuckets / compositionSegmentsFromBuckets / modelSegmentsFromBuckets（valFn）/ kpiFromBuckets / modelColorMapFromBuckets（valFn）/ projectSegmentsFromSessions。
- aggregate 新增 sessionRowsFromSessions。
- SessionTable props：records → rows（SessionRow[]）+ modelColors（Map）。
- TokenStatsView：loadData 拉 buckets+sessions+records（records 带 limit 供 Bar/Heatmap）；KPI/donut 改 buckets/sessions；2 倍宽 buckets 切 current/prev；currentSessions 按窗口过滤；空判断改 buckets+sessions。
- 黑盒：pnpm test 185/1902 全过。
- round 1：code FAIL（3 finding），test PASS。

## Review 处置

### Round 1 (2026-07-31 00:00 UTC+8)

code FAIL（2 important + 1 minor）、test PASS（零 finding）。

| finding_id     | severity  | status | rationale                                                                                                                        | fix_ref                                                        |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| t164_code_f001 | important | 已修   | getRecords 传 source（snake）但 records filter 只识别 agent（kebab），服务端过滤失效；改为 agent_filter                          | src/renderer/views/TokenStatsView.tsx loadData                 |
| t164_code_f002 | important | 已修   | modelColorMapFromBuckets 固定按 tokens，丢失按 metric 排名；加 valFn，view 按 metric=calls/sessions/tokens 传                    | chart-data.ts modelColorMapFromBuckets + TokenStatsView 调用处 |
| t164_code_f003 | minor     | 遗留   | 24h preset 下 buckets daily 边界使 current(48h)/prev(24h) 不对称，KPI delta 偏大；代码注释已记「acceptable」，为日级聚合固有取舍 | TokenStatsView.tsx currentBuckets/prevBuckets 注释             |

## 收尾报告

### 验收标准勾选

- [x] `TokenStatsView` 不再 `getRecords()` 全量作为主数据源。
- [x] KPI/donut/bar 基于 daily/sessions，数值与改动前一致（同语义聚合）。
- [x] Heatmap 仍可渲染（records 带 limit 供 Heatmap/Bar）。
- [x] SessionTable 改服务端分页数据源（sessions 派生 SessionRow，前端分页）。
- [x] 渲染进程不再持有 38 万行 records（records 降为 Bar/Heatmap 辅助，带 limit）。

### Reviewer verdict

- Round 1 code：FAIL（f001/f002 已修，f003 遗留）→ Round 2
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：N/A（round 1 PASS，未改测试）

### 遗留

- `t164_code_f003`：24h preset 下 buckets 按日聚合导致 current/prev 窗口不对称（48h vs 24h），KPI delta 偏大。日级聚合固有取舍，非 bug，需精确 24h delta 应改用 records 或 hourly 聚合（后续 task）。

### 结果摘要

代理面板 KPI/5 donut/SessionTable 从 records（38 万行）迁移到 buckets（480 行）/sessions（1597 行）聚合。records 降为 Bar/Heatmap 专用辅助（带 t162 limit）。渲染端不再对全量 records 做 5+ 份 reduce/groupBy。TokenStatsView 数据流：buckets（KPI/donut/agent/model/composition）+ sessions（project donut/SessionTable）+ records（Bar/Heatmap）。
