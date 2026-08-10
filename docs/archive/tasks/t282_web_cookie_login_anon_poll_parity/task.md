---
tid: "t282"
slug: "web_cookie_login_anon_poll_parity"
title: "web 添加账号 cookie 登录轮询对齐与轮询逻辑去重"
status: "done"
branch: "t282_web_cookie_login_anon_poll_parity"
worktree: ""
review_level: "full"
diff_anchor: "e0ccad3ec41005bb92a3dcb781bf2c6ea054da6b"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: "p106：t278 Round 3 遗留四项；认证面 full"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

- doctor_cmd：无
- preflight PASS；无 UNVERIFIED
- 决策：AC-001 采用降级指引（web 无 instance 不能 cookieLogin vault），非临时实例
- 共享实现：`src/renderer/lib/cookie_login_poll.ts`（poll + format_cookie_login_error）
- 假计时器 UI 超时测用 fireEvent+advanceTimers，避免 userEvent 挂死
- node_modules 用主仓软链跑测，收尾前删除
- 黑盒：`pnpm test` 2833 passed；typecheck 通过；改动文件 eslint 通过；electron e2e 未跑（AC-005 单测覆盖桌面 session.login）
- p106 已在 archive 且处理=t282，无新 pending

## Review 处置

### Round 1 (2026-08-10 21:20 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-001：`web_login_section.test.tsx` anon guide + 手动粘贴
    - AC-002：SettingsForm/WebLoginSection 共用 `poll_cookie_login`；`cookie_login_poll.test.ts`
    - AC-003：`auth-ipc` startCookieLogin CONFLICT；UI 冲突中文无英文
    - AC-004：poll/SettingsForm/WebLoginSection 120s 超时中文
    - AC-005：desktop path 仍 `session.login`，不调 cookieLogin

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

web 添加账号 cookie 登录降级指引 + 共享轮询去重 + CONFLICT/超时测试补齐；桌面路径不回归。