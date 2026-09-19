---
tid: "t504"
slug: "web_session_keepalive_unification"
title: "统一 Web 会话类连接器保活机制与认证失效识别"
status: "done"
branch: "t504_web_session_keepalive_unification"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "c01c5e0613564e916458ca2ef6829d28c4e008e7"
depends_on: ""
conflicts_with: ""
note: "所有 session 网页连接器（opencode_go、mimo、kimi_web）统一认证失效识别、后台静默保活与生命周期管理"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。
创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. **TDD 认证失效判定与连接器抛错规范**：扩展 `src/shared/lib/auth-error.ts`，识别 `Cookie 可能已失效，未跳转到 workspace`、`MiMo 登录会话已失效` 及各类 session/cookie 过期文案；规范 `connectors/mimo/connector.ts` 在服务端业务码表示未登录时抛出带会话失效语义的异常。
2. **重构泛化通用 Web 会话保活管线**：
    - 重构 `src/main/ipc/auth-ipc.ts` 消除 `provider === "kimi_web"` 硬编码特例，在 `options.auto === true` 模式下为所有 session 类连接器启用 `hidden: true`、`close_when_credential_refreshed: true` 与 30s 安全超时；
    - 泛化 `src/main/core/session/session-manager.ts` 的 `close_when_credential_refreshed`，支持纯 Cookie 连接器在后台重登时比对凭据变更与校验有效性后立即关窗落库；放宽已有实例重登时的 wildcard 同源重定向拦截；
    - 修正 `src/main/index.ts` 中的 `sessionLogin` 降级逻辑：仅当 `trySilentCookieRefresh` 真正换到新凭据（`silent.refreshed && silent.credential_changed`）时才短路返回，否则回退到后台自动重登窗口自愈。
3. **调度层与测试套件补齐**：扩展 `refresh-service` 集成测试、`auth-ipc` 单元测试与 `session-manager` 单元测试，全面覆盖 OpenCode 与 MiMo 的会话失效自动重登、重试成功与超时降级。
4. **门禁与黑盒验证**：`pnpm check`（typecheck, lint, format:check, deadcode, arch）全绿；`pnpm test` 全量 3909 项测试 100% 通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-20 04:02 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 全绿；`pnpm test` 全部 319 个测试套件（3909 个测试用例）全部通过。
- 黑盒：`pnpm test:e2e:web`（90 项通过）；集成测试模拟真实连接器会话失效并验证自动重登重试成功。
- review：code review PASS（Round 1），test review PASS（Round 1），reviewed_scope db6f61d114e38da8。
- AC 证据：见 `handoff.json`

### 结果摘要

- 统一了所有 Web 会话类连接器（OpenCode Go、MiMo、Kimi Web）在凭据失效时的错误判定、后台隐藏窗口静默保活与生命周期管理，彻底消除了针对 kimi_web 的硬编码特例，解决了 OpenCode Go 与 MiMo 在 Cookie 自然失效后采集失败且无法自愈的系统性缺陷。
