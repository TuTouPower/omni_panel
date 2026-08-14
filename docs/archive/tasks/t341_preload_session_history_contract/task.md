---
tid: "t341"
slug: "preload_session_history_contract"
title: "preload sessionHistory 通道契约修复"
status: "done"
branch: "t341_preload_session_history_contract"
worktree: ""
review_level: "full"
diff_anchor: "5a99de88d354110c7e6a17a986d75c0b80ecc169"
depends_on: ""
conflicts_with: ""
note: "review_intensive: summaries 解包 + open 信封"
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

### Round 1 (2026-08-13 16:06 UTC+8)

| finding_id     | severity  | status | rationale                                                                 | fix_ref                                |
| -------------- | --------- | ------ | ------------------------------------------------------------------------- | -------------------------------------- |
| t341_code_f001 | important | 已修   | open_only 档 open 同样改裸 invoke（漏修点，usage/tray 路由）              | preload/index.ts:305-310               |
| t341_code_f002 | minor     | 已修   | as_ipc_result 死导出删除                                                  | ipc-envelope.ts                        |
| t341_code_f003 | minor     | 已修   | summaries 解包后形状防御（TS 窄化已足够，回退空 map 与 lint 冲突，撤销）  | preload/index.ts:273                   |
| t341_test_f001 | critical  | 已修   | AC-002 全路由测试改触达真实 preload 实现（hash=usage 暴露 open_only 档）  | session_history_contract.test.ts:63-78 |
| t341_test_f002 | minor     | 已修   | 补 IPC channel + payload 断言（toHaveBeenCalledWith sessionHistory:open） | session_history_contract.test.ts:77    |

### Round 2 (2026-08-13 16:10 UTC+8)

| finding_id     | severity | status | rationale                                                       | fix_ref |
| -------------- | -------- | ------ | --------------------------------------------------------------- | ------- |
| t341_code_f004 | minor    | 遗留   | preload 本地 is_ipc_result 薄转发可去壳；非阻断，登记 follow-up | p156    |
| t341_test_f003 | minor    | 遗留   | summaries 通道断言缺；非阻断，登记 follow-up                    | p156    |

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
- 结果：全部满足 / 未满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL（f001 important 已修、f002/f003 minor 已修）
- Round 1 test：FAIL（f001 critical 已修、f002 minor 已修）
- Round 2 code：PASS（f004 minor 遗留）
- Round 2 test：PASS（f003 minor 遗留）

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- preload sessionHistory 契约修复：summaries 解包 `{summaries}`、open 两档（full/open_only）改裸 invoke 不再抛 Invalid IPC response、is_ipc_result 移共享层 + 形状测试。Round 2 双路 PASS。顺手发现 p156（薄转发去壳 + summaries 通道断言）登记 pending。
