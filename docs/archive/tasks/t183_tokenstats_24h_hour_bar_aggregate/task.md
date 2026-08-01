---
tid: "t183"
slug: "tokenstats_24h_hour_bar_aggregate"
title: "代理面板 24h 时间柱改走 hour 聚合"
status: "done"
branch: "t183_tokenstats_24h_hour_bar_aggregate"
worktree: ""
review_level: "single"
diff_anchor: "3b5b9f6443ef80b0d08ae9a6ef54070c8958689f"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 根因（p020）：`TokenStatsView` 的 `hour_fetch` 条件含 `is_short_window`（24h ≤25h），24h preset 跳过 hour 聚合、时间轴小时柱走 records（倒序 LIMIT 50000 截断最早时段）；BarChart 已支持 hourBuckets 分支（t173 为 7d/30d 建的），24h 只差数据源。
- 实现：`hour_fetch` 条件 `is_short_window` 改为 `(is_short_window && preset !== "24h")`——24h preset + hour 粒度 + time 轴 fetch hour 聚合（agent/env 过滤、窗口参数沿用现有），7d/30d 不变，custom ≤25h 范围保守沿用 records。KPI/donut 仍走 records（非范围，t184 处理）。
- 测试：改 `skips the hour bucket fetch on short windows and day granularity` 为 `skips the hour bucket fetch on day granularity`（24h preset 现在 fetch；切 day 粒度仍不 fetch）；新增 `feeds BarChart full 24h hour buckets on the 24h preset (records truncated)`（records 截断到 3h + hour 聚合覆盖 24h，断言窗口参数与 hourBuckets 透传）与 `passes agent and env filters to the hour bucket fetch on the 24h preset`（OpenCode + WSL → agent=opencode, env=wsl）。
- 踩坑：lint `restrict-template-expressions` 报测试里 `rec-${i}`（i:number 需 String(i)）；`useCallback` deps 缺 `preset`（hour_fetch 现读 preset）。
- 验证：token_stats_view 16 绿；renderer 全 886 绿；全量 vitest 1967 passed（1 存量 skipped）；typecheck/lint 绿；build:web 成功；synthetic 全量 web e2e 48 passed。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-01 18:30 UTC+8)

Round 1 general 3 条 minor（均注释类，已修）。

| finding_id    | severity | status | rationale                                                              | fix_ref                                             |
| ------------- | -------- | ------ | ---------------------------------------------------------------------- | --------------------------------------------------- |
| t183_gen_f001 | minor    | 已修   | chart-data.ts 注释「24h still uses records」失实，改为短窗口用 records | src/renderer/lib/token-stats/chart-data.ts:389      |
| t183_gen_f002 | minor    | 已修   | BarChart hourBuckets docstring 限定 >=7d 漏 24h，补 t183               | src/renderer/components/token-stats/BarChart.tsx:20 |
| t183_gen_f003 | minor    | 已修   | TokenStatsView 旧注释块与新块并存且矛盾，删旧块                        | src/renderer/views/TokenStatsView.tsx:226           |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1——24h preset 时间轴小时柱 `hour_fetch` 改走 `getHourBuckets`（无 LIMIT，GROUP BY 覆盖完整 24h），records 截断回归测试断言全窗口参数透传 + hourBuckets 非空；AC2——`prepareBarDataFromHourBuckets` 复用（既有 chart-data 测试覆盖 tokens/calls/sessions 与零桶）；AC3——agent/env 过滤测试断言 `agent=opencode`、`env=wsl` 透传，7d/30d 路径未动；AC4——day 粒度跳过 hour fetch 断言保留、7d/30d hour 测试仍绿。全量 vitest 1967 passed（1 存量 skipped）、typecheck/lint 绿、build:web 成功、synthetic 全量 web e2e 48 passed。

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

- 24h preset 时间轴小时柱改走 hour 聚合（`hour_fetch` 条件 `is_short_window` → `is_short_window && preset !== "24h"`），消除 records 倒序 LIMIT 对最早时段的截断；KPI/donut 仍走 records 留待 t184。3 条注释类 minor 已修。
