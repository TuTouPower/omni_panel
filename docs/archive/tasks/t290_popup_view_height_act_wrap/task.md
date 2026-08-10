---
tid: "t290"
slug: "popup_view_height_act_wrap"
title: "popup_view_height act 警告消除与假绿分析"
status: "done"
branch: "t290_popup_view_height_act_wrap"
worktree: ""
review_level: "single"
diff_anchor: "51c3801aac14e4dc5bd53874507948d14ea3dd37"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: "p089：popup_view_height act 警告（单文件复现）"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE：警告源定位——PopupView spinner 自排程 `setTimeout(check, 500ms)` 周期求值 + `refreshAll()` 异步完成后的 plugins 快照更新，落在 t196 f003 用例裸 `setTimeout(700ms)` 等待期（act 外）。非组件缺陷（生产代码零改动），属测试等待方式问题。
- 修复：700ms 等待改 `await act(async () => { await new Promise(r => setTimeout(r, 700)); })`——真实等待保持（非 fake timers），断言语义不变；单文件 0 警告 9 passed。
- 顺手发现：全量跑有约 80 条存量 act 警告（settings_form/cpa_connector_settings 等文件，单文件不现、全量并行出现），非本 task 引入，登记 p119。

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

### Round 1 (2026-08-11 00:15 UTC+8)

Round 1 零 finding（clean review），未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 单文件 0 act 警告 + 9 passed；AC-002 700ms 真实等待保持、spinner 由真实 pending 驱动（生产组件零改动）；AC-003 全量 2834 passed。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：PASS（clean review，0 finding）

### 结果摘要

- t196 f003 裸等待改 act 包裹，消除 2 条 act 警告且断言语义不变（非组件缺陷，SPIKE 结论入 spec）；全量 2834 passed；存量 act 警告登记 p119。
