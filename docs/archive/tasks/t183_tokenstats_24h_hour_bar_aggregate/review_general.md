# Task review t183（reviewer_focus: 通用）

- task：`t183_tokenstats_24h_hour_bar_aggregate`
- spec：`docs/tasks/t183_tokenstats_24h_hour_bar_aggregate/spec.md`
- diff_anchor：`3b5b9f6443ef80b0d08ae9a6ef54070c8958689f`
- target：`git diff 3b5b9f6443ef80b0d08ae9a6ef54070c8958689f`
- round：1
- reviewed_at：2026-08-01 18:20 UTC+8

## Findings

### t183_gen_f001 - chart-data.ts 注释过期：仍称 24h 小时柱走 records

- 严重度：minor
- 锚点：行为变更后遗留的过期描述（`prepareBarDataFromHourBuckets` 现已被 24h preset 使用）
- 位置：`src/renderer/lib/token-stats/chart-data.ts:389-392`
- 问题：注释「The 24h window still uses records, which dedupe sessions per project instead, so the two windows can differ when one session spans models in an hour」在本任务后已失实：24h preset 时间轴小时柱已改走 `prepareBarDataFromHourBuckets`，不再用 records。后续维护者（尤其 t184 处理 KPI/donut 时）会据此误判 24h 小时柱数据源。功能不受影响，属描述性失实。
- 建议：改写为「24h preset 小时柱同样使用 hour 聚合；24h KPI/donut 仍走 records（t184）」。

### t183_gen_f002 - BarChart.tsx 属性注释过期：仍限定 >=7d

- 严重度：minor
- 锚点：行为变更后遗留的过期描述
- 位置：`src/renderer/components/token-stats/BarChart.tsx:20-22`
- 问题：`hourBuckets` 属性 docstring 写「(>=7d + hour granularity, t173)」，t183 后 24h preset 的小时柱也消费该属性。
- 建议：补充 24h，改为「(24h/>=7d + hour granularity)」。

### t183_gen_f003 - TokenStatsView.tsx 注释重复：旧块未删除与新块并存

- 严重度：minor
- 锚点：同一事实两处定义，且旧块表述与新行为矛盾
- 位置：`src/renderer/views/TokenStatsView.tsx:226-246`
- 问题：新注释块（235-246）直接追加在旧块（226-233）之后，旧块「Hour bar data for wide windows at hour granularity」与末尾「(effectiveXaxis forces "time" ...)」两句与新块重复且被新块取代。违反「同一事实只保留一个权威定义」。
- 建议：删除被取代的 226-233 旧注释块，保留新块。

## 结论

- 前轮 finding 复核：Round 1，无
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
    - custom ≤25h 范围（`preset===null` 且 `is_short_window`）小时柱仍走 records（LIMIT 50000），存在与 p020 相同的早时段截断风险——spec 非范围、task 明确保守沿用，不进 finding；如需修复应单独立项。
    - task.md 记载「renderer 全 886 绿」，本轮实际 renderer 目录 737 passed；全量 vitest 1967 passed + 1 skipped 与 task.md 一致。数字差异不影响结论。
    - 24h 小时柱空聚合回退 records 属既有 t173 设计（BarChart `length > 0` 守卫），两查询同源同表，一致性风险低，未出 finding。
- 总体判断：实现正确性经逐项验证——`hour_fetch` 条件真值表（24h fetch / 7d·30d 不变 / custom≤25h 保守跳过 / day 粒度与非 time 轴跳过）、`preset` 已补入 `useCallback` deps、新测试对回退有判别力（三项新断言在条件回退时均会失败）、AC1-AC4 均有对应测试覆盖。仅有 3 条注释类 minor，无 blocking。
- 系统性 follow-up：无

verdict: PASS
