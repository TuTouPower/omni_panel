---
tid: "t434"
slug: "session_refresh_collect_reset"
title: "会话面板刷新触发 collector 并重置周期计时"
status: "done"
branch: "t434_session_refresh_collect_reset"
worktree: ""
review_level: "full"
diff_anchor: "0a3849a7b61c85f443ec66739ea936220e75e562"
depends_on: ""
conflicts_with: ""
note: "工作台+会话库顶栏刷新：collect 一轮后按原路径重拉 UI；手动刷新重置 poll interval"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 创建纪要

- 用户确认：刷新 = collector 选项 B；手动后重置 poll interval；UI 按原路径重拉，不单独规定「最近 10 条」。
- review_level=full：采集触发 / 定时器 / 跨页签 IPC。

### 实施纪要（2026-08-17）

- manager 加 `force_collect()`：向 collector 重发 config 消息（复用周期采集同一入口；collector configure → collect + start_interval 以 poll_interval_ms 重置计时）。不经 update_config（same_config 去抖会跳过字节相同配置）。
- IPC：新增 `TOKEN_STATS_FORCE_COLLECT` 通道 + preload `forceCollect`；web 端 no-op（无 collector）。UsageboardApi + 5 个测试 mock facade 补成员。
- 渲染：SessionShell onRefresh 调 forceCollect + 递增 refresh_token（触发槽位消息重拉，既有行为）；SessionLibrary 接 refresh_token 重拉列表；RecentSessionsModal 接 refresh_token 按 limit:100 重查。
- 审阅 4 轮：R1 test FAIL（槽位重拉/最近会话/interval 三处无测试钉住）+ code 3 minor → R2 test FAIL（弹窗重查测试缺失）→ R3 code FAIL（f004：弹窗断言被 SessionLibrary limit:50 污染）→ R4 双路 PASS。
- 顺手发现：无。

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

### Round 1 (2026-08-17 10:30 UTC+8)

code 侧 3 minor；test 侧 3 important。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t434_code_f001|minor|已修|manager 测试名 AC-001/AC-005 只断言 postMessage：补 collector start_interval 假时钟测试钉住 interval 重置|tests/unit/main/core/token-stats/collector.test.ts:1400-1425|
|t434_code_f002|minor|已修|新 IPC 通道无契约测试：token-stats-ipc 通道为薄转发，manager/collector 层已钉住行为|（薄转发无独立逻辑，行为由下层测试覆盖）|
|t434_code_f003|minor|已修|最近会话弹窗已打开态刷新不重拉：RecentSessionsModal 接 refresh_token 触发重查|src/renderer/components/workspace/RecentSessionsModal.tsx:22-38|
|t434_test_f001|important|已修|AC-002 槽位重拉无测试：SessionShell t434 用例补 refresh_token→query 再调断言|tests/unit/renderer/components/session_shell/SessionShell.test.tsx:240-292|
|t434_test_f002|important|已修|AC-003 标注错位（会话库场景标 AC-003）：用例改标 AC-001/002/003（槽位+最近会话+库），RecentSessionsModal 补 refresh_token 重查；R2 补弹窗打开态刷新重查测试|同上 + RecentSessionsModal.tsx + WorkspaceView.test.tsx:390-412|

### Round 3 (2026-08-17 10:45 UTC+8)

test 侧 PASS；code 侧新增 1 important（f004：弹窗重查断言被隐藏挂载 SessionLibrary 的 limit:50 重拉污染，未隔离）。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t434_code_f004|important|已修|弹窗重查断言改按 `limit:100` 参数过滤（RECENT_LIMIT），与 SessionLibrary 的 limit:50 区分|tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:390-412|
|t434_test_f003|important|已修|AC-005 interval 重置零断言：collector start_interval 假时钟测试（clear 旧 + 按 poll_interval_ms re-arm）|tests/unit/main/core/token-stats/collector.test.ts:1400-1425|

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

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：FAIL
- Round 3 code：FAIL
- Round 3 test：PASS
- Round 4 code：PASS
- Round 4 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
- 顶栏刷新触发一轮 token-stats 采集并重置自动计时，工作台/会话库/最近会话按原路径重拉；4 轮审阅最终双路 PASS。
