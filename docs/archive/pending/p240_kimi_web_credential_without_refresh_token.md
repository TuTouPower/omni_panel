# p240 存量 kimi_web 凭据没有 refresh_token：升级后仍需手动重登一次才享受纯 HTTP 续期

- 来源：t492 实施后的打包版实测（2026-09-16，`artifacts/mac-arm64`，trace `refresh-mu4b9ln5-2q7vlp`）
- 现象与影响：改动前登录的 kimi_web 账号，vault 里只有 `cookie/authorization/session_id/device_id`，**没有 `refresh_token`**（该字段只在登录时从登录窗页面 localStorage 读入，见 `session-manager.ts` 的 `capture_refresh_token`）。这类凭据的 Bearer 15 分钟过期后无法静默续期，于是每个刷新周期都会走一次交互式登录窗：cookie 仍有效时 SPA 会在窗口内换到新 Bearer（p239 修订后窗口随即自动关闭并重试成功），cookie 也失效时窗口会停在那里等用户扫码/超时。在用户手动重登一次之前，kimi_web 会**周期性弹登录窗**，且卡片在自愈路径上始终显示 ok——用户看不到「为什么老弹窗」的任何解释。
- 机制（实测+代码）：
    - `auth-ipc.ts` 的 kimi 静默刷新分支：无 `refresh_token` 时要求现有 Bearer 仍在有效期，否则返回未刷新（打包版日志 `ipc:auth: Silent refresh: Kimi session … has no refresh token and the stored Bearer is not usable`）；
    - 随后 `refresh-service` 的 401 → 自动重登链路开窗（p239 修订后：捕获到不同 Bearer 即关窗并重试）。
- 修复：自动重登对 kimi_web 改用**隐藏窗口**——`handleCookieLogin(..., { auto: true })` 传 `LoginRequest.hidden: true`，`SessionManagerDeps.create_window(partition, { hidden })` 透传到 Electron（`show: false`，并关掉 `backgroundThrottling`，否则 Chromium 会推迟 SPA 的令牌刷新）。周期性的闪窗由此消失；手动登录（渲染层 `session.login`、`startCookieLogin`）仍显示窗口，用户需要扫码时走该入口（卡片错误文案已指向它）。
- 用户侧一次性动作（当前即可根治）：在设置里对 kimi_web 账号点一次「网页登录」并完成登录 → 新的 `refresh_token`（90 天）入 vault → 之后 Bearer 到期走纯 HTTP 续期，连隐藏窗都不再需要。
- 未做（需产品决策）：是否为「凭据缺续期材料」增加可见提示（卡片标记或一次性引导）——需要 observation 层新增「提示」通道或在主进程侧把该事实透出到实例状态；当前线索只有主进程 warn 日志。
- 未验证项：
    - `[deploy]` 隐藏窗在真实 Electron 下的自愈行为（`webRequest` 捕获与 `executeJavaScript` 读 localStorage 在隐藏窗内应照常工作，但需打包版跨过一次 15 分钟 Bearer 生命周期确认：无闪窗、能自愈）。
    - `[deploy]` 重登一次后应完全不弹窗（含隐藏窗）。
- 线索：打包版日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log`（grep `no refresh token`、`New credential captured`、`is not configured`）；相关实现 `src/main/ipc/auth-ipc.ts`、`src/main/core/session/session-manager.ts`、`src/main/index.ts`（`create_window` / `session_login`）、`src/main/core/auth/kimi_web_token_refresher.ts`。
- 处理：main-direct-fix
