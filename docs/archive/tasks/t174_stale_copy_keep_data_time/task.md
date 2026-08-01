---
tid: "t174"
slug: "stale_copy_keep_data_time"
title: "stale 副本保留原数据时间，卡片相对时间不再误导为新采集"
status: "done"
branch: "t174_stale_copy_keep_data_time"
worktree: ""
review_level: "full"
diff_anchor: "5c48c6c6858d1eb82d25b649da91c0dd5d03e497"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无（testing.md 声明本仓无独立 doctor_cmd）。
- SPIKE 验证（`.scratch/t174/spike.ts` 实验 + 读码）：stale 副本保留原 observed_at 后同 ts 行为——`query_trend_series` per-day 去重无重复点；`get_latest`/`list_by_instance` 同 ts 无 tie-breaker 不确定；`list_latest_by_provider` 同 ts 全命中多行。决定实现路径：副本保留原 ts + insert 前清同键旧 stale 副本 + latest 查询 `stale DESC` tie-breaker + 账号行相对时间改取 per-账号 observedAt（placeholder 回退 updatedAt）。3 个 UNVERIFIED-SPIKE 已改写为结论，preflight --require-verified PASS。
- worktree 首次 `pnpm install --frozen-lockfile` 补依赖（start 只软链 .env，node_modules 需自装）。
- 环境：worktree better-sqlite3 初始编译为 Electron ABI（NODE_MODULE_VERSION 146，node 需 127），tsx/vitest 加载原生模块失败；`pnpm rebuild better-sqlite3` 切回 node ABI 后正常，vitest 主 config 与黑盒均绿，无副作用。
- 旧语义测试处置（TDD）：unit `refresh-service.test.ts:296` 用例「marks prior observations stale when refresh fails」整体删除（其唯一时间断言锁递增语义），改写为「marks prior observations stale preserving the original data time」+ 新增「per-account failures stale preserving data time on mixed results」；集成 `tests/integration/scheduler/refresh-service.test.ts:1118/:1298` 两处 `toBeGreaterThan(prior)` 断言是 stale 复制机制用例的附属时间断言（非专门锁递增语义），改写为 `toBe(prior)` 对齐新 AC1——核心覆盖（行数/字段/last_error）保留，时间断言不丢失。
- 黑盒（`.scratch/t174/blackbox.spec.ts`，真实 better-sqlite3）：连续 3 轮失败复制 stale 副本——副本保留原时间（AC1）、get_latest/list_by_instance 唯一且 stale 优先（AC3）、list_latest_by_provider 每键一条、趋势无重复点、行数不累积。全部 PASS。

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

### Round 1 (2026-08-01 08:30 UTC+8)

| finding_id     | severity | status | rationale                                                               | fix_ref |
| -------------- | -------- | ------ | ----------------------------------------------------------------------- | ------- |
| t174_code_f001 | minor    | 遗留   | prune 同 ts 保护过宽；数据不丢，latest 仍唯一，超出本 task 时间语义范围 | p016    |
| t174_test_f001 | minor    | 遗留   | AccountUsageRow observedAt 路径缺对称测试；非 AC 要求路径，本 task 不补 | p016    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：stale 副本保留原 observed_at——unit refresh-service 2 用例 + integration 2 处断言 `toBe(prior)` + renderer ProviderAccountRow 取 observedAt 测试；黑盒 3 轮连续失败副本时间不变。
    - AC2：徽标渲染分支未动（既有测试保留）；恢复后 dedupe 清同 ts 副本，get_latest 取新观测。
    - AC3：observation-store 2 新集成用例覆盖 dedupe + `stale DESC` tie-breaker；趋势 per-day 去重无重复点；黑盒 list_latest_by_provider 每键一条、行数不累积。
    - 测试：`pnpm test` 185 files / 1960 passed / 1 skipped。
    - 黑盒（`.scratch/t174/blackbox.spec.ts` 真实 better-sqlite3）：全部 PASS。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `tasks-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

stale 副本保留原数据时间，卡片/账号行相对时间反映数据真实年龄；latest 查询加 stale DESC tie-breaker + insert 前清同键旧副本保证唯一。
