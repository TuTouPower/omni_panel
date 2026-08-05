---
tid: "t207"
slug: "fix_trend_metric_id_mismatch"
title: "修复 trend 查询键与 observation metric_id 不一致致 sparkline 恒空"
status: "done"
branch: "t207_fix_trend_metric_id_mismatch"
worktree: ""
review_level: "full"
diff_anchor: "c31389e9a1ff25e5280ebdf90d49ccc341196352"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 设计决策：`usageItemSchema.metric_id` 设为可选（plugin 脚本直接输出不产此字段，schema 兼容该路径）；`ProviderUsagePeriod.metric_id` 必填（runtime ready-state 经 observation_to_metric_record 总是填充）；`to_period` 用 `item.metric_id ?? item.id` 兜底，注释说明 runtime 必填、兜底仅为类型安全。
- 误写主仓：创建红测试时误写到主仓 `D:\Dev\Code\omni_usage\tests\`（应写 worktree），mv 到 worktree 并确认主仓干净。
- worktree 缺 generated 产物 `src/generated/build-info.ts`（gitignore，基线预存），手生成后 typecheck 绿。
- 派 subagent 批量补 fixture metric_id（schema 加字段连锁 ~20 文件）；自检发现 `provider_card_fixture.ts` 第 58 行字面量（accounts 数组内，缩进 20 空格）漏改，手补。

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

### Round 1 (2026-08-05 10:00 UTC+8)

Round 1 零 finding（code PASS / test PASS），未进处置表。

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
- 证据：`tests/integration/observation/trend-query-key.test.ts` 跨层验证 CPA Claude / opencode_go 两种 metric_id 形态查回非空（AC1/AC2/AC4）；前端 `provider_account_row.test.tsx` 断言 bulk payload 用 `period.metric_id`、响应非空时渲染 `.trend-svg`（AC1）；查询键由前端单点决定、后端 trend-ipc / server / web 透传一致（AC3）。`pnpm test` 208 文件 2184 passed，`pnpm typecheck` / `pnpm lint` 绿。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 见上
