---
tid: "t425"
slug: "fix_kimi_session_history_assistant"
title: "修复 kimi_code 会话历史缺失 assistant 正文"
status: "done"
branch: "t425_fix_kimi_session_history_assistant"
worktree: ""
review_level: "full"
diff_anchor: "3c57b9a1646fab30587e2e0fd4f62c75c2ad5cde"
depends_on: ""
conflicts_with: ""
note: "p193: wire 格式漂移，assistant 在 content.part"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 2026-08-16：读 p193 + `.scratch/task_bug_kimi_agent_msgs/repro_notes.md`，并用真实 wire 抽样确认 `append_loop_event` 事件结构：`event.type` 取值 step.begin/content.part/tool.call/tool.result/step.end；`content.part` 的 `part.type` 取值 text/think；顶层 `time` 均为数字 ms。fixture 按此形态固化（`wire-loop.jsonl`）。
- 实施：`process_line` 增加 `context.append_loop_event` 分支 → `loop_event_to_message`（`event.type=content.part` 且 `part.type=text` 且非空 → assistant）；旧 `append_message` 路径原样保留。id 沿用行字节 offset，timestamp 取顶层 `time`。`first_user` 不动（仍只认 append_message user，AC-005 语义保持）。
- 测试：新增 6 用例（AC-001×2 / AC-003 / AC-004×2 / AC-005），红→绿。旧 t209 用例原样保留（覆盖 AC-002 兼容）。
- 审阅 3 轮：R1 双路 PASS（4 minor：DRY 重复、注释计数）；处置已修后 R2 双路 PASS（注释求和残留 8 vs 9 → 已修）；R3 双路 PASS 零 finding。
- 环境：worktree 软链主仓 node_modules（t392 惯例）；`src/generated/build-info.ts` 缺失导致 build-info-ipc 测试失败，`gen-build-info.ts` 生成后恢复。
- 顺手发现：存量 lint 4 错误（`session-resume.ts` / `general_section.tsx` / `settings_view_general.test.tsx`）属 t432 队列内（t402/t418 引入），不重复登记。
- finalization：`docs/blueprint/domain.md` + `docs/findings/d017_transcript.md` kimi 正文路径补 content.part；新建 `docs/specs/kimi-session-history-extractor.md` 并登记 index；p193 归档。

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

### Round 1 (2026-08-16 15:35 UTC+8)

双路审阅各 2 minor，无 blocking。全部处置为「已修」。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t425_code_f001|minor|已修|抽公共 `message_id` / `timestamp_from`，消除两路径 verbatim 重复|src/main/core/session-history/kimi-extractor.ts:21-32|
|t425_code_f002|minor|已修|AC-003 测试注释干扰行计数修正为实际 9 行|tests/unit/main/core/session-history/kimi-extractor.test.ts:294-296|
|t425_test_f001|minor|已修|同 code_f002，注释计数已修正|tests/unit/main/core/session-history/kimi-extractor.test.ts:294-296|
|t425_test_f002|minor|已修|fixture 补空 text content.part 样例，触达 `text === ""` 过滤分支|tests/fixtures/session-history/kimi/wire-loop.jsonl:6|
|t425_test_f003|minor|已修|Round 2 新发现：AC-003 注释求和残留 8 vs 实际 9，已改 9|tests/unit/main/core/session-history/kimi-extractor.test.ts:294-296|

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：每条 AC 在 `handoff.json` 的 `ac_evidence` 有对应引用（覆盖闭合门禁强制）；此处写一句话摘要，不复制 AC 正文
- 摘要：双路径提取（append_message + content.part text）单测全绿，增量 id 稳定，旧路径兼容回归用例原样通过。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
- 修复 kimi_code 会话历史缺失 assistant 正文：提取器双路径 + fixture/单测补齐，3 轮审阅全 PASS。
