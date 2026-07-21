# platform-services-electron

> 验证方式：Desktop。拆自 platform-services（t037）。

Electron 主进程的会话采集能力。运行时消费见 `connector-runtime.md`；session 详见 `connector-session.md`。

## SessionManager（`src/main/core/session`）

受控网页登录态复用平台能力（MiMo 链路验证过并通用化）。详见 `connector-session.md`。

- 受控 BrowserWindow，每 provider 独立持久分区 `persist:<provider>-login`
- `webRequest` 捕获实际发出的目标接口请求头（Cookie），不从 cookie jar 猜拼
- 凭据写 SecretsVault
- 后台续期：`cookieRefreshHours`（0/6/12/24h）复用分区刷新
