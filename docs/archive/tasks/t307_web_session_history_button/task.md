---
tid: "t307"
slug: "web_session_history_button"
title: "web 面板右上角显示会话历史按钮"
status: "done"
branch: "t307_web_session_history_button"
worktree: ""
review_level: "single"
diff_anchor: "862f2a48503c8d4705aefd5706525bf9a1c82e10"
depends_on: "t313"
conflicts_with: ""
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- TDD 先红后绿。红：单测 `popup_view.test.tsx` 删旧「web 隐藏会话历史按钮」用例（断言语义被 AC-001 推翻，整体删除不改写预期），新增 web 渲染（AC-001）+ web 点击调 `sessionHistory.open("", "", "")`（AC-002 单测级）两用例；e2e `popup_view.spec.ts` 新增按钮可见（AC-001）+ 点击后 onFocus 订阅者收到 `{source:"",env:"",session_id:""}` 且 hash 变 `#session`（AC-002）两用例。红确认：单测 2 新用例失败、其余 23 通过。
- 绿：`TitleBar.tsx` 仅移除会话历史按钮那处 `!is_web() && (...)` 守卫（124 行窗口控制 `!is_web() && !is_floating` 守卫不动），`onOpenHistory` 注释更新为 web 同样显示。`is_web` import 仍被窗口控制处使用，保留。
- 验证：单测 25/25 绿；web e2e 7/7 绿（2 新用例验证 AC-001/AC-002 真实 web bridge onFocus 分发与 `#session` 路由挂载）；typecheck、lint（--max-warnings=0）通过。桌面行为由既有用例回归（按钮序 + 点击调 open），AC-003 覆盖。

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
- 证据：AC-001/002 由 popup_view.test.tsx 新 2 用例 + web e2e popup_view.spec.ts 新 2 用例覆盖；AC-003 由既有桌面按钮用例回归；AC-004 全量测试绿。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS（0 finding）

`full`：

- N/A（single 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- web 面板右上角会话历史按钮完成：TitleBar 移除该按钮 !is_web() 守卫（窗口控制保持隐藏），web 点击走既有 bridge 进入 #session 路由；AC 四条全绿，review 1 轮 PASS 零 finding。存量 designmd 失败见 p142。
