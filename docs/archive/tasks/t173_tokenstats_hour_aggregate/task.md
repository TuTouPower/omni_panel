---
tid: "t173"
slug: "tokenstats_hour_aggregate"
title: "代理面板 7d+小时粒度柱状图改走 hour 聚合（消除 records LIMIT 截断）"
status: "done"
branch: "t173_tokenstats_hour_aggregate"
worktree: ""
review_level: "full"
diff_anchor: "b39c6f105c2840b87aaacf4f246a07d6ba249e3d"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 全链路接线：`query_hour_buckets`（store SQL，按 UTC+8 本地整点小时 × model 分组）→ `TOKEN_STATS_HOUR_BUCKETS` IPC → preload `getHourBuckets` → local-api `/v1/hourBuckets` → `usageboard-web.ts` web bridge → `TokenStatsView` 拉取 → `BarChart` 新增 `hourBuckets` prop 选源。hour 起点公式 `timestamp - ((timestamp + 28800000) % 3600000)` 与渲染层 `bucketize` hour 边界对齐（s005 spike 用真实 DB 比对验证）。
- 渲染选源优先级（BarChart useMemo）：time 轴 + hour 粒度 + hourBuckets 非空 → 聚合；time 轴 + day 粒度 + buckets → day 聚合；否则 records。24h 短窗口 hour 图保持 records 路径（无截断问题，非范围）。
- review Round 1 暴露真实缺陷（f005）：`bucketize.idx` 对 `ts<=start` 返回 0、`ts>=end` 返回 n-1 的 clamp，使窗口外整点桶错位进首/尾桶——越界桶用例先红，实现补 whole-hour 范围守卫（只保留 `hour_start ∈ [floor(start), floor(end)]`）后绿。
- 门控两轮收紧：初版仅 `!is_short_window` 无条件拉聚合（f002：默认 30d+day 白跑全表聚合）→ 补 `gran !== "hour"` 短路；Round 2 再补 `!time_axis`（f003：gran=hour 但 x 轴切 project/session 时聚合不被消费）。
- 接线测试（f001 important）：view 测试 BarChart mock 补 `hourBuckets` prop 类型；正向 7d+小时断言调用与转发，负向 24h/day/非 time 轴断言不调用。跨用例共享 localStorage prefs（gran 会残留），负向用例需先 `localStorage.clear()`。
- 本机 better-sqlite3 首次并发加载偶发瞬时抖动（4 文件合并跑 store 测试 38 例全失败，单文件重跑绿），未归因 t173。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-07-31 23:40 UTC+8)

code + test 两路并行首轮：code PASS（2 minor）、test FAIL（f001 important + 5 minor）。f001 逐条处置如下，f002-f006 全修。

| finding_id     | severity  | status | rationale                                                                                                      | fix_ref                                 |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| t173_code_f001 | minor     | 已修   | 维持 (hour,model) distinct 口径（与 day 桶一致），修正 chart-data.ts 注释并 spec 上下文区补「sessions 口径」节 | chart-data.ts:377                       |
| t173_code_f002 | minor     | 已修   | hour_fetch 门控 `gran !== "hour"` 即跳过，loadData 依赖补 gran，默认 day 视图不再白跑聚合                      | TokenStatsView.tsx:229                  |
| t173_test_f001 | important | 已修   | view 补接线用例：7d+小时断言 getHourBuckets 调用并转发 hourBuckets；24h/day 断言不调用                         | token_stats_view.test.tsx:477           |
| t173_test_f002 | minor     | 已修   | store 聚合用例补行数断言（3 条明细 → 2 行 hour×model）                                                         | token-stats-store.test.ts:816           |
| t173_test_f003 | minor     | 已修   | 跨小时用例补每行 `sessions === 1` 断言                                                                         | token-stats-store.test.ts:771           |
| t173_test_f004 | minor     | 已修   | web 桥与 /v1/hourBuckets 各补用例（仿 heatmap 平行先例）                                                       | usageboard-web.test.ts / server.test.ts |
| t173_test_f005 | minor     | 已修   | 越界桶用例暴露真实缺陷：bucketize.idx clamp 使窗口外桶错位进首/尾桶，实现补 whole-hour 范围守卫                | chart-data.ts:372                       |
| t173_test_f006 | minor     | 已修   | 逐 model series 值断言补入聚合用例                                                                             | chart-data.test.ts:445                  |
| t173_code_f003 | minor     | 已修   | 门控补 `!time_axis`（metric 非 sessions 且 xaxis 非 time 即跳过），loadData 依赖补 metric/xaxis                | TokenStatsView.tsx:232                  |
| t173_test_f007 | minor     | 已修   | spec 上下文区测试策略补参数化说明（2-4 桶用例语义等价 168 桶）                                                 | spec.md 测试策略                        |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - 全量测试 1956 passed / 1 skipped（185 文件）；typecheck / lint / arch（239 modules）/ format:check / `pnpm build` 全部通过。
    - AC1/AC3（store 聚合）：`token-stats-store.test.ts` hour bucket describe 4 用例——最早日期不丢、hour×model 聚合值、跨小时 sessions distinct、env/agent 过滤。
    - AC2（行数）：聚合用例断言 3 条明细 → 2 行 hour×model。
    - AC1/AC2（渲染接线）：`token_stats_view.test.tsx` 新增 7d+小时 → `getHourBuckets` 调用 + `hourBuckets` 转发；24h/day/非 time 轴 → 不调用。
    - AC4（web）：`usageboard-web.test.ts` 过滤参数转发；`server.test.ts` `/v1/hourBuckets` 无鉴权 + 过滤生效。
    - 越界桶真实缺陷（f005）：`bucketize.idx` clamp 使窗口外桶错位进首/尾桶，`prepareBarDataFromHourBuckets` 补 whole-hour 范围守卫，chart-data.test.ts 越界桶用例锁定。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `tasks-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（f001 important + 5 minor，全部已修）
- Round 2 code：PASS（新发现 f003 minor，已修）
- Round 2 test：PASS（新发现 f007 minor，已修）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 7d/30d + 小时粒度柱状图改走 `query_hour_buckets` 查询时聚合，消除 records LIMIT 截断导致的早期小时丢失；渲染接线、web/ipc 层、越界桶守卫均有测试锁定。
