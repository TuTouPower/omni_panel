# Task spec

## 背景

Kimi 目前仅支持 API Key 登录（`connectors/kimi/manifest.json` 只声明 `API_KEY` secret）。`vendors/kimicodebar` 的 `KimiOAuthService.swift` 证实 Kimi 支持 RFC 8628 Device Code Flow，与 Kimi Code CLI 同源，且 quota API 对 API Key 与 OAuth access token 一视同仁（均走 `Authorization: Bearer`）。

参考实现关键常量（来自 `KimiOAuthService.swift`，公开客户端参数，非密钥）：

- `https://auth.kimi.com/api/oauth/device_authorization`
- `https://auth.kimi.com/api/oauth/token`
- `client_id: 17e5f671-d194-4dfb-9706-5516cb48c098`
- 轮询总预算 15 分钟，默认间隔 5s，`slow_down` +5s

我们已有 grok 的 device-code 实现（`src/main/core/auth/grok_oauth_manager.ts` + `GrokLoginSection.tsx`），kimi 可复用同一模式。

## 范围

- 新建 `src/main/core/auth/kimi_oauth_manager.ts`：仿 `grok_oauth_manager.ts`，实现 `login_start`（请求 device authorization）+ `login_poll`（轮询换 token）+ token 刷新。
    - 错误处理覆盖 `authorization_pending` / `slow_down` / `expired_token` / `access_denied`。
    - refresh 时服务端可能不返回新 `refresh_token`，需沿用旧值（`KimiOAuthService.swift:324` 注释明确）。
    - 设备头 `X-Msh-Platform: kimi_code_cli` / `X-Msh-Device-Id`（复用 `~/.kimi-code/device_id`，不存在则生成 UUID 落盘 0600）。
- 新建 `src/main/ipc/kimi_auth_ipc.ts` + preload 暴露 `window.usageboard.kimi.login_start/login_poll/login_status`。
- 新建 `src/renderer/components/KimiLoginSection.tsx`：仿 `GrokLoginSection`，显示设备码 + 验证链接，轮询成功后存 `OAUTH_TOKEN` 到 vault（与 API Key 隔离，不覆盖）。
- 改 `connectors/kimi/manifest.json`：`auth` 块声明 `oauth_device`（依赖 t107），`secret_name: OAUTH_TOKEN`；保留 `API_KEY` 作为可选 fallback。
- 改 `connectors/kimi/connector.ts`：token 读取顺序 `OAUTH_TOKEN` → `API_KEY`，任一存在即可。
- 单测：`tests/unit/auth/kimi_oauth_manager.test.ts`（mock http_post 覆盖 pending/slow_down/expired/refresh 省略 refresh_token 场景）。

## 非范围

- 不做「编辑账号」页内嵌 KimiLoginSection（t110 的表单接线统一处理添加流程；编辑页复用现有 SettingsForm）。
- 不删除 API Key 登录路径。

## 验收标准

- [ ] kimi 添加账号时可走 device code OAuth，不再强制粘 API Key。
- [ ] OAuth token 与 API Key 隔离存储，互不覆盖。
- [ ] token 过期前自动刷新，refresh 省略 refresh_token 时沿用旧值。
- [ ] `pnpm test` 全绿。

## 依赖与约束

- 依赖 t107 的 manifest `auth` 块与 `AuthDescriptor` 类型。
- 依赖 t109 的 `OAuthDeviceForm` 模式（UI 复用）。
- `client_id` 为 Kimi Code CLI 公开客户端标识，可直接使用；非密钥。
