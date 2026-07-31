---
tid: "t170"
slug: "fix_heatmap_weekday_gap"
title: "热力图修复： 窗口走 buckets 避免 LIMIT 截断丢 weekday"
status: "done"
branch: "t170_fix_heatmap_weekday_gap"
worktree: ""
review_level: "full"
diff_anchor: "fe7313965db211188550164352711b4d662a81db"
depends_on: ""
conflicts_with: ""
note: "p010"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## SPIKE s003：方案 A 实验

- 前置：spec 缺失 9 条模板引导语，start 门禁 FAIL；补齐引导语（主仓独立 commit fe73139）后 start 通过。
- SPIKE s003（`docs/spikes/s003_heatmap_aggregate/`）验证：SQLite `strftime('%w'/'%H', ts/1000, 'unixepoch', '+8 hours')` 对 epoch ms 的 weekday/hour 提取与 UTC+8 一致（9 边界用例全过）；30d 60 万行聚合 ~592ms、返回 ≤168 格。结论入 `docs/findings.md` d002。
- 方案选定：方案 A（热力图专用聚合查询）。B（去 LIMIT）30d 全量过重、C（轻量列）不解决截断，弃用。
- 实现：`token-stats-store.query_heatmap`（SQL GROUP BY weekday×hour，一次返回 calls/sessions/tokens 三列）；IPC + preload + local-api `/v1/heatmap` + web API 接线；renderer 新增 `prepareHeatmapFromCells`（weekday 0=周日 → grid 索引 `(weekday+6)%7`），Heatmap 组件改收聚合 cells，TokenStatsView 并行拉 getHeatmap（窗口 start/end）。
- 测试：store 聚合 4 例 + renderer 转换 3 例 + IPC handler 2 例；token_stats_view 原「records LIMIT 100000 喂热力图」测试语义失效，改写为「getHeatmap 聚合喂热力图」。
- 门禁：`pnpm test` 1918 passed、typecheck、lint、build 全过；黑盒 30d 60 万行聚合 590ms 返回 ≤168 格（AC4）。

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

### Round 1 (2026-07-31 16:05 UTC+8)

| finding_id     | severity  | status | rationale                                                                  | fix_ref                                                        |
| -------------- | --------- | ------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- |
| t170_code_f001 | important | 已修   | web getHeatmap 转发 agent/env/start/end 查询参数；/v1/heatmap 路由读 agent | src/web/usageboard-web.ts:201                                  |
| t170_test_f001 | minor     | 已修   | 补 /v1/heatmap 集成测试 + bearer 清单 + web getHeatmap 传参断言            | tests/integration/local-api/server.test.ts:250                 |
| t170_test_f002 | minor     | 已修   | getHeatmap 窗口转发精确断言（7d start/end）                                | tests/unit/renderer/views/token_stats_view.test.tsx:408        |
| t170_test_f003 | minor     | 已修   | 补 +8 跨 UTC 日界翻转用例（UTC 周六 20 时 → 北京周日 04 时）               | tests/unit/main/core/token-stats/token-stats-store.test.ts:703 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/AC2：store `query_heatmap` 测试「7 个 weekday 全有着色」+ token_stats_view「getHeatmap 聚合喂热力图」；黑盒 60k/600k 行两档验证 7 weekday 全返回。
    - AC3：store 聚合三 metric 对拍手工期望（tokens/calls/sessions 与全量 reduce 一致）；跨 +8 日界用例锚定 weekday 语义。
    - AC4：黑盒 30d 60 万行聚合 590ms、返回 ≤168 格；renderer 不再拉全量 records。

### Reviewer verdict

`full`：

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

### 结果摘要

- 热力图数据源由 records+LIMIT 改为 SQL 聚合（weekday×hour GROUP BY，UTC+8），宽窗口不再丢 weekday；web 面过滤透传补齐（Round 2 修复）。
