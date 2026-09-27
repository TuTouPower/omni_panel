---
tid: "t528"
slug: "connector_execution_budget"
title: "连接器执行预算、协作取消与有界并发机制"
status: "done"
branch: "t528_connector_execution_budget"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "db7b3d76c6a546f4f6c429539003b7838a939003"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 新增 `src/main/core/connector/execution-budget.ts`，实现统一 `ExecutionBudget`、`BudgetExhaustedError`、`TerminatedError`、`HostConcurrencyLimiter` 及增量并发原语 `create_connector_pool`。
2. 彻底从执行路径移除 `DEFAULT_TIMEOUT_MS`，引入 `DEFAULT_EXECUTION_BUDGET_MS = 15_000`，`opts.timeout_ms` 仅允许缩小且被钳制至剩余预算。
3. `ConnectorContext` 契约落地：必选提供 `signal`、`deadline_ms`、`remaining_ms()`、`metrics`、`pool`，预留 `discovery` 契约字段形态。
4. `refresh-service.ts` 重写刷新与重试循环，跨 retry 共享同一预算，引入 generation / epoch 保护防止同实例并发/过期执行覆盖最新结果。
5. `isolated-process-runner.ts` 与 `connector-worker-entry.ts` 对齐执行预算协议，增加硬上限看门狗终结机制，结构化区分软截止（`BUDGET_EXHAUSTED`）与硬终结（`TERMINATED`）。
6. 审计网络循环连接器（`cpa`、`opencode_go`），在遍历处加入 `ctx.signal.aborted` 协作取消检查。
7. 新增 `tests/integration/connector/execution-budget.test.ts` 覆盖 AC-001 至 AC-009 全部可测行为，全量 336 套件 / 4127 测试全部通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-27 16:15 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（typecheck + lint + format:check + deadcode + arch + schema:check + test）全部通过，全量 4127 个测试用例全部 PASS
- 黑盒：`pnpm test`（含 `tests/integration/connector/execution-budget.test.ts` 新增 8 个 AC 验收断言）全部 PASS
- review：code review PASS (Round 1), test review PASS (Round 1)
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功实现连接器执行预算模型、协作取消信号、请求/字节计数统计、宿主强制限流、增量并发原语 `ctx.pool` 及 generation 保护，全面废除单值 `DEFAULT_TIMEOUT_MS`。
