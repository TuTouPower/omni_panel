---
tid: "t217"
slug: "session_axis_key_env"
title: "session 轴会话 key 补 env"
status: "done"
branch: "t217_session_axis_key_env"
worktree: ""
review_level: "full"
diff_anchor: "c41e15e008d74b052d6807ebe9b7a2cba70ebf2d"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

创建期核实（2026-08-05，只读仓库）：

- `tokenStatsRollupRowSchema`（shared/types/token-stats.ts:221-232）确认不含 env。
- SQL 侧已含 env：`token-stats-store.ts:537,557,611` SELECT env、`:620` GROUP BY 含 env；`rollup_row_from:641-650` 已取 env（`DashboardRollupRow = TokenStatsRollupRow & { env }`，:315）。缺的只是 schema 公开字段 + renderer session_key 收口。
- renderer `chart-data.ts:1090` session_key = `${source}|${session_id}`，sessions 去重 Set 同键（:1098-1099）。
- 其他消费方 `query_range_rollup`（KPI/donut 等）不依赖 env，新增字段向后兼容。

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

### Round 1 (2026-08-05 21:58 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                          | fix_ref                                      |
| -------------- | --------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| t217_code_f001 | minor     | 遗留   | legacy `prepareBarDataFromRollup`/`rollup_group_metric`（当前 rollup prop 恒 never[] 不可达）仍按裸 session_id——超本 task 范围，登记 p052 复发陷阱 | p052                                         |
| t217_code_f002 | minor     | 已修   | spec 范围 item 2 改写为实际改动（SELECT 补 env、GROUP BY 补 env），非「仅类型收口」                                                                | docs/tasks/t217_session_axis_key_env/spec.md |
| t217_test_f001 | important | 已修   | 新增「sessions metric 按含 env 的 session key 去重」用例：跨 env 同 session_id 各计 1、两个 category                                               | tests/.../chart-data.test.ts                 |
| t217_test_f002 | minor     | 已修   | schema env 序列化断言由 store 跨 env 拆行用例覆盖（行含 env 字段）；保留既有 envs 断言                                                             | tests/.../token-stats-store.test.ts          |

### Round 2 (2026-08-05 22:05 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                                                                   | fix_ref |
| -------------- | -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| t217_test_f002 | minor    | 遗留   | schema 序列化无独立 zod 测试：store 用例走 `as TokenStatsRollupRow[]` 强转不经 schema parse，schema 移除 env 时该用例仍绿——IPC 边界 safeParse 剥 env 的回归无拦截；维持 minor，登记 p052 一并留意（不阻断） | p052    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1 rollup schema 含 env：`tokenStatsRollupRowSchema` 加 `env`（对齐 tokenStatsEnvSchema），main 侧 DTO safeParse 不再剥离 env；store 跨 env 拆行用例断言行含 env 字段。
    - AC2 session 轴跨 env 同 session_id 独立 category：chart-data 用例（tokens 变体）断言两个 labels（win/wsl session）。
    - AC3 sessions 计数按含 env key 去重：新增用例（metric="sessions"+xaxis="session"）跨 env 同 session_id 各计 1、total=2；旧 session_key 判红。
    - AC4 time/project 轴不回归：chart-data 既有 time/project 用例全绿。
    - `pnpm test` 全量 2344 通过、typecheck、lint 通过。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL（t217_test_f001 sessions 去重无测试，已修）
- Round 2 test：PASS（f001 消除；f002 minor 遗留 p052，不阻断）

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

session 轴会话 key 补 env：schema + query_range_rollup（SELECT/GROUP BY 补 env）+ renderer session_key 三处收口，跨平台同 session_id 会话不再合并。2 轮 review 收尾 code PASS / test PASS，唯一遗留 minor（schema 序列化独立测试）登记 p052。
