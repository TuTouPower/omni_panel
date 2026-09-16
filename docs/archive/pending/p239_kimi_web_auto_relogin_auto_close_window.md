# p239 kimi_web 自动重登路径 1.5 秒自动关窗，与渲染层登录行为不一致

- 现象：kimi_web 因 401 触发自动重登（`refresh-service` 的 `sessionLogin` 链）时，登录窗打开后 **1.5 秒**即自动关闭。打包版实测（2026-09-16，`artifacts/mac-arm64`，日志 trace `refresh-mu4b9ln5-2q7vlp`）时序：
    - `16:24:29.264 session-manager: Cookie captured`（登录窗首次带 cookie 请求）
    - `16:24:31.804 session-manager: Auto-closing login window` → `Login window closed` → `Session cookie saved`
    - 本次侥幸成功，是因为持久分区里的旧会话仍有效（SPA 用 cookie 自行换到了新 Bearer）；若需要用户真正扫码登录，1.5 秒根本来不及。
- 影响：kimi_web 的自动重登在「旧会话已失效、必须重新扫码」的场景下几乎必然失败；窗口还可能在前几次请求就捕获到**旧/匿名 Bearer**并落库（kimi_web 豁免了「离开登录域名再回来」的捕获门槛），使下一次采集继续 401。用户侧表现为「弹了一下窗又消失，仍然报凭证失效」。
- 根因：`src/main/ipc/auth-ipc.ts` 的 `handleCookieLogin` 对所有 provider 硬编码 `auto_close_ms: SESSION_LOGIN_AUTO_CLOSE_MS`（1500ms），而**渲染层路径**（`src/renderer/components/WebLoginSection.tsx`）自 t464 起对 kimi_web 显式不传 `auto_close_ms`（登录窗由用户手动关闭）。两条入口对同一 provider 行为分叉；kimi_web 还需要页面把新 Bearer 写进 localStorage（t492 起在带 Bearer 的请求到达时读取），提前关窗会让捕获点落在错误时刻。
- 同类位点：`handleCookieLogin` 是自动重登与「用户手动触发 AUTH_COOKIE_LOGIN」的共用实现（`startCookieLogin` 也走它），故两条入口都受影响；经 `session.login` IPC 的路径（`WebLoginSection` / `WebLoginForm`）不受影响。
- 测试缺口：现有单测只断言 `session_manager.start_login` 收到的 `auto_close_ms`（`tests/unit/ipc/auth-ipc.test.ts` 的 `delegates to sessionManager.start_login with instance-scoped partition and auto_close`），没有「kimi_web 不得自动关窗」的期望，也没有覆盖「自动重登期间用户需要扫码」的场景。
- 线索：打包版日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log`（grep `Auto-closing login window` 与同一 trace 的 `Cookie captured`）；修复方向与渲染层对齐——`handleCookieLogin` 对 provider `kimi_web` 不传 `auto_close_ms`，并补一条断言两条入口一致性的单测。注意取舍：不自动关窗会在无人值守时留一个待关窗口（需一并决定超时/提示策略）。
- 处理：main-direct-fix
