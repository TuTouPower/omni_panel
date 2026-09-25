# Grok Bot 用量连接器与 Browser PKCE 认证

## 1. 范围与意图

接入独立的 Grok Bot 用量监控能力。全链路闭环，不依赖外部 CLI 工具、不读取外部项目目录，通过标准的 Browser PKCE 登录流程获取凭据并安全存储在 OmniPanel 专有 Vault 中，支持周用量采集与长效静默续期。

## 2. 认证流程与协议

- **Browser PKCE 授权流**：
    - 主进程生成 RFC 7636 标准的 `code_verifier` 与 `code_challenge`（S256），生成唯一 uuid 与内部 login_id；
    - verifier 仅保留在主进程内存（`pending_verifiers`），不流经渲染层与 IPC；
    - 启动默认浏览器打开 `https://cursor.com/loginDeepControl?uuid=...&challenge=...`；
    - 后台轮询 `auth/poll` 获取 `accessToken` 与 `refreshToken` 并写入 Vault（`ACCESS_TOKEN` 与 `REFRESH_TOKEN`）。
- **Token 自动轮换与续期**：
    - 后台定时调度器与 401 即时重试调用 `https://api2.cursor.sh/oauth/token` 刷新凭据；
    - 刷新请求支持基于 instance_id 的 Promise 并发去重与网络容错。

## 3. 采集契约

- **上游端点**：`https://api2.cursor.sh` 的 `GetSandUsageStatus`；请求携带由纯算法生成的 `x-cursor-checksum`。
- **输出指标**：归一化输出 `grok_bot:weekly`（周用量百分比与重置倒计时）；原设计的 ondemand 指标因官方接口未提供有效计数已被裁撤（见 ADR 037）。
