---
tid: "t505"
slug: "session_login_preemption"
title: "网页登录支持用户交互抢占后台静默重登"
status: "done"
branch: "t505_session_login_preemption"
worktree: ""
review_level: "full"
review_limit: "5"
verify_limit: "5"
diff_anchor: "08c00e9137a4d1dd4a5705441fbcf5d98b28d825"
depends_on: ""
conflicts_with: ""
note: "解决后台自动重登占用锁导致前台用户点击登录被 CONFLICT 拦截的问题，支持前台可见登录抢占后台隐藏会话"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。
创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. **SessionManager 锁模型升级**：将 `in_progress` 从无差别 `Set<string>` 改造为 `Map<string, ActiveLoginSession>`，维护会话元数据（`hidden`、窗口句柄、取消回调）；
2. **前台可见登录抢占**：在 `start_login` 中识别当前若为后台无头重登（`existing.hidden && !request.hidden`），立即调用 `existing.cancel()` 终止后台会话并关闭隐藏窗口，释放锁并启动用户可见登录窗；
3. **auth-ipc 状态协同**：`startCookieLogin` 与 `is_login_in_progress` 支持 `{ only_interactive: true }`，后台仅有隐藏重登会话时不阻断前台交互登录启动；
4. **门禁与测试**：`pnpm check` 全绿，`pnpm test` 全量 3918 项测试 100% 通过。

## Review 处置

每个结构化 finding 一行。`已修` 表示本 task 已修复；`遗留` 必须指向 `pNNN` 或 follow-up tid；`撤回` 必须写清理由。critical/important 未解决时不得 PASS。

### Round 1 (2026-09-20 04:52 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm check` 全绿；`pnpm test` 全部 319 个测试套件（3918 个测试用例）全部通过。
- 黑盒：集成与单元测试覆盖真实抢占与并发互斥；`pnpm test` 零失败。
- review：code review PASS（Round 1），test review PASS（Round 1），reviewed_scope 3b10b4354bdd4413。
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现了前台用户可见登录对后台无头重登任务的无缝抢占机制，消除了后台重登锁占用导致前台用户点击被 `CONFLICT`（已有登录正在进行中）拦截的体验缺陷。
