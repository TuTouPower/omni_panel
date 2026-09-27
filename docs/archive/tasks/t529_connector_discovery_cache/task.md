---
tid: "t529"
slug: "connector_discovery_cache"
title: "连接器发现结果持久化缓存能力"
status: "done"
branch: "t529_connector_discovery_cache"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "87c871397d09d5a1e6c9ae6d8f067e7a2e4d35ed"
depends_on: "t528"
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 新增 `src/main/core/connector/discovery-cache.ts`，实现类型化发现缓存 `ConnectorDiscoveryStore`、`compute_discovery_namespace`、`is_secret_refused` 及 LRU 三重容量治理。
2. `host-io.ts` 与 `net-client.ts` 落地 `ctx.discovery` 接口（`get/set/delete`），支持快照下发与 delta 写回。
3. `isolated-process-runner.ts` 与 `connector-worker-entry.ts` 协议扩展，支持下发 `initial_discovery` 与执行回传 `discovery_delta`。
4. `refresh-service.ts` 接入 `discovery_store` 并透传至连接器执行链路。
5. 新增 `tests/integration/connector/discovery-cache.test.ts` 覆盖 AC-001 至 AC-011 全部验收行为，全量回归测试通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-27 16:35 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（typecheck + lint + format:check + deadcode + arch + schema:check + test）全段通过
- 黑盒：`pnpm test`（含 `tests/integration/connector/discovery-cache.test.ts` 10 个测试用例）全部 PASS
- review：code review PASS (Round 1), test review PASS (Round 1)
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功实现连接器类型化发现结果持久化缓存能力，建立基于 code hash 的命名空间隔离、快照下发与写回 delta 机制、LRU 容量治理与密钥安全防线。
