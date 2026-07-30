---
tid: t168
slug: tokenstats_24h_precise_delta
diff_anchor: "b47b837f0ec4aa186eaf1e3d4520de520fbf61a3"
branch: t168_tokenstats_24h_precise_delta
---

# Task t168_tokenstats_24h_precise_delta

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- diff_anchor: b47b837（main，含 t162-t167）。
- 方案 A：窗口 ≤25h（is_short_window）KPI/donut 改 records 驱动（精确 epoch 切 current/prev），≥7d 仍 buckets。
- TokenStatsView：组件级 is_short_window；loadData 短窗口 records 拉 2 倍宽 + limit 50000；prevRecords（prevRangeRecords 半开区间）；KPI/composition/hitRate/agentSegments/modelSegs 短窗口走 records 版，长窗口 buckets 版。
- 黑盒：pnpm test 1909 全过（+1 24h 测试）。
- round 1：code FAIL（1 minor），test PASS。

## Review 处置

### Round 1 (2026-07-31 05:30 UTC+8)

code FAIL（1 minor）、test PASS（零 finding）。

| finding_id     | severity | status | rationale                                                                                                            | fix_ref                                           |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| t168_code_f001 | minor    | 已修   | prevRecords 用闭区间 filtered，与 prevRangeRecords 半开区间语义不一致，边界 record 重复计；改用现成 prevRangeRecords | src/renderer/views/TokenStatsView.tsx prevRecords |

### Round 2 (2026-07-31 05:35 UTC+8)

code PASS，零 finding。

## 收尾报告

### 验收标准勾选

- [x] 24h preset KPI delta 基于精确 24h 窗口（records epoch 切），不再偏大。
- [x] 7d/30d preset KPI delta 与改动前一致（buckets 驱动不变）。
- [x] 24h KPI 数值合理（current/prev 窗口对称，prevRangeRecords 半开区间无重叠）。
- [x] 单测覆盖 24h 窗口切分。

### Reviewer verdict

- Round 1 code：FAIL（f001 已修）
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：N/A（round 1 PASS，未改测试）

### 遗留

- 无

### 结果摘要

24h preset KPI/donut delta 改用 records 驱动（精确 epoch 切 current/prev），消除 buckets 日级边界导致的 current(48h)/prev(24h) 不对称。≥7d 保留 buckets 驱动（日级误差占比小）。is_short_window 阈值 25h 区分两路径。
