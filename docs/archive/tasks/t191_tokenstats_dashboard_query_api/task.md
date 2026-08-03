---
tid: "t191"
slug: "tokenstats_dashboard_query_api"
title: "P2 代理面板统一聚合查询契约"
status: "done"
branch: "t191_tokenstats_dashboard_query_api"
worktree: ""
review_level: "full"
diff_anchor: "b52b249ef91ff14afbef76e33216e13c6566d581"
depends_on: "t190"
conflicts_with: ""
note: "P2"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 单一 dashboard query 契约：`query_dashboard()` 在 SQL 层聚合 current/previous summary、time/project/session 轴 chart、UTC+8 heatmap、bounded session page；renderer 一次 `getDashboard` 取回完整可见面板，正常路径零 records 调用。
- alias-before-TopN：summary/chart 在 Top5/Top20 截断前应用 dir/model resolver，避免 `其他` 桶内 alias 无法回拆。
- current/previous 半开窗口 `[start,end)`/`[start-width,start)` 统一；day gran 直接按 UTC+8 日 SQL 聚合，避免约 24 倍中间 hour group。
- session 分页 `LIMIT @session_limit OFFSET @session_offset` + `has_more = total > offset + items.length`；renderer 用 query identity + request_id 守卫防筛选切换后旧 offset/旧响应回填。
- query cache key 纳入 alias fingerprint 与 session_offset，避免 alias 配置变化命中旧 DTO。
- local API `/v1/dashboard` 解析 JSON 编码 alias 并透传分页参数；web adapter 同步透传。
- migration v5 新增 `idx_records_ts`、`idx_records_session_ts`；`query_records` 加 `message_id ASC` 确定性排序。
- 新增 `idx_records_env_ts` 等索引后同 timestamp 行返回顺序变化，修正既有测试期望为确定性排序结果。

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

### Round 1 (2026-08-03 14:10 UTC+8)

| finding_id     | severity  | status | rationale                                                                 | fix_ref                              |
| -------------- | --------- | ------ | ------------------------------------------------------------------------- | ------------------------------------ |
| t191_code_f001 | important | 已修   | `has_more` 改为 `total > offset + items.length`，补中间页/末页断言        | token-stats-store.ts:1092            |
| t191_code_f002 | important | 已修   | local API 解析 JSON alias，web adapter 透传分页与 alias，非法 JSON 回 400 | server.ts:288；usageboard-web.ts:235 |
| t191_code_f003 | minor     | 已修   | `session_offset` 加 `.max(100_000)`                                       | token-stats.ts:273                   |
| t191_code_f004 | minor     | 遗留   | 单请求多次全窗口聚合，登记 pending                                        | p027                                 |
| t191_code_f005 | minor     | 遗留   | 相关子查询按分组重复 lookup，登记 pending                                 | p028                                 |
| t191_code_f006 | minor     | 遗留   | 翻页重算整个 dashboard，登记 pending                                      | p029                                 |
| t191_code_f007 | minor     | 遗留   | `freshness.stale` 恒 false，登记 pending                                  | p030                                 |

### Round 1 (2026-08-03 14:10 UTC+8) 测试

| finding_id     | severity  | status | rationale                                                          | fix_ref                                                |
| -------------- | --------- | ------ | ------------------------------------------------------------------ | ------------------------------------------------------ |
| t191_test_f001 | important | 已修   | 补独立 raw-record oracle（current/previous tokens/sessions/calls） | token_stats_dashboard.test.ts:272                      |
| t191_test_f002 | important | 已修   | MetricDonut mock 保留 props，新增 KPI/delta 断言                   | token_stats_view.test.tsx:298                          |
| t191_test_f003 | important | 已修   | 补 IPC QUERY_FAILED/INVALID_RESPONSE 与 schema 边界                | token-stats-ipc.test.ts；token_stats_dashboard.test.ts |
| t191_test_f004 | important | 已修   | SessionTable mock 暴露翻页，断言 onPageChange→offset=100           | token_stats_view.test.tsx:311                          |
| t191_test_f005 | important | 已修   | 迁移旧竞态用例到 getDashboard 双 deferred                          | token_stats_view.test.tsx:352                          |
| t191_test_f006 | important | 已修   | 成对 fixture 验证 DTO 随分组而非消息数增长                         | token_stats_dashboard.test.ts:329                      |
| t191_test_f007 | minor     | 已修   | renderer alias 透传 + integration model_aliases 生效               | token_stats_view.test.tsx:370；server.test.ts          |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC1-AC6 对应实现与测试如下。
    - AC1：`TokenStatsView` 一次 `getDashboard` 取回完整 DTO，`token_stats_view.test.tsx` 断言 1 次请求与 records 零调用。
    - AC2：`token_stats_dashboard.test.ts` raw-record oracle 独立核算 current/previous tokens/sessions/calls，含半开边界与 excluded 记录。
    - AC3：`uses one range and filter semantic across platform and agent` 覆盖 agent/platform 组合；chart/heatmap/session 同窗口。
    - AC4：正常/切换/collector 刷新路径零 records 调用；`keeps the DTO flat as message count grows` 成对 fixture 验证 DTO 随分组而非消息数增长。
    - AC5：session 分页 `LIMIT/OFFSET` + `has_more = total > offset + items.length`；renderer `onPageChange` 触发 offset=100 二次请求。
    - AC6：IPC/local API 均做 query 与 DTO 运行时校验；非法输入回 INVALID_ARGUMENT/400，store 异常回 QUERY_FAILED/500；旧 IPC 入口保留。
- 验证：`pnpm typecheck` / `pnpm lint` / `pnpm test`（2017 passed, 1 skipped）全通过；`pnpm build` main/preload/renderer/web 均成功。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL
- Round 2 code：PASS（含独立复核 PASS）
- Round 1 test：FAIL
- Round 2 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- t191 单一 dashboard query 契约落地；3 条 important 已修，4 条 minor 效率/占位问题遗留登记 pending；code/test 均 PASS。
