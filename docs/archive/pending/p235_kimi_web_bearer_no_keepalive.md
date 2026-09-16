# p235 kimi_web 网页会话无 Bearer 续期通道，静默刷新假成功后仍用过期令牌采集

- 现象：kimi_web（Kimi 网页版）添加时能正常采集，静默运行一段时间后固定报采集失败（错误形如 `HTTP 401: request failed (N bytes)`，卡片显示「凭证失效，请重新登录」），且自动重登链不生效；只有用户手动进设置页重跑「网页登录」才能恢复。复现间隔与 Bearer 寿命一致：JWT `exp-iat=900`（15 分钟），默认 refreshInterval 300 秒，故约 15~20 分钟后必失败。
- 影响：
    - kimi_web 连接器无法长期无人值守运行；5 小时/7 天/月三个指标的连续观测被周期性打断，历史被插 `stale` 副本。
    - 受影响范围：`connectors/kimi_web`、`src/main/ipc/auth-ipc.ts trySilentCookieRefresh`、`src/main/core/session/session-manager.ts` 的 kimi_web 捕获分支、`src/main/core/scheduler/refresh-service.ts` 的 401 自动重登链。同一 chain 上还有 2 个已确认同类位点（见根因 3、4）。
    - opencode_go 同为 `web_login`，但其认证凭证就是 cookie 本身，静默刷新语义成立，不在本次范围。
- 根因：
    01. 【机制·产品缺陷】kimi_web 的 quota 接口认证凭证是短寿命 Bearer JWT，而 Bearer 只在「网页登录窗口打开时」经 `session.on_before_send_headers` 捕获一次（`session-manager.ts:242-251`、`session-manager.ts:176-184`）。窗口关闭后**没有任何代码路径能产出新 Bearer**——全仓 grep 只有登录捕获与静默刷新两处写 `SESSION_COOKIE`，后者只改 cookie。持久 partition `persist:session-login:<instance>` 登录后也无任何流量（`fromPartition` 仅出现在登录窗与静默刷新读 cookie），cookie 同样得不到服务端滚动续期。
    02. 【机制·产品缺陷】`trySilentCookieRefresh`（`auth-ipc.ts:263-288`）对 kimi_web 的判定是「`authorization` 字段是非空 string 就算可用」，据此返回 `true`；它只覆盖 `cookie`、原样保留过期 `authorization`，没有 exp/有效性校验，也没有 mint 新 Bearer 的口子。
    03. 【机制·级联】`refresh-service.ts:423-455` 收到 `{saved:true}` 即视为重登成功，用**同一个过期 Bearer** 重试一次 → 再 401 → `session_relogin_done` 已置位 → break 落 `failed`。全程不打开交互式登录窗，用户侧只有失败的卡片，自动重登链对 kimi_web 是空转。
    04. 【已确认同类】`auth-ipc.ts:280-283`：静默刷新把「authorization 非空」等同「凭据可用」，未做任何有效期判定。修 kimi 时应把该判定提为可复用语义，避免下一同类接入重犯。
    05. 【已确认同类】`auth-ipc.ts:289`：回写 vault 即报成功，缺少「新凭据确实能用于下一次采集」的确认点。
    06. 【同类·单列待实测】`auth-ipc.ts:125` 自动重登路径硬编码 `auto_close_ms: SESSION_LOGIN_AUTO_CLOSE_MS`（1500ms），而 session-manager 对 kimi_web 豁免了「离开登录域名再回来」的捕获门槛（`session-manager.ts:231-236`），持久 partition 里本来就有 cookie（`session-manager.ts:252-266`）——窗口一旦打开，首个带 cookie 的请求就会启动 1.5 秒自动关闭计时，扫不到码就被关掉。需实测确认（本条只在「静默刷新失败→回退开窗」时触发，不是当前报错路径）。
    07. 【同类·单列待实测】`session-manager.ts:162` kimi_web 跳过 `verify_cookie` 捕获后校验，保存的 Bearer 从不验证；用户关窗过早时可能存下旧/无效 Bearer。需实测确认触发概率。
    08. 【死代码·同类残留】`session-manager.ts:255-256` 空 `if (request.provider === "kimi_web") {}` 块（t464 遗留），与本缺陷同源，修复时一并清理。
    09. 【非缺陷·设计约束】`SettingsForm.tsx:327` 隐藏 kimi_web 的 `AUTHORIZATION` 表单字段，用户无法手动粘贴 Bearer，手动重跑「网页登录」是当前唯一恢复路径——修复后该入口仍须保留。
    10. 【已扫无同类】其余 session 连接器（mimo/opencode_go）的凭证就是 cookie，静默刷新语义成立；`refresh-service` 的 OAuth 刷新分支只对 `oauth_device` 生效，与本次无关。
