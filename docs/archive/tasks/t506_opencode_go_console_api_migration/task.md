---
tid: "t506"
slug: "opencode_go_console_api_migration"
title: "OpenCode Go 适配官方 Console 新架构与 REST API"
status: "done"
branch: "t506_opencode_go_console_api_migration"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "2a34e0e50fca08c11d369facb07f13a962441912"
depends_on: ""
conflicts_with: ""
note: "适配 OpenCode 官方全新 Console 架构，登录凭据迁移至 __Host-console_session，连接器全面改用 /console/api/orgs 与 /console/api/usage/summary 官方接口"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。
创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. **Manifest 与登录验证重构**：更新 `manifest.json` 登录 URL 为 `https://opencode.ai/console/login`，声明 `__Host-console_session`；重构 `verify_cookie` 优先请求 `/console/api/orgs` 验证 200，并放宽 `is_valid_opencode_login` 支持 `/console/` 重定向，彻底解决登录关窗时丢 Cookie 的问题；
2. **连接器全面对接官方 REST API**：彻底移除旧版 HTML 正则与 server-fn，改为标准 REST 流程（`GET /console/api/orgs` 获取 `org_id` -> 带 `x-org-id` 请求 `/console/api/usage/summary` 与 `/console/api/billing/status`），产出 rolling/weekly/monthly/balance 观测项；
3. **测试覆盖与旧测试清理**：新增 `tests/integration/connector/opencode_go_connector.test.ts` 覆盖新 API 解析与 401 失效；因旧版 HTML 爬虫语义随官方废弃 `/workspace` 彻底失效，根据 TDD 规范整体删除旧文件 `tests/unit/connector/opencode_go.test.ts`；
4. **门禁检查**：`pnpm check` 全绿，`pnpm test` 全量 3903 项测试 100% 通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-20 05:05 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 全绿；`pnpm test` 全部 318 个测试套件（3903 个测试用例）全部通过。
- 黑盒：集成测试模拟真实新版 Console API 响应与 401 失效；`pnpm test` 零失败。
- review：code review PASS（Round 1），test review PASS（Round 1），reviewed_scope f2c8542e273fca40。
- AC 证据：见 `handoff.json`

### 结果摘要

- 成功将 OpenCode Go 升级适配至官方全新 Console REST API 架构，解决了官方改版导致的旧路由 404、登录关窗丢弃凭据以及采集固定失败的问题。
