---
tid: "t428"
slug: "model_alias_map_semantics_unify"
title: "统一 model alias 语义并补 union 路径测试"
status: "done"
branch: "t428_model_alias_map_semantics_unify"
worktree: ""
review_level: "full"
diff_anchor: "b95e7a9d5a248914a1ba6ebae22528e1a5e4e0f8"
depends_on: ""
conflicts_with: ""
schedule_status: "pending_clarification"
note: "merged from t429"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 实施纪要（2026-08-17）

- 实现：前端 `originalToAlias` 从「先写获胜」改为「后写覆盖」（去掉 `if (!map.has(m))` 守卫），与后端 `dashboard_alias_resolver`（lookup.set 覆盖）对齐（p182）。
- 测试：前端新增 multi-alias 归一用例（shared-key → 后声明 AliasB，修复前归 AliasA 必红）；后端新增 AC-004（rollup ready 后 union agent+model 组合过滤）+ AC-005（跨 model 同 session 会话去重）用例（p183 缺口）。
- 审阅 3 轮：R1 双路 PASS（各 1 minor：AC-004 数据全落整小时带，records 源未触达）；R2 双路 PASS（test 侧新 minor f002：负向行仅 2/4 切片）；R3 双路 PASS 零 finding。处置表曾误填 f002 行致脚本 abort，已修正。
- CPU 节制：黑盒与审阅复验全程定向 vitest（2 文件 / store 单文件），未跑全量。
- finalization：web-panel.md §7 补「后写覆盖」归并策略；p182/p183 已随立项归档，无需再迁。
- 顺手发现：无（既有 3 文件行数超阈值非本 task 引入）。

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

### Round 1 (2026-08-17 09:10 UTC+8)

双路审阅各 1 minor（同源：AC-004 用例数据全落整小时带，records 边缘带未触达）。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t428_code_f001|minor|已修|AC-004 用例 am3/am4 移入 [07:30,08:00) 边缘带，union records 源过滤被验证|tests/unit/main/core/token-stats/token-stats-store.test.ts:2333-2363|
|t428_test_f001|minor|已修|同 f001：匹配/非匹配记录各一条进边缘小时，双源均验证|同上|

### Round 2 (2026-08-17 09:20 UTC+8)

code 侧 PASS 零新 finding；test 侧 PASS 新增 1 minor（f002：负向行仅对角覆盖 2/4 切片）。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t428_test_f002|minor|已修|AC-004 补负向行 am5（records×agent）/am6（rollup×model），4 切片全覆盖|tests/unit/main/core/token-stats/token-stats-store.test.ts:2333-2376|

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文
- 摘要：alias 归并统一为后写覆盖（前后端同策略），union 路径补 agent+model 组合过滤与跨 model 会话去重用例；6 条 AC 测试覆盖。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
- alias 归并前后端统一后写覆盖，union 双源过滤与跨 model 会话去重用例补齐；3 轮审阅全 PASS。
