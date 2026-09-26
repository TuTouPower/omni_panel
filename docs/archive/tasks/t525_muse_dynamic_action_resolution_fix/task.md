---
tid: "t525"
slug: "muse_dynamic_action_resolution_fix"
title: "Muse 连接器运行时自动动态嗅探与会话健壮性修复"
status: "done"
branch: ""
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "7b243c6ff11b76d7bac9885453e67f2fad60f91f"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `.repo_template/scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

1. 修复会话假失效：从 `connectors/muse/connector.ts` 中移除针对 HTML 正文的 `/Forbidden/i` 正则校验，避免 Next.js 页面源码中的 `"forbidden":"$undefined"` 等路由元数据导致正常 200 状态被误判为 403。
2. 实现运行时动态嗅探：在 `connector.ts` 中引入动态 Action ID 解析管线。从首屏 HTML 解析 `deployment_id`，定位 Turbopack 异步清单 chunk，并逐级查找包含 `fetchSubscriptionAction` 的 `createServerReference` 模块，提取最新 40 位哈希。
3. 参数与回退机制：`manifest.json` 与 `connector.ts` 支持调用方显式提供 `ACTION_ID` 与 `DEPLOYMENT_ID` 参数优先覆盖，基准常量作为最后兜底。
4. 测试与验证：在 `tests/integration/connector/muse_connector.test.ts` 中补充包含 Next.js 假 forbidden 页面、多层异步 chunk 动态追踪、参数覆盖及正常 RSC 流式指标解析的完整集成测试，全部 15 个用例全通。

## Review 处置

### Round 1 (2026-09-26 22:35 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`tests/integration/connector/muse_connector.test.ts` 15 个用例通过；`pnpm test` 333 套件 4107 用例全通。
- 黑盒：打包运行实际刷新 `Connector 40708b12... (MUSE) refreshed: 2 items`，用量展示与限额采集正常。
- review：Round 1 code PASS, test PASS
- AC 证据：见 `handoff.json`

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

`single`：

- Round 1 general：N/A

### 结果摘要

彻底解决了 Muse 连接器因 Next.js 路由元数据误触发会话假失效与因 Meta 高频编译发版导致 Action ID 硬编码 404 失效的两大架构缺陷。通过 Turbopack 清单运行时动态嗅探，实现零配置无人值守自适应抓取。
