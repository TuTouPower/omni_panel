---
tid: "t441"
slug: "fix_index_stale_local_env_comments"
title: "index.ts 两处过期 local/env 注释修订(t437 残留)"
status: "done"
branch: "t441_fix_index_stale_local_env_comments"
worktree: ""
review_level: "single"
diff_anchor: "448619d52b648d39cbc18171bb1ee9e80ce95873"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- Step 1：preflight PASS（1 条警告：工作区 src/main/index.ts 自身改动，预期内）；doctor_cmd 无，按 testing.md 记「无」。
- 实施：两处注释修订——(1) t310 locator 路径输入注释：`local 源` 表述改为 linux/mac + win/win_home_wsl（t438）；(2) Env 对齐注释：`local|wsl` 改为 `win|wsl|linux|mac`。无逻辑变更，未触其它注释。
- 验证：typecheck 通过（worktree 需先 mkdir src/generated + gen-build-info，因 gitignore 文件 worktree 缺失，见 testing.md）；eslint 单文件 0 warning；spec 有意不测故无单测红绿轮。
- 审阅：sub-agent 派发不可用（spawn_agent unsupported），按 general_review_prompt 标准直接单路审 diff；Round 1 零 finding，verdict PASS，review_scope 指纹一致。
- 收尾：decisions.md ADR 016/017 是 t308 时期历史记录（t437 前语义），属历史取舍不改；ai-cli-token-stats-api.md 的 `local|wsl` 出现是「t437 替代 t308」的历史叙述，不改。顺手发现：无新增疑似问题。

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

Round 1 零 finding，未进处置表。

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

- 两处过期注释已修订为 t437/t438 后语义，无逻辑变更；见上。

## 收尾报告

本 task 的 commit 用 `git log --grep t441` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 注释修订经 grep 核验（`local|` 仅剩历史文档叙述，index.ts 内 env 注释已为 win|wsl|linux|mac）+ eslint 单文件通过 + 单路 review PASS；纯注释改动有意不测。

### Reviewer verdict

`single`：

- Round 1 general：PASS

### 结果摘要

- 见上