- 测试缺口：
    - 【假绿·必须替换】`tests/unit/ipc/auth-ipc.test.ts:571-636`（t469 AC-002「wildcard Kimi refresh keeps Bearer and device fields」）把缺陷本身当期望断言：`authorization: "Bearer token-sentinel"` 原样保留被断言为正确行为，锁死了当前实现语义。修复后该用例语义失效，须整体替换为新语义测试（按 TDD 纪律，不得把旧断言就地改成当前实现的输出）：过期 Bearer 时静默刷新不得报成功 / 或报成功但 authorization 必须已更新；session_id、device_id 的保留语义单独覆盖。
    - `tests/integration/connector/kimi_web_connector.test.ts` 只用未过期 Bearer，未覆盖过期与 401 分支。
    - `tests/integration/scheduler/refresh-service.test.ts:948-1013` 的 session 重登用例，mock 的 `sessionLogin` 直接把 vault 值从 `expired` 换成 `valid`，恰好绕开了 kimi_web 的真实缺陷——测试基础设施具备但没覆盖「重登拿不到新凭据」的形态。
    - 应补的层与断言：
        1. auth IPC 单测（真实 `trySilentCookieRefresh` + fake session partition）：Kimi JSON 凭据含**已过期 JWT** 时不得计入成功；含未过期 JWT 时 authorization 必须被更新为新值；cookie/session_id/device_id 保留语义不变。
        2. refresh-service 集成测试：以 kimi 凭据形态（JSON + 过期 JWT）驱动，断言「重登成功时重试使用的 Bearer 必须与首次不同」，以及「重登未产出新 Bearer 时不得算作成功重登、不得因此耗尽重试预算后静默失败」。
        3. Bearer 续期通道（token pump）自身的单元测试：拦截 `www.kimi.com/apiv2/*` 的 `authorization` 头 → 写回 vault 且保留 cookie/session_id/device_id；无流量时触发后台导航后能捕获新 Bearer；日志与 fixture 不含真实令牌。
        4. 回归口径：`is_auth_error` 已能识别 `HTTP 401`，不需要改动，但需覆盖「自动重登后仍 401 时 UI 给出可操作提示」的渲染断言。
- 线索：
    - 最小复现：`.scratch/kimi-web-session/repro.test.ts`，运行 `pnpm vitest run --config .scratch/kimi-web-session/vitest.repro.config.mts`（全部断言通过，即缺陷成立）。
        - R1：真实 `trySilentCookieRefresh` 返回 `true`，刷新后 `authorization` 与刷新前逐字节相同，其 `exp` 早于当前时间 300 秒。
        - R2：真实 `createRefreshService` + 真实 `connectors/kimi_web/connector.ts` + 复刻 `src/main/index.ts:394` 的生产接线，实测「发出 Bearer 2 次且完全相同」「交互式登录窗触发 0 次」「最终状态 failed，error 含 401」。
    - 契约与续期方案来源（已定、未实现）：`docs/findings/d057_kimi_web_quota_api_contract.md`、`docs/spikes/s036_kimi_web_quota_pump/report.md` 结论段——token pump：实例 partition 上拦截 `apiv2/*` 的 `authorization` 头写 vault，connector 只读 vault，空闲无流量时需后台导航触发一次请求。
    - 既有「续期 token 刷新」基础设施盘点（2026-09-15 核查，均为 token/refresh_token 型，kimi_web 不能直接复用）：
        - `src/main/core/auth/device_code_oauth_manager.ts`（t339，grok/kimi code 共用）：`refresh_now`（HTTP refresh-token grant）+ `start_auto_refresh/reconcile_auto_refresh`（按 `expires_at - REFRESH_MARGIN_MS(5min)` 定时刷新、`MAX_REFRESH_RETRIES=10` 退避），token 落 vault 的 `OAUTH_TOKEN/OAUTH_REFRESH_TOKEN/OAUTH_EXPIRES_AT`；`src/main/index.ts:631,637` 配置变更时 reconcile。
        - `src/main/core/scheduler/refresh-service.ts:270-298` 的 `oauth_refresh` 钩子（t172）：采集 401/403 时即时刷新一次再重试，但触发条件硬编码 `auth.method === "oauth_device"`（`:276`），`src/main/index.ts:412-423` 只给 grok/kimi 注册——kimi_web（`web_login`）接不进去。
        - session 类连接器的续期实为 `trySilentCookieRefresh`（只重读 cookie，不产 token）；`docs/specs/connector-session.md:29` 已明确「后台续期未实现」。
        - 判定：kimi_web 无 refresh_token，且 cookie-only 调 apiv2 实测 401（s036），现有 HTTP 续期无接口可打。
    - 新增未验证线索（抓包 `data/capture_20260909_053303.zip`，2026-09-15 核查）：登录成功那个 `GetLoginQRCodeStatus`（相对时间 13929ms）与首个带 Bearer 的 `GetCurrentUser`（14151ms）之间没有任何其它 kimi.com 请求，Bearer 极可能在 QR-status 响应里下发（s036 曾列为备选后判为废弃）；且网页登录走 `auth.kimi.com`，与 kimi code device OAuth 同 host，若网页端持有 refresh token 并通过 `auth.kimi.com` 换新 Bearer，则可直接套用 `kimi_oauth_manager` 同套 HTTP 续期，无需常驻浏览器 pump。抓包响应体未捕获、JWT 全 redact，无法离线证实，需在线验证。
    - 相关历史 task：t463（spike 结论）、t464（连接器与凭据捕获）、t469（wildcard 静默刷新修复，其测试即上述假绿来源）。
- 处理：t492
