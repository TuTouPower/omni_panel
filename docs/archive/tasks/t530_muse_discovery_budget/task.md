---
tid: "t530"
slug: "muse_discovery_budget"
title: "Muse 连接器预算内动态发现重写与采集"
status: "done"
branch: "t530_muse_discovery_budget"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "25aafb30f18f9cd3997ed3b31a26599827dcb76c"
depends_on: "t529"
conflicts_with: ""
note: ""
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 重写 `connectors/muse/connector.ts`：彻底移除 `BASELINE_ACTION_ID` 与 `BASELINE_DEPLOYMENT_ID` 历史回退常量，消除版本漂移掩盖。
2. 基于 `ctx.pool.map`（并发上限 4）重构分包下载与扫描：靠前分包命中即停，立即停止拉取后续无关分包，为用量请求留足预算。
3. 接入 `ctx.discovery` 发现缓存：以 `deployment_id` 与分包列表复合签名实现跨轮复用，同签名刷新分包 GET 请求降为 0。
4. 结构化错误分类：404/失效主动清理缓存并产生 `ACTION_STALE`；发现失败显式以 `DISCOVERY_EMPTY` 失败；会话过期保持 `SESSION_EXPIRED`。
5. 整体重构并扩展 `muse_connector.test.ts`：删除旧 baseline 预期测试，新增 AC-001/003/004/005/006/008 行为验证，全量 18 个用例全部通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-27 17:05 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check`（typecheck + lint + format:check + deadcode + arch + schema:check + test）全段通过
- 黑盒：`pnpm test`（含 `tests/integration/connector/muse_connector.test.ts` 18 个测试用例）全部 PASS
- review：code review PASS (Round 1), test review PASS (Round 1)
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功重写 Muse 动态 Action 发现算法，消除 baseline 回退，实现命中即停、有界并发与发现缓存复用，彻底解决百级分包串行下载导致的 15s 超时问题。
