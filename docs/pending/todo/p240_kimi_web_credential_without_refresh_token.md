# p240 存量 kimi_web 凭据没有 refresh_token：升级后仍需手动重登一次才享受纯 HTTP 续期

- 来源：t492 实施后的打包版实测（2026-09-16，`artifacts/mac-arm64`，trace `refresh-mu4b9ln5-2q7vlp`）
- 内容：
    - **背景**：t492 让 kimi_web 用 refresh token 走 HTTP 续期，但 `refresh_token` 只在**登录时**从登录窗页面 localStorage 读入。改动前登录的存量账号，vault 里只有 `cookie/authorization/session_id/device_id`，没有 `refresh_token`。
    - **实测后果**：Bearer 过期后，静默刷新走「旧凭据」分支（要求现有 Bearer 仍在有效期，否则不报成功）→ 返回未刷新 → 回退**打开登录窗**重登。日志里 kimi_web 正是这样恢复的（`Auto-closing login window` 见 p239）。也就是说：存量账号在重登一次之前，每次 Bearer 到期都会弹一次登录窗，而不是静默 HTTP 续期。
    - **待决定的事项**（需要产品/交互决策，故未直接实现）：
        1. 是否在 UI 上给出一次性引导（如「本次更新后请重新完成一次网页登录以启用自动续期」），或在连接器卡片上区分「凭据缺少续期材料」这一态；
        2. 是否让静默刷新在「无 refresh token」时也返回可区分的 reason，供 UI 展示不同文案（当前统一为 `refreshed:false` → 回退交互式登录）；
        3. 是否需要在 `docs/guides/` 或发布说明里写明这次升级的迁移动作。
    - **为什么现在没做**：属升级迁移体验，不影响新登录账号的正确性；t492 的范围是「让续期可用」，未包含存量凭据的迁移引导。
- 线索：证据同 p239（打包版日志 `~/Library/Application Support/OmniPanel/logs/app-2026-09-16.log`）；相关实现 `src/main/ipc/auth-ipc.ts` 的 `refresh_kimi_web_session`（无 refresh token 分支）、`src/main/core/auth/kimi_web_token_refresher.ts`。
- 处理：未开
