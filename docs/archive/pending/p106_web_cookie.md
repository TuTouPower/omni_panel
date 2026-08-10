# p106 web 认证 web 添加账号 cookie 登录阻塞式、轮询逻辑重复与覆盖缺口（2026-08-10）

- 来源：t278 review Round 3 f006/f007（code，minor）与 f007/f008（test，minor）
- 内容：四项。(1) web 面板添加 cookie 类账号（无 `instance_id`）时「网页登录」仍走阻塞式 `session.login`，无状态轮询；窗口打开期间刷新/断请求会丢失捕获结果，且与编辑实例路径行为分叉（`WebLoginSection.tsx` web+instance_id 分支已轮询）。可后续改为先建临时会话接入 `cookieLogin`/`cookieLoginStatus`，或仅在 web 登录指引提示「登录期间勿刷新，失败后手动粘贴 Cookie」。(2) `SettingsForm.handle_session_login` 与 `WebLoginSection` web 分支的 250ms/120s 轮询逻辑逐字重复，后续可抽共享 hook。(3) `startCookieLogin` 并发冲突（CONFLICT）分支无测试——在 `tests/unit/ipc/auth-ipc.test.ts` 令 `is_login_in_progress` 返回 true，断言返回 CONFLICT 且不触发 `sessionManager.start_login`。(4) `SettingsForm`/`WebLoginSection` 轮询 120s 超时分支无测试——mock `cookieLoginStatus` 恒 `in_progress:true`，`vi.useFakeTimers()` 推进超 `COOKIE_LOGIN_POLL_TIMEOUT_MS`，断言「网页登录超时，请重试」。
- 处理：t282

# 不办

用户已显式确认暂搁的条目——「以后再说」，不是闭环。`task-from-pending` / `task-bug` 不自动捞本节；`repo-hygiene` 不迁 archive。

字段复用上方普通 / bug 模板，追加必填项：

- `- 暂搁：YYYY-MM-DD 决定不办的理由`：写清为什么现在不动（风险可控、排期靠后、等外部依赖等）。
- `- 处理` 固定写「不办」。

以下 9 条自 `docs/legacy_backlog.md`「暂不建 task（附理由）」节迁入（2026-07-31 对齐模板时迁移）；2026-08-01 复核后 8 条复活回「待办」节，1 条（p008）保留，2026-08-07 用户要求归档迁出。

统一几个面板的设计语言，主题色 强调色 背景色 辅助色 字体等等。

改成 tailwind css
有什么应该用框架但是没用的
