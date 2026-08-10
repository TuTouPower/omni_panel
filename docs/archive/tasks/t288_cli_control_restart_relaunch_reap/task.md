---
tid: "t288"
slug: "cli_control_restart_relaunch_reap"
title: "CLI 控制 restart e2e 回收 relaunch 进程"
status: "done"
branch: "t288_cli_control_restart_relaunch_reap"
worktree: ""
review_level: "single"
diff_anchor: "d7cdbb7b87fc4aff81e7698e1bd6f19454298499"
depends_on: ""
conflicts_with: "t281,t283,t292"
schedule_status: "scheduled"
note: "p095：CLI restart e2e relaunch 进程泄漏"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 环境坑（worktree 复用）：`path.txt` 若以 `printf` 写入会带换行，electron `index.js` 不 trim，`dist/electron\n` 存在性检查失败触发重复下载导致 `ensure_sqlite_abi` verify FAILED；须无换行写入。
- 泄漏复现：AC3 restart 用例跑后 18811 被 relaunch 新进程（pid 变化）持续监听，`closeServe` 只关原句柄——复现 p095。
- 修复：`reap_user_data_dir_processes` 按 `--user-data-dir`（mkdtemp 唯一串）pgrep 定位 → SIGTERM → 3s 轮询 → 超时 SIGKILL 兜底；win32 显式守卫。
- 验证：AC3 单跑后 18811 无监听、无 electron 残留；`cli_control.spec.ts` 三轮串行 8 passed ×3 无 EADDRINUSE；全量单测 2841 passed。

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

### Round 1 (2026-08-10 23:55 UTC+8)

| finding_id    | severity | status | rationale                                                            | fix_ref                                   |
| ------------- | -------- | ------ | -------------------------------------------------------------------- | ----------------------------------------- |
| t288_gen_f001 | minor    | 已修   | reap 超时残留 SIGKILL 兜底 + 循环轮询剩余 pid                        | tests/e2e/electron/cli_control.spec.ts:84 |
| t288_gen_f002 | minor    | 已修   | win32 平台守卫显式 no-op（cli e2e 本就 Linux-only，防 Windows 假绿） | tests/e2e/electron/cli_control.spec.ts:72 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 teardown 后端口无监听 + 进程无残留（实测复现→修复闭环）；AC-003 三轮串行 8 passed ×3 无 EADDRINUSE。详见 handoff ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：PASS（2 minor：f001 SIGKILL 兜底、f002 win32 守卫）
- Round 2 general：PASS（2/2 处置复核成立，0 新 finding）

### 结果摘要

- cli_control AC3 restart teardown 加固（user-data-dir 定位回收 relaunch 进程树），三轮串行 8 passed 无泄漏；全量单测 2841 passed；testing.md p095 引用闭环。
