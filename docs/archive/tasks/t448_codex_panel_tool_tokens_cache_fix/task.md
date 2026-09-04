---
tid: "t448"
slug: "codex_panel_tool_tokens_cache_fix"
title: "codex 面板误标与用量虚胖缓存恒零修复"
status: "done"
branch: "t448_codex_panel_tool_tokens_cache_fix"
worktree: ""
review_level: "full"
diff_anchor: "2eb2aabba154ae7848cd9b5744f1210db9bd38b8"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- attempt=1 execution_id=f02cc62131c8485abe7f5fdf22087dbf；diff_anchor=2eb2aabb。
- 展示层四 AC：SessionTable 抽 `agentDisplayLabel`（review 收敛前本 task 内先抽，后转单一来源），chart-data 三套 labels 补 codex，echarts token resolver agents 加 codex（DESIGN + globals.css + dark 翻转），slots AGENT_COLOR_VAR 加 codex，local-api 四处 agent 类型收窄加 codex。
- DESIGN：新增 `agent-codex`（#d6336c）/ `agent-codex-dark`（#f06595）走 designmd export + check；globals.css `.dark` 块补 codex 翻转别名（code review f001）。
- codex-reader：delta<=0 从「按全量计入」改「记 0」（p214 1.3B 虚增根因）；cache_read 独立差分透传 + input 归一（减 cache_delta）。全量 116 文件实测 0 回绕 / 75 相邻重复，零增量去重不丢数。
- 环境：worktree 首次跑测试需 `mkdir -p src/generated` + `npx tsx scripts/gen-build-info.ts`（gen 脚本不建目录，testing.md 未注明）。
- 全量 pnpm test 3488 passed；typecheck 0 err；designmd check passed；lint 剩 1 pre-existing error（token-stats-store.ts:899，base 已有）→ 登记 p215，非本 task 引入，未顺手修。
- d051 就地修订：cached 全 0 部分作废（现非零），补 codex 重复落盘/单调/归一事实。
- review Round 1：code PASS（2 minor）/ test FAIL（1 important + 1 minor），全部已修；Round 2 code+test 双 PASS。

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

### Round 1 (2026-09-04 20:25 UTC+8)

code review PASS（2 minor）；test review FAIL（1 important + 1 minor）。全部已修，重审 Round 2。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t448_code_f001|minor|已修|globals.css `.dark` 块补 `--color-agent-codex: var(--color-agent-codex-dark)` 翻转|src/renderer/styles/globals.css:249|
|t448_code_f002|minor|已修|chart-data 导出 `agentDisplayLabel` 单一来源，SessionTable Badge 与 donut 共用，移除重复三元|src/renderer/lib/token-stats/chart-data.ts:51|
|t448_test_f001|important|已修|AC-006 断言改强式：`input(归一)+output+cache_read == 2000`（double 会 3500），防双计有判别力|tests/unit/main/core/token-stats/codex-reader.test.ts:245|
|t448_test_f002|minor|已修|AC-004 用例插入 claude-code 行，断言 `agent=codex` 过滤排除他源|tests/integration/local-api/server.test.ts:1367|

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修|一句话|文件:行|
|t000_test_f002|minor|遗留|一句话|pNNN|

### Round 2 (2026-09-04 20:35 UTC+8)

前轮 4 finding 复核全已修；本轮新 finding 0。

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t448_code_f001|minor|已修|globals.css:249 dark 翻转补齐，designmd:check 过|见 Round 1|
|t448_code_f002|minor|已修|agentDisplayLabel 单一来源收敛|见 Round 1|
|t448_test_f001|important|已修|AC-006 强断言 2000 vs double 3500|见 Round 1|
|t448_test_f002|minor|已修|AC-004 排除分支真实触发|见 Round 1|

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~004 由 SessionTable/chart-data/palette/wiring/local-api 单测与集成断言覆盖（ac_evidence 逐条引用）；AC-005/006 由 codex-reader 单测 + 真实 rollout 黑盒复现（1.35B→0.196B，缓存率 98%）覆盖。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：PASS

`single`：

- N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- p214 codex 面板三异常修复：展示层 codex 误标/漏段/颜色 + reader 去重虚增 + 缓存透传归一；全量 3488 passed，review Round 2 双 PASS。
