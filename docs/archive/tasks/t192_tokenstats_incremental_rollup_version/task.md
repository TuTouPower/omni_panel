---
tid: "t192"
slug: "tokenstats_incremental_rollup_version"
title: "P3 token-stats 增量聚合与数据版本"
status: "done"
branch: "t192_tokenstats_incremental_rollup_version"
worktree: ""
review_level: "full"
diff_anchor: "96cbf53211a5c61821dd608364dc7f2528c6211d"
depends_on: "t191"
conflicts_with: ""
note: "P3"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- Step 1：完成 s008 spike（聚合粒度 C session-hour；后台回填 + records fallback），两条 UNVERIFIED-SPIKE 更新为已验证结论。
- 聚合表 PK 采纳 spike 结论 C：per (source, env, session_id, hour_start, model, directory)，并追加 agent 列——query_dashboard 的 agent 过滤（t191）需要聚合表内可过滤，session 级固定不增加行数量级。
- directory 列允许 NULL：records 的 directory 可空，且 rollup GROUP BY directory 把 NULL 归一组（与 records oracle 一致）。行级 ON CONFLICT UPSERT 对 NULL PK 值永不命中（SQLite 视 NULL 互异），会叠重复行，故增量更新采用「DELETE 该 session 聚合行 + 从 records 全量重建该 session」的会话级重建。
- 窗口任意 [start, end) 与整点小时聚合表的对齐：window_union 拆「完整小时段（聚合表）+ 边界段（records）」UNION ALL，外层 SUM(calls)/SUM(tokens) 与 COUNT(DISTINCT session) 精确还原 records 口径。**踩坑**：窗口不足一个完整小时时（full_start > full_end），原边界公式 `[start, full_start) ∪ [full_end, end)` 会溢出窗口外（如 [07:35,08:00) ∪ [07:00,07:55) = [07:00,08:00)）；改为无完整小时时整个窗口直接走 records。
- session 轴 started_at/ended_at 在聚合路径由 per-session MIN/MAX(timestamp) 子查询提供（聚合表无 timestamp）；title/directory 同理取窗口内最新。子查询走 idx_records_session_ts，读该 session 行数而非全表。
- data version 由 upsert_records 事务内单调递增（records 是 dashboard 数据真相源，sessions/daily 不推进版本）；空批次不推进。manager.start 后 setImmediate 后台回填，仅当 !hour_rollup_ready。
- renderer AC4：onUpdated 事件携带 data_version；TokenStatsView 用 last_data_version ref 比较，事件版本 ≤ 已见版本时跳过 revalidate（复用缓存），web 端事件传 0（无推送通道，视为新数据保持轮询刷新）；竞态沿用 loadData 的 request_id guard。
- 验证：pnpm test 全绿（2039 tests）；typecheck / lint / format:check 通过（format 仅对 mock_server.mjs 保留 warning，该文件非本 task 改动）。

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

### Round 1 (2026-08-03 16:20 UTC+8)

code + test 两路 Round 1 均 PASS；仅 minor finding，逐条处置。code f001 已修（NUL 字面字节改 U+0000 转义序列）；其余 7 条遗留登记 `docs/pending.md` p031-p037。

| finding_id     | severity | status | rationale                                      | fix_ref                                            |
| -------------- | -------- | ------ | ---------------------------------------------- | -------------------------------------------------- |
| t192_code_f001 | minor    | 已修   | touched 键分隔符改 U+0000 转义，文件恢复纯文本 | src/main/core/token-stats/token-stats-store.ts:837 |
| t192_code_f002 | minor    | 遗留   | 双轨重构成本高且无当前缺陷；登记后续重构       | p031                                               |
| t192_test_f001 | minor    | 遗留   | AC2 未受影响行无多 session 直测                | p032                                               |
| t192_test_f002 | minor    | 遗留   | AC3 失败/回滚批次无测试                        | p033                                               |
| t192_test_f003 | minor    | 遗留   | AC4 竞态子句无专门测试                         | p034                                               |
| t192_test_f004 | minor    | 遗留   | AC3 事件版本转发粘合层无测试                   | p035                                               |
| t192_test_f005 | minor    | 遗留   | AC5 读取规模无查询计划断言                     | p036                                               |
| t192_test_f006 | minor    | 遗留   | AC1 重启 ready 持久化无专门测试                | p037                                               |

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：migration v6 建表 + 未就绪；backfill 幂等（两次行数不变）；rollup 与 records oracle 逐行 `toEqual`（token-stats-store.test.ts backfill describe）。
    - AC2：会话级增量（replace 无双计、directory 分裂、NULL 归组）；backfill 后增量 upsert 与独立 records 聚合 oracle 一致。
    - AC3：空批次不推进版本；recount 批次 +1；DTO `data_version` 与 `get_data_version()` 一致（事务内单调递增）。
    - AC4：renderer 事件版本 ≤ 已见版本时复用缓存（无新请求），更新版本触发 revalidate；竞态沿用 request_id guard（token_stats_view.test.tsx）。
    - AC5：100x message 密度下 rollup 表行数恒为分组数、dashboard 响应形状（chart 桶数/session 总数）不变。
    - AC6：表外破坏聚合（UPDATE input_tokens=999999）后 backfill，dashboard 各区域与重建前 `toEqual`。
    - 全量 `pnpm test` 2039 通过；typecheck / lint / prettier 通过（仅 `tests/e2e/fixtures/mock_server.mjs` 保留既有 format warning，非本 task 改动）。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- t192 完成 dashboard 聚合层（session-hour 增量 + data version + 后台回填 + 窗口拆分聚合读取），AC1-AC6 全部满足，Round 1 两路 PASS；8 条 minor finding 处置完毕（1 已修、7 遗留登记 p031-p037）。
