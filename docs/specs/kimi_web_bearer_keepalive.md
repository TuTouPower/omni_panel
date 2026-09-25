# Kimi 网页会话 Bearer 续期通道与静默刷新

## 1. 范围与意图

kimi_web 的 quota 认证凭据使用 15 分钟短效 Bearer JWT 与长效 Refresh Token。本契约定义无人值守的 Bearer 自动续期通道与正确的静默刷新判定。

## 2. 外部契约与协议

- **续期端点**：`POST https://auth.kimi.com/api/account.gateway.v1.AuthService/RefreshToken`
- **请求格式**：`Content-Type: application/json`，载荷 `{"refreshToken": "..."}`
- **响应解析**：HTTP 200 返回 `{accessToken, refreshToken}`；access token 寿命 900 秒，refresh token 寿命 90 天并支持安全轮换。
- **凭据存盘**：主进程 Vault 在获取新 token 对后原子持久化更新 `SESSION_COOKIE` 中的 Bearer 凭据，同时保留 `session_id` 与 `device_id`。

## 3. 错误处理与刷新行为

- **静默刷新判定**：无法产出可用新 Bearer（如 refresh token 过期或网络故障）时，`trySilentCookieRefresh` 明确报告失败，不向调用方伪报成功。
- **401 自动重登**：采集遇 401 触发自动重登时，重试请求必须携带刷新后的新 Bearer；未取得新 Bearer 时不计入重试预算。
- **用户提示**：续期彻底失败时向渲染层回传友好错误提示（“登录态失效，请重新登录”），不暴露裸 HTTP 状态码，并保留重新登录入口。
