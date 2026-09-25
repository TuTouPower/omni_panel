# Command Code 额度连接器与官方品牌图标

## 1. 范围与意图

为 OmniPanel 接入独立的 Command Code 账号用量与额度监控能力，并使用 Command Code 官方品牌矢量徽标（`⌘`）。通过官方 Bearer Token（`user_...` 格式）鉴权的 HTTP API（`https://api.commandcode.ai`），支持查询用户月度额度、5 小时窗口用量、周窗口用量及重置时间。

## 2. 外部契约与协议

- **API 基础地址**：`https://api.commandcode.ai`
- **认证方式**：HTTP 请求头携带 `Authorization: Bearer <API_KEY>`，同时需携带合规 User-Agent 以通过 Cloudflare 1010 校验。
- **查询接口**：
  - `/alpha/whoami`：验证身份与用户信息
  - `/alpha/billing/credits`：查询月度额度与余额
  - `/alpha/billing/subscriptions`：查询 5 小时窗口与周窗口重置周期
- **输出指标**：
  - `commandcode:monthly`：月度额度（已用额度、总额度与下月重置日期）
  - `commandcode:session_5h`：5 小时滑动窗口已用 token 与重置时间
  - `commandcode:weekly`：周额度消耗与刷新时间

## 3. UI 与展示契约

- 添加账号列表包含「Command Code」，展示官方 `⌘` 图标，提供 API Key 输入项。
- 账号用量卡片按多指标并行展示月度、5h 与周额度条。
