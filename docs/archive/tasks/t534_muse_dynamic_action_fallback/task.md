---
tid: "t534"
slug: "muse_dynamic_action_fallback"
title: "Muse 动态 Action 多候选回退与发现稳定性修复"
status: "done"
branch: "t534_muse_dynamic_action_fallback"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "f9bb0951b9c50fbeb2a37e02a4bb340adfd03a76"
depends_on: ""
conflicts_with: ""
note: "修复 Muse 动态 Action 发现锁定单一 settings 候选导致 DISCOVERY_EMPTY 的缺陷，支持多候选遍历回退与真实回归测试 (p266)"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. **TDD 测试先行**：在 `tests/integration/connector/muse_connector.test.ts` 编写首个候选无目标而次候选含目标的复现用例，运行确认抛出 `DISCOVERY_EMPTY`（红灯）。
2. **多候选收集与回退机制重构**：修改 `connectors/muse/connector.ts`，废除单候选 `if (!settings_module_id)` 锁定；按 `all_scripts` 确定性顺序遍历已下载分包收集 `candidate_module_ids`，并在外层循环中逐一排查关联分包，候选无目标时自动回退下一候选（AC-001、AC-002）。
3. **结构化诊断日志**：在全部候选排查完毕仍未命中目标时，记录包含候选数、分包数与耗时的结构化错误日志（AC-003）。
4. **门禁与测试复验**：测试用例转绿；全量 338 个套件 4177 项测试 100% 通过；`pnpm check` 全绿（AC-004）。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-28T02:05:00+08:00)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（typecheck + lint + format:check + schema:check + deadcode + arch）全绿；全量 338 个测试套件 4177 项测试 100% 通过。
- 黑盒：多候选置换顺序时序与结构化诊断集成用例全部通过。
- review：code review PASS（Round 1），test review PASS（Round 1），reviewed_scope d162cb237bc2ba8d。
- AC 证据：见 `handoff.json`

### 结果摘要

- 修复 Muse 连接器锁定单一 settings 候选导致的 DISCOVERY_EMPTY 缺陷，支持多候选遍历回退与时序确定性发现。
