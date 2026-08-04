---
tid: "t200"
slug: "tokenstats_query_key_trim"
title: "TokenStats 查询缓存 key 精简（展示维度与翻页）"
status: "done"
branch: "t200_tokenstats_query_key_trim"
worktree: ""
review_level: "full"
diff_anchor: "7303c417097b55f806f4423db2e1116cd3de7d85"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

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

### Round 1 (2026-08-04 11:00 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                                        | fix_ref                                                     |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| t200_code_f001 | critical  | 已修   | `gran` 回补 `TokenStatsQueryKey` 与 `serialize_key`（query-cache.ts:7,53）；loadData query_key 补 `gran`；query-cache 测试恢复 gran 维度隔离用例                                                                 | src/renderer/lib/token-stats/query-cache.ts:7               |
| t200_code_f002 | important | 已修   | loadData 按 `session_data_identity`（含范围）重置分页；onUpdated 预设刷新变更 currentRange → 翻页页落回新 dashboard 首页。补 AC3 测试验证 stale 页不落地                                                         | src/renderer/views/TokenStatsView.tsx:324                   |
| t200_code_f003 | minor     | 遗留   | rollup DTO 补 `env` 会改变 `query_range_rollup` 分组/校验语义，改动面广；session_id 碰撞概率低                                                                                                                   | p040                                                        |
| t200_code_f004 | minor     | 已修   | 三处 `cells_to_bar_data` 的 `otherDetails` 补 `.slice(0,20)` 与名称 tie-break，与改前服务器一致                                                                                                                  | src/renderer/lib/token-stats/chart-data.ts:1038             |
| t200_test_f001 | critical  | 已修   | 与 code_f001 同源，gran 回补后同修                                                                                                                                                                               | 同 code_f001                                                |
| t200_test_f002 | important | 已修   | 新增 oracle 等价测试：diff_anchor 的 dashboard_chart_from_rollup/cells 转写为参考实现，与 renderer prepareBarDataFromDashboardRollup 在 6 个 metric×xaxis 组合（含别名）下比对 labels/series/otherDetails 全等价 | tests/unit/renderer/lib/token-stats/chart-data.test.ts:1016 |
| t200_test_f003 | minor     | 已修   | 补 `prepareBarDataFromDashboardChartData` 别名用例：project 轴 dir 别名合并、time 轴 model 别名合并                                                                                                              | tests/unit/renderer/lib/token-stats/chart-data.test.ts:989  |

### Round 2 (2026-08-04 12:00 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                              | fix_ref                                                   |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| t200_code_f005 | minor     | 已修   | `topGroups` 排序补名称 tie-break（`b[1]-a[1] \|\| a[0].localeCompare(b[0])`），与改前服务器 dashboard_named_values 一致；10 处调用获得确定性名称序                         | src/renderer/lib/token-stats/aggregate.ts:40              |
| t200_test_f004 | important | 已修   | 补 topGroups 并列值单测（z 插入在前与 a 并列 → top=["x","a"]）；oracle 用例重写为 6 分组 5/6 边界（目录名令 m6 cell 排前）+ 顺序敏感断言 + m5 进系列 m6 归「其他」；变异实测确认钉住 | tests/unit/renderer/lib/token-stats/aggregate.test.ts:105 |

### Round 3 (2026-08-04 13:00 UTC+8)

Round 3 code 与 test 均 PASS，零新 finding；上一轮 f002/f005 修复验证通过。AC3 custom-range 路径测试与 oracle tie-break 用例已确认有效（去掉对应生产改动即失败）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
  - AC1：`token_stats_view.test.tsx`——切换 metric / xaxis 不新增 dashboard IPC 调用（缓存命中，`get_dashboard` 调用次数不变），展示由 renderer 派生（BarChart 收到 `chartData`，chart-data oracle 测试锚定等价）。
  - AC2：`token_stats_view.test.tsx` 翻页测试——`getDashboardSessions` 通道单次请求、`session_offset=100`，dashboard 不重拉（`get_dashboard` 次数不变）。
  - AC3：preset 与 custom-range 两条路径的 committed-bump 测试——stale 翻页页不落地；数据版本相同复用缓存、更新触发刷新（既有 AC4 测试覆盖）。
  - AC4：chart-data.test.ts oracle——diff_anchor 服务器 chart 构建器转写为参考实现，6 个 metric×xaxis 组合（含别名）+ Top5 并列 tie-break 下 labels/series/otherDetails 与 renderer 派生全等价。
- 黑盒：`pnpm test` 205 文件 2139 passed / 1 skipped；`pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm build` 全绿。

### Reviewer verdict

`full`：

- Round 1 code：FAIL（f001 gran 移出 key / f002 stale 翻页 / f003 env minor / f004 otherDetails）
- Round 1 test：FAIL（f001 gran key / f002 缺 oracle / f003 别名无测试）
- Round 2 code：FAIL（f002 仅修预设路径，custom-range 仍 stale；f005 tie-break minor）
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：FAIL（t200_test_f004 tie-break oracle 用例未验证其声称行为）
- Round 4 test：PASS

### 结果摘要

query cache key 精简 metric/xaxis/session_offset（保留 gran）、会话翻页独立通道、图表改由 dashboard chart_data 本地派生；4 轮 review 闭环，所有 blocking finding 修复或登记 p040 遗留。
