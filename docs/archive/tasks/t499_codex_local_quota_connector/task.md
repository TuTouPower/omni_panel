---
tid: "t499"
slug: "codex_local_quota_connector"
title: "Codex 本地连接器对接官方配额 API 与面板展示"
status: "done"
branch: "t499_codex_local_quota_connector"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "152bd4d26c9ef5ec89e5d6698f795bcb93760a84"
depends_on: ""
conflicts_with: ""
note: "读本地 ~/.codex/auth.json 直连 chatgpt.com/backend-api/wham/usage 获取 5h 与周配额"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 主进程与 IPC 层：新增 `src/main/core/auth/local-scanner.ts`，提供针对本地 CLI（如 Codex 的 `~/.codex/auth.json`）凭据的直接安全解析，支持提取 access_token、从 JWT 解码邮箱并读取 account_id。在主进程 IPC 中注册 `handleAuthScanLocal`，并在 preload 中暴露 `window.usageboard.auth.scanLocal`。
2. 前端表单层：改造 `LocalScanForm.tsx`，将旧有的前端 mock 定时器替换为真实 IPC 扫描调用；当扫描到有效凭据时，展示就绪状态面板（展示路径、账号邮箱、ID），并由 `AddAccountDialog` 自动回填 `account_name` 为登录邮箱。
3. 连接器对接：更新 `connectors/codex/manifest.json` 与 `connector.ts`，加入 `~/.codex/auth.json` 路径白名单与 `chatgpt` endpoint，直连官方配额 API `https://chatgpt.com/backend-api/wham/usage`，提取 primary_window（5h）和 secondary_window（一周）配额并规范化为 `ScriptObservation`。
4. 全量验证与门禁：补充单元测试与沙箱集成测试，全量门禁 `pnpm test`（137 文件 1248 用例全绿）、`pnpm lint`（0 告警 0 错误）、`pnpm typecheck` 及 `pnpm format:check` 全绿通过。

## Review 处置

### Round 1 (2026-09-17 19:20 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test`（137 文件 1248 用例全绿）、`pnpm lint`（0 warnings, 0 errors）、`pnpm typecheck`（exit 0）、`pnpm format:check`（exit 0）
- 黑盒：单测及沙箱内模拟本地 CLI 凭据读取与官方端点交互通过
- review：`review_code.md` PASS、`review_test.md` PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- AC-001 ~ AC-004 全部满足。
- 彻底与 CPA 网关解耦，实现本地已登录 Codex CLI 凭据自动发现、账号邮箱提取与官方 ChatGPT 用量/配额面板展示。
