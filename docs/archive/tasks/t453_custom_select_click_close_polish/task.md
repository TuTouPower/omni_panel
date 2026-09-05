---
tid: "t453"
slug: "custom_select_click_close_polish"
title: "自定义下拉click重开面板的无change收场自动关闭"
status: "done"
branch: "t453_custom_select_click_close_polish"
worktree: ""
review_level: "single"
diff_anchor: "9d3e56f53e17264c04c684135b5a297c91b018e1"
depends_on: ""
conflicts_with: ""
note: "来源 p219；t451_gen_f003 跟进"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 红：AC-001 blur 关闭失败（面板滞留），AC-002 首轮即绿（既有逻辑，作回归锁）。
- 绿：`click_opened_ref` 标记 click 重开；change/apply/preset/面板关闭清标记；blur 仅当标记有效且焦点落同区外才关（relatedTarget 在区内如面板输入框则保留，防误关主流程）。
- R1 零 finding PASS；未进表建议（blur 走 handler）顺手落实→R2 0 新 finding PASS。
- 顺手发现：无新增。specs 累积 ai-cli-token-stats-ui 自定义行 + index；p219 已闭环。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `.repo_template/scripts/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

Round 1 零 finding，未进处置表。Round 2 同样零 finding（仅落实 R1 未进表建议，无新 finding）。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-003 为 `[deploy]`，真机点外部/Esc 待用户签收）
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS
- Round 2 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- click 重开无 change 失焦自动关闭：单测 21/21、全量 3510 通过、e2e 8 通过、typecheck/lint 过、两轮审阅 PASS 零遗留；p219 已闭环。见上
