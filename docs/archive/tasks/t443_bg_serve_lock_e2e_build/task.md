---
tid: "t443"
slug: "bg_serve_lock_e2e_build"
title: "background serve 锁冲突打包形态进程级 e2e"
status: "done"
branch: "t443_bg_serve_lock_e2e_build"
worktree: ""
review_level: "full"
diff_anchor: "233cd77369a598779ce687ee7732aa0f1f9a1b83"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- Step 1：preflight 在主仓跑显示 FAIL（main 副本滞后，worktree 内 active 属预期）；doctor_cmd 无。t443 纯新增测试，无 UNVERIFIED-SPIKE。
- Step 2 红：先以 `=` 拼接形态手跑后台 serve，复现 probe 误撞本机常驻实例（诊断指向 18263 常驻实例）——确认 `=` 形态 user-data-dir 被静默丢弃；改空格分隔后红轮验证秒级 exit=1 + 「实例已在运行」指向隔离目录健康实例（18711/18714/18715）。
- Step 3 绿：新增 tests/e2e/packaged/bg_serve_lock.spec.ts（222 行）；tsc 全量通过；移除未用 `stdout` 变量消 TS6133。
- Step 4 黑盒：`E2E_NO_WEBSERVER=1 DISPLAY=:0 playwright --project=packaged bg_serve_lock.spec.ts` → 1 passed（927ms）；teardown 后端口释放无残留。
- 审阅：spawn_agent 不可用，按 code/test prompt 标准直接双路审；code Round 1 一条 minor（固定端口），test Round 1 零 finding；双 PASS。
- 收尾注意：artifacts 软链仅 worktree 本地验证用（gitignore，不入库）；src/generated/build-info.ts 系复制主仓 gitignore 产物，不入库。

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

### Round 1 (2026-09-04)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t443_code_f001|minor|已修|固定端口 18711 说明已补：packaged workers=1 + teardown 回收 user-data-dir 进程树 + 隔离目录防误撞常驻实例；动态端口待 workers>1 再议|tests/e2e/packaged/bg_serve_lock.spec.ts:166-170|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL

`single`：

- Round 1 general：PASS / FAIL

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 打包形态后台 serve 锁冲突 e2e 已落地并实跑通过；见上。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/AC-002/AC-003 见 handoff.json ac_evidence；packaged e2e 1 passed（927ms）；code/test 双路 review PASS。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- 见上
