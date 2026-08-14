---
tid: "t378"
slug: "docs_sync"
title: "docs/spec 与实现错位同步"
status: "done"
branch: "t378_docs_sync"
worktree: ""
review_level: "single"
diff_anchor: "ebdedddbec234d854496df756fc375cf51d78eb5"
depends_on: ""
conflicts_with: ""
note: "review_intensive: 75%注释/smoke_check/CLI help/硬编码文案"
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

### Round 1 (2026-08-15 02:56 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t378_gen_f001  | important | 已修   | testing.md:128 残留 75% 工作区，改 100% + t081 标注 | docs/guides/testing.md:128 |
| t378_gen_f002  | important | 已修   | smoke_check「点退出弹出确认」与实际不符（TRAY_QUIT 无 dialog），改「无确认直接退出」 | scripts/smoke_check.md:20 |
| t378_gen_f003  | minor    | 已修   | smoke_check 缺 web/CLI serve 检查项：补 CLI serve 步骤 + web 面板浏览器验证 | scripts/smoke_check.md:37-42 |

### Round 2 (2026-08-15 03:00 UTC+8)

- 复核：f001/f002 消除确认；f003 CLI serve 已补，web 面板检查项 Round 2 补全（build:web 浏览器打开 out/web/index.html）后全消除。verdict PASS。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001（popup 注释 + window-management/testing.md 100%）、AC-002（smoke_check + CLI help 一致）、AC-003（4.2MB/未来 7 天文案清理）均列于 `handoff.json` 的 `ac_evidence`

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：FAIL（f001-f003：testing.md 75%、smoke_check 退出确认、web/CLI 检查项）
- Round 2 general：PASS（3 finding 全消除）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 文档/文案全对齐实现（100% 高度、托盘常驻退出、CLI help、无硬编码过期数字）；2 轮 review 全消除。
