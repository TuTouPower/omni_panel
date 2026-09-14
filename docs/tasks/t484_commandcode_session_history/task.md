---
tid: "t484"
slug: "commandcode_session_history"
title: "Command Code 会话历史提取器与两面板接线"
status: "backlog"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: ""
depends_on: ""
conflicts_with: "t483"
note: "来源 s037/d059；commandcode-extractor.ts + locator + HistorySource + 两面板接线（AgentFilter/resume/logo/色）；拆分见 t483"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

### 2026-09-14 文档修订（review 意见落地，未实施）

本轮按已批准审阅意见修订 `spec.md`，未开始实现：

- 登记关系：`task.py edit --conflicts-with t483`（同触碰 `paths.ts` 与 source/agent 注册点，不可并行）；未登记硬 `depends_on`，因 extractor/locator 可独立于 reader 实现与测试——理由已写入「依赖与约束」。
- 补生产 subscription 路径（AC-007：真实 watcher → `on_update`）、边界行为契约（半行/多字节/非法 JSON/未知块/截断替换恢复/畸形 timestamp）与测试（AC-008）。
- 两端均可打开订阅查询（AC-010）；resume 在宿主执行、不因 Web 禁用、不扩大为任意命令执行（AC-009）。依据现状 `SessionPane.tsx:119-130` 仅 renderer `navigator.clipboard`、web 非安全上下文直接 return。
- 明确公共接线归属：HistorySource/ExtractorKind、locator、subscription 四处 switch、extractor、两面板映射与 resume 归本 task；reader/collector/store 归 t483。原 AC-001..006 编号保持不动，新增 AC-007..010。
- 来源注记：外部迁移仓内容为历史采样引用，本 task 未访问。

调查路径：读 `src/main/core/session-history/session-locator.ts`、`subscription-service.ts`、`codex-extractor.ts`、`src/renderer/lib/session-resume.ts`、`src/renderer/components/workspace/SessionPane.tsx`、`docs/findings/d059_commandcode_session_jsonl_format.md`。

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
