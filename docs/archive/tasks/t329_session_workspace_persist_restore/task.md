---
tid: "t329"
slug: "session_workspace_persist_restore"
title: "工作台打开会话槽位持久化,窗口重开后恢复"
status: "done"
branch: "t329_session_workspace_persist_restore"
worktree: ""
review_level: "full"
diff_anchor: "f41bc10ebb13d5461d0997abb88202df2b6dede8"
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

### Round 1 (2026-08-12 23:45 UTC+8)

| finding_id     | severity | status | rationale                                                                                      | fix_ref                                                                   |
| -------------- | -------- | ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| t329_code_f001 | minor    | 已修   | 抽取 slot_session_from_loc 共享 helper，restore_slot_meta 与 open_session 复用，消 13 字段重复 | src/renderer/components/workspace/use-workspace-columns.ts:22-47          |
| t329_code_f002 | minor    | 已修   | workspace-storage is_loc 加 KNOWN_SOURCES 校验，非法 source 不恢复                             | src/renderer/lib/workspace/workspace-storage.ts:80-93                     |
| t329_test_f001 | minor    | 已修   | 补损坏 workspace-layout 回退默认（layout 3、视图关）断言                                       | tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:1147-1159 |
| t329_test_f002 | minor    | 已修   | e2e reload 单槽位接受（多槽位由组件测试承担，分工合理）                                        | tests/e2e/web/session_panel.spec.ts                                       |

### Round 2 (2026-08-12 23:50 UTC+8)

| finding_id     | severity | status | rationale                                                                              | fix_ref                                               |
| -------------- | -------- | ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| t329_code_f003 | minor    | 已修   | KNOWN_SOURCES 改为 tokenStatsSourceSchema.options 派生，消除手写枚举与 schema 漂移风险 | src/renderer/lib/workspace/workspace-storage.ts:80-81 |

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
- 证据：AC-001/003/004/005 由 WorkspaceView.test.tsx（mock localStorage 重挂载恢复）覆盖；AC-002 恢复后 query 拉取断言；e2e session_panel reload 真实恢复；全量 2987 passed；详见 handoff.json ac_evidence

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 工作台会话槽位持久化到 localStorage（槽位 source/env/session_id + 顺序 + 布局列数 + 视图开关），重开恢复槽位并重新拉取消息；清空同步清空；换序持久化
