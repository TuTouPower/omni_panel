---
tid: "t483"
slug: "commandcode_tokenstats_reader"
title: "Command Code 代理面板用量采集（token-stats reader）"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: ""
note: "来源 s037/d059；新增 commandcode-reader.ts + collector kind + AgentFilter 接线；累计差分须处理回落"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 采纳证据边界：s037 探针只统计 `inputTokens` 首末/递增，**不能证明** output/cache/cost 是累计，也不能排除 context 增长解释。原 spec 直接断言「usage 是累计值」「`fresh = inputTokens - cacheReadTokens`」已降级为待验证项，不当作已核实事实。
- 未知契约清单新增 `UNVERIFIED-SPIKE`：各字段数值语义、包含关系、context 增长替代解释，由受控只读探针在用户放行轮次复核后再固定口径；无法安全取得明确期望则保持 `UNVERIFIED-BLOCKING`，不杜撰。
- AC-005 加前置条件「仅当 AC-007 实验确认子集/同口径时成立」；新增 AC-007（先实验后固定口径）、AC-008（幂等/增量/重启）、AC-009（回落数值可复算）。原 AC-001..006 编号保持不动。
- 明确公共类型/筛选接线归 t484，本 task 只负责 reader/collector/口径与采集侧，避免重复。
- 本轮不读真实用户会话、不做上游实验。

调查路径：读 `docs/spikes/s037_commandcode_token_session_source/report.md`、`docs/findings/d059_commandcode_session_jsonl_format.md`、`src/main/core/token-stats/codex-reader.ts`（累计差分/回落/幂等对齐基准）。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round N (YYYY-MM-DD HH:MM UTC+8)

|finding_id|severity|status|rationale|fix_ref|
|---|---|---|---|---|
|t000_code_f001|critical/important/minor|已修/遗留/撤回|一句话|文件:行 / pNNN / tid|

无 finding 时写“Round N 零 finding”。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足 / 未满足
- 测试：待执行时填写
- 黑盒：待执行时填写
- review：待执行时填写
- AC 证据：见 `handoff.json`

### 结果摘要

- 待执行时填写；遗留只写引用，不复制正文
