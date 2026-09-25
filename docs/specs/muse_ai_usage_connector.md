# Muse AI 网页用量连接器与会话保持

## 1. 范围与意图

将 Muse AI（Meta 智能体平台）用量与额度接入 OmniPanel，采用 Web 会话登录（`session` / `web_login`）模式，支持网页登录捕获 Cookie、后台常驻保活与凭据失效时自动隐藏窗口重登。

## 2. 外部契约与协议

- **登录地址**：`https://muse.ai/`
- **捕获 Cookie**：`hatch_sess`、`hatch_gw`、`hatch_vml`、`datr`
- **用量接口**：以 POST 调用 Next.js Server Action（`fetchSubscriptionAction`），携带会话 Cookie 解析 RSC（React Server Components）流式响应体。
- **输出指标**：
  - `muse:weekly`：周期限额（百分比、重置时间戳）
  - `muse:extra`：从不过期额外词元额度

## 3. 错误与重登契约

- 当 Cookie 缺失、过期或无效（服务端返回 `Authentication required` 或 401/403）时，连接器抛出可被 `is_auth_error` 识别的会话失效错误，触发后台自动重登流程。
