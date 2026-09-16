# p240 存量 kimi_web 凭据没有 refresh_token：升级后仍需手动重登一次才享受纯 HTTP 续期

- 来源：t492 实施后的打包版实测（2026-09-16，`artifacts/mac-arm64`，trace `refresh-mu4b9ln5-2q7vlp`）
- 现象与影响：改动前登录的 kimi_web 账号，vault 里只有 `cookie/authorization/session_id/device_id`，**没有 `refresh_token`**（该字段只在登录时从登录窗页面 localStorage 读入，见 `session-manager.ts` 的 `capture_refresh_token`）。这类凭据的 Bearer 15 分钟过期后无法静默续期，于是每个刷新周期都会走一次交互式登录窗：cookie 仍有效时 SPA 会在窗口内换到新 Bearer（p239 修订后窗口随即自动关闭并重试成功），cookie 也失效时窗口会停在那里等用户扫码/超时。也就是说，在用户手动重登一次之前，kimi_web 会**周期性弹登录窗**，且卡片在自愈路径上始终显示 ok——用户看不到「为什么老弹窗」的任何解释。
- 已确认的机制（实测+代码）：
    - `auth-ipc.ts` 的 kimi 静默刷新分支：无 `refresh_token` 时要求现有 Bearer 仍在有效期，否则返回未刷新（打包版日志 `ipc:auth: Silent refresh: Kimi session … has no refresh token and the stored Bearer is not usable`）；
    - 随后 `refresh-service` 的 401 → 自动重登链路开窗（p239 修订后：捕获到不同 Bearer 即关窗并重试）。
- 用户侧一次性动作（当前即可解决）：在设置里对 kimi_web 账号点一次「网页登录」并完成登录 → 新的 `refresh_token`（90 天）入 vault → 之后 Bearer 到期走纯 HTTP 续期，不再弹窗。
- 待定（属产品/交互决策，本轮未做）：
    1. 是否给这类账号一个可见提示（卡片标记或一次性引导）——需要在 observation 层增加「提示」通道，或在主进程侧把「凭据缺续期材料」这一事实透出到实例状态；当前唯一线索是主进程 warn 日志。
    2. **是否让自动重登使用隐藏窗口**（`create_window` 加 `show: false`）——自动路径本就为无人值守自愈，隐藏窗可彻底消除周期性闪窗，且不影响 `webRequest` 捕获与 `executeJavaScript` 读 localStorage；需要打包版实测（Electron 层），未验证。
    3. 自动路径的窗口寿命：当前沿用全局 120s 超时（无新凭据时窗口会停留至超时）。
- 未验证项：`[deploy]` 打包版连续 ≥20 分钟（跨过一次 Bearer 生命周期）观察是否只剩一次性的窗口；重登一次后应完全不弹窗。
- 线索：打包版日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log`（grep `no refresh token`、`Auto-closing login window`、`New credential captured`）；相关实现 `src/main/ipc/auth-ipc.ts`（kimi 静默刷新）、`src/main/core/auth/kimi_web_token_refresher.ts`、`src/main/core/session/session-manager.ts`、`src/main/index.ts` 的 `session_login` 依赖。
- 处理：未开
