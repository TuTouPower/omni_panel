---
tid: "t487"
slug: "token_stats_collector_wsl_mac_isolation"
title: "TokenStats 采集器隔离 WSL 源消除 macOS 报错"
status: "done"
branch: "t487_token_stats_collector_wsl_mac_isolation"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "ad6c4177f48fc7d1f1f98ee18ecf052bdc10d216"
depends_on: ""
conflicts_with: ""
note: "来源 p231：仅 Windows 挂载 WSL 源，macOS 不采集 WSL 避免红字报错"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 在 `src/main/core/token-stats/collector.ts` 中调整 `sources` 全局定义及 `set_collector_host(host)` 方法，将 `...WSL_SOURCES` 改为 `...(collector_host === "windows" ? WSL_SOURCES : [])`，仅在 Windows 宿主下挂载 WSL 采集源。
2. 在 `tests/unit/main/core/token-stats/collector.test.ts` 中依据项目测试规范，将废弃的 macOS/Linux 过滤 WSL 且预期 unavailable 的旧用例替换为新的 AC-001 ~ AC-003 测试，附详细废弃理由。
3. 运行单元测试（55/55 PASS）、`pnpm typecheck`（0 错误）与 `pnpm lint`（0 警告）全部通过。

## Review 处置

Round 1 零 finding

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`vitest run tests/unit/main/core/token-stats/collector.test.ts` (55/55 PASS)
- 黑盒：单元测试模拟宿主覆盖平台隔离逻辑
- review：Round 1 general PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 修复了 macOS/Linux 宿主上无条件挂载 WSL 采集源导致产生 unavailable 状态并在 Agent 面板报错的问题。
