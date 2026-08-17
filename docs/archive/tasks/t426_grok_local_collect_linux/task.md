---
tid: "t426"
slug: "grok_local_collect_linux"
title: "Linux/mac 宿主采集 local grok 会话(会话库不全)"
status: "done"
branch: "t426_grok_local_collect_linux"
worktree: ""
review_level: "full"
diff_anchor: "eb3fcfff89c67f272bb15c1008a8a6c13b954fc2"
depends_on: ""
conflicts_with: ""
note: "来源 p192；补 grok_local + path 按 env 解析"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 创建纪要

- 来源 p192（task-bug 已复现：Linux 宿主会话库 grok 不全）。
- review_level=full：采集源清单/路径解析/会话身份键，属数据与跨平台协议面。

### 实施纪要（2026-08-16）

- 实现：`sources` 增加 `grok_local`（env=local, hosts=LOCAL_HOSTS）；`grok_sessions_path` 包装按 `src.env` 解析（原固定 "wsl"）；`read_source` grok 分支透传 env。store 主键 `(source,env,id)` 天然隔离两 env（spec 风险项由既有 schema 兜住，未改 store）。
- 测试：新增 path builder local grok 用例（AC-002）+ collector linux host 采集用例（AC-001）；5 处既有测试因「grok 仅 WSL」语义变更而更新（t197 口径被 spec 取代）：path 签名、wsl_enabled=false、t197 双源 mock、warn once ×2、local 源计数 4→5、healthy sources 5。
- 审阅 3 轮：R1 双路 FAIL（AC-004 blueprint 未修订 + 测试硬编码 home）；处置后 R2 双路 PASS（新增 2 minor：collector.ts 头注释残留、生效 spec 仅 WSL）；R3 双路 PASS 零 finding。
- finalization：architecture.md（2 处）、domain.md §3.2、specs/ai-cli-token-stats-api.md（2 处）全部改双源表述；p192 归档。
- 顺手发现：collector.ts 835 行 / collector.test.ts 1381 行超文件过大阈值，未达拆分必要（reviewer 提示，非本 task 引入）。

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

### Round 1 (2026-08-16 16:20 UTC+8)

双路审阅各 2 finding（code: 1 important + 1 minor；test: 2 important）。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t426_code_f001|important|已修|AC-004 blueprint 修订：architecture.md:44/:151 改双源，domain.md §3.2 双源+主键隔离|docs/blueprint/architecture.md:44,151; domain.md:61-63|
|t426_code_f002|minor|已修|collector.ts / paths.ts 过期注释改双源语义|src/main/core/token-stats/{collector,paths}.ts|
|t426_test_f001|important|已修|同 f001（AC-004 blueprint 修订）|同上|
|t426_test_f002|important|已修|collector.test.ts t426 用例改 endsWith 相对断言，去硬编码 home|tests/unit/main/core/token-stats/collector.test.ts:656-659|

### Round 2 (2026-08-16 16:30 UTC+8)

双路 PASS；code 侧新增 2 minor。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t426_code_f003|minor|已修|collector.ts:244 源清单头注释残留「Grok CLI only ships under WSL」，改双源表述|src/main/core/token-stats/collector.ts:244-247|
|t426_code_f004|minor|已修|生效 spec ai-cli-token-stats-api.md:71/:97 仍写「仅 WSL」，改双源（收尾同步 spec）|docs/specs/ai-cli-token-stats-api.md:71,97|

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
- 摘要：grok 双源采集（local+wsl）落地，路径层/源清单/单测全绿，blueprint 与生效 spec 同步为双源表述；AC-006 为 `[deploy]` 人工项。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS
- Round 3 code：PASS
- Round 3 test：PASS

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 一句话；无额外说明可写「见上」
- 修复 Linux/mac 宿主 grok 会话库不全：新增 grok_local 源 + 路径按 env 解析，3 轮审阅最终双路 PASS。
