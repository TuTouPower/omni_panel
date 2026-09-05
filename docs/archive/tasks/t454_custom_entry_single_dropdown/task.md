---
tid: "t454"
slug: "custom_entry_single_dropdown"
title: "自定义入口收敛：删📅按钮+选中动作才开面板"
status: "done"
branch: "t454_custom_entry_single_dropdown"
worktree: ""
review_level: "single"
diff_anchor: "eab2856a6c33e2eadae24f963a6e4365607aa588"
depends_on: ""
conflicts_with: ""
note: "来源 p219 跟进+用户需求；双弹修复"
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 红：AC-001/002 双红（按钮存在、开下拉即弹）。
- 关键转向：初拟 mousedown 标记时发现真机选项拾取 click 之前必有下拉打开时的 select-mousedown，朴素标记会杀死重选路径；Chromium 真机 probe（临时 e2e，已删）确认键盘改值无 click、Esc 无信号、外部点击必 blur，遂定稿“开下拉（带 mousedown）跳过、选中（无 down）才开”+ blur 收场。
- 绿：RangePicker 删按钮转纯受控（`open`/`onOpenChange` 必填，`active` prop 同删）；Select 加 onMouseDown 标记；旧按钮入口单测整体删除（入口不存在），行为用例改受控 open。
- 插曲：联跑时 t312 AC-004 失败一次，单跑+重跑全绿，改动面无关（刷新/缓存），记 p222 观察。
- R1 零 finding PASS。顺手：p222（抖动观察）、d053（手势事件形态）；specs 累积 ai-cli-token-stats-ui + index。

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

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-005 为 `[deploy]`，真机双弹消除待用户签收；同值鼠标拾取路径 e2e 程序化 change 已过，真鼠标靠人工）
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 单入口收敛：📅 按钮删除、开/选中 click 区分、blur 收场保留：单测 3511 通过、e2e 9 通过（含同值重选）、typecheck/lint 过、R1 零 finding PASS；p222/d053 已记。见上
