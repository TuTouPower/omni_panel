# Task review t168（reviewer_focus: 代码）

- task：`t168_tokenstats_24h_precise_delta`
- spec：`docs\tasks\t168_tokenstats_24h_precise_delta/spec.md`
- diff_anchor：`b47b837f0ec4aa186eaf1e3d4520de520fbf61a3`
- target：`git diff b47b837`
- round：1
- reviewed_at：2026-07-31 02:10 UTC+8

## 审查范围

`src/renderer/views/TokenStatsView.tsx`（+73 / -25）。测试 diff 属 test reviewer 职责，未评审。

## 规格合规

| AC                              | 落地                                                                                                                                                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24h KPI delta 基于精确 24h 窗口 | ✓ `is_short_window` 分支用 records（TokenStatsView.tsx:362-394），fetch 2x 宽（line 213-215），prevRecords 精确切分（line 295-302）                                                                                                               |
| 7d/30d 不回归                   | ✓ else 分支保留 t164 全部 buckets 路径（kpiFromBuckets / compositionSegmentsFromBuckets / agentSegmentsFromBuckets / modelSegmentsFromBuckets / 原 buckets hitRate 公式），对照 `git show b47b837:src/renderer/views/TokenStatsView.tsx` 完全一致 |
| 24h KPI 数值对称                | ✓ current/prev 窗口宽度均 = width（fetch 端点对称）                                                                                                                                                                                               |
| 单测覆盖                        | test reviewer 职责                                                                                                                                                                                                                                |

`is_short_window` 阈值 `<= 25 * 3600000`：24h preset (24h) 命中，7d (168h) / 30d (720h) 不命中。合理。

## Findings

### t168_code_f001 - prevRecords 用闭区间 filtered 导致 current/prev 边界单点重叠

- 严重度：minor
- 位置：`src/renderer/views/TokenStatsView.tsx:295-302`（prevRecords 用 `filtered`）；对照 `src/renderer/lib/token-stats/filter.ts:7-14`（`r.timestamp <= opts.end` 闭区间）；`src/renderer/lib/token-stats/aggregate.ts:170-179`（`prevRangeRecords` 用半开 `< prevEnd`）
- 问题：`filtered` 是闭区间（`<=`）。`currentRecords` = `[start, end]`，`prevRecords` = `[start - width, start]`。两端在 `timestamp === currentRange.start` 处重叠，落入该精确 ms 的 record 同时计入 current 与 prev，造成 delta 微偏。同库 `prevRangeRecords`（aggregate.ts:175-178）已用半开区间 `>= prevStart && < prevEnd` 处理此场景，命名意图明确；此处应复用同一语义。
- 失败场景：某条 record 的 `timestamp` 恰好等于窗口 `start`（ms 精度），该 record 的 tokens/calls/sessions 被同时计入 currentKpi 和 prevKpi，delta 百分比失真（影响 = 1 条 record 量级，实际几乎无数据落在精确 ms，但语义上不对称）。
- 建议：`prevRecords` 改用 `prevRangeRecords(agentFiltered, currentRange)`（已存在的 helper），或显式写 `end: currentRange.start` 后在 filtered 之外再 `.filter(r => r.timestamp < currentRange.start)`。前者复用现成函数更符合 DRY。

## 结论

- 前轮 finding 复核：N/A（Round 1）
- 本轮新发现：1 条（minor）
- 总体判断：AC 覆盖完整，长窗口路径与 t164 逐行一致无回归，短窗口 records 分支数据流正确。唯一问题：prevRecords 用闭区间 `filtered` 与同库 `prevRangeRecords` 半开区间语义不一致，造成 current/prev 在窗口起点 ms 单点重叠。影响极小（实际几乎无 record 落在精确 ms），但语义不对称，建议复用 `prevRangeRecords`。

verdict: FAIL

## Round 2 (2026-07-31 02:35 UTC+8)

### 前轮 finding 复核

- **t168_code_f001（minor，已修）**：`src/renderer/views/TokenStatsView.tsx:297-300` 将 `prevRecords` 从闭区间 `filtered` 改为 `prevRangeRecords(agentFiltered, currentRange)`；`prevRangeRecords`（aggregate.ts:170-179）实现为 `r.timestamp >= prevStart && r.timestamp < prevEnd`（半开 `[start-width, start)`），与 `currentRecords`（`filtered`，闭区间含 `end`）在 `timestamp === currentRange.start` 处不再重叠。import 行（TokenStatsView.tsx:16）已加入 `prevRangeRecords`。修复彻底，边界单点重叠消除。

### 本轮新发现

无。复核范围内仅 prevRecords 派生与 import 改动；`npx tsc --noEmit` 通过；返回类型 `AgentSessionUsage[]` 与原 `filtered` 一致，下游 `metricValue` / `hitRateOf` 调用无类型偏移。

### 结论

前轮唯一 finding 已修，本轮 0 新发现。

verdict: PASS
