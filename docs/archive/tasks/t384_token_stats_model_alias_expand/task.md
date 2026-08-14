---
tid: "t384"
slug: "token_stats_model_alias_expand"
title: "模型筛选 alias 归并展开（碰撞修复 + IN 展开）"
status: "done"
branch: "t384_token_stats_model_alias_expand"
worktree: ""
review_level: "full"
diff_anchor: "7db9320dfabc1edd7e93c167daa60728989d2518"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-15 06:10 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t384_code_f001 | minor    | 已修   | 大组绑定参数保护未实现：补注释说明（SQLite 变量上限 32766 实际不可达） | src/main/core/token-stats/token-stats-store.ts:379 |
| t384_code_f002 | minor    | 遗留   | originalToAlias 先写获胜与后端 resolver 后写覆盖在重复 key 配置下分叉 | p182 |
| t384_test_f001 | minor    | 遗留   | union 路径缺 agent+model 组合用例 | p183 |
| t384_test_f002 | minor    | 遗留   | union 用例未断言 is_hour_rollup_ready() | p183 |
| t384_test_f003 | minor    | 已修   | 多 key 展开 + resolver 后写覆盖测试已补（2 用例） | tests/unit/main/core/token-stats/token-stats-store.test.ts:2601-2666 |
| t384_test_f004 | minor    | 遗留   | AC-002 会话去重未断言（COUNT DISTINCT session） | p183 |

### Round 2 (2026-08-15 06:15 UTC+8)

- 复核：code PASS（f001 注释消除、f002 维持 minor）；test PASS（f003 消除、f001/f002/f004 维持 minor）。无新 finding。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~006 均列于 `handoff.json` 的 `ac_evidence`（后端归并展开 + 前端 value=label + prefs 归一），mutation 验证

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（f001 注释 + f002 维持 minor）
- Round 1 test：PASS（f003 补测试 + f001/f002/f004 维持 minor）
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 模型筛选 alias 归并展开（后端 IN + 前端停反查）；renderer 全量 1204 passed，code/test 双轴 2 轮 PASS。
