---
tid: "t444"
slug: "dashboard_null_session_time_fallback"
title: "dashboard 会话列表 records 缺失 session 时间兜底修复 + 清脏数据"
status: "done"
branch: "t444_dashboard_null_session_time_fallback"
worktree: ""
review_level: "full"
diff_anchor: "6156cb0b88e811a3eb2164777a2a2e84a25d4981"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- Step 1：preflight PASS（worktree 内 active 预期）；doctor_cmd 无。无 UNVERIFIED-SPIKE（sessions 表有有效 started_at 已实证）。
- Step 2 红：新增 t444 AC-001/AC-002 失败测试——构造 rollup 就绪 + 脏 session（rollup/sessions 有、records 删），断言兜底时间；红轮 `typeof started_at` 为 object（null）失败确认。
- Step 3 绿：materialize_session_meta records 补查失败时三层兜底：(1) token_stats_sessions 表（主键 id=session_id）；(2) window_rows hour_start MIN/MAX。实现中发现 sessions 表主键为 (id,source,env) 无 session_id 列，修正查询键。绿轮 t444 测试通过；dashboard+store 全量 135 passed。
- Step 4 黑盒：真实脏库 dash_probe 等价逻辑（只读）→ DTO VALID（此前 INVALID）；单元 AC-001/002/003 全过。
- AC-004 [deploy] 清脏数据已执行：备份 /tmp/observations-backup-t444.sqlite（624MB）后删 7 条 8-28 grok 脏 session（rollup 各 1 行 + sessions 各 1 行；records 本无）；常驻实例 /v1/dashboard 与 /v1/dashboard/sessions 同时间窗均回 200（此前 500），sessions total 58。
- 遗留观察（未修，非本 task 范围）：另有 1 条 kimi_code 脏 session（session_7d3676a2，8-06，rollup 有/records 无）+ 3 条 8-28 grok 会话仅 sessions 表有（rollup/records 均无，不触发本 bug）；前者已被新兜底覆盖（DTO VALID），后两者随采集自然覆盖。未登记 pending（属已知一次性异常模式，无需跟进）。

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

### Round 1 (2026-09-04)

Round 1 零 finding（code/test 双路），未进处置表。

### 结果摘要

- 脏 session 时间兜底 + 7 条清数 + deploy 双端点 200；见上。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（含 AC-004 [deploy] 真实库验证）
- 证据：AC-001/002/003 见 handoff.json ac_evidence（t444 单测红绿 + 135 passed）；AC-004 见实施笔记（备份 + 删除计数 + 常驻实例双端点 200）。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- 见上
