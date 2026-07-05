<!-- omni_powers: blueprint/prd -->

# OmniUsage 产品需求

## 一句话定位

常驻桌面进程，把多个 AI 服务商的用量/额度/余额集中读出来、统一展示，如实标注来源与新鲜度。对标 macOS 原生版 UsageBoard，跨 Windows / macOS / Linux。

## 目标用户

同时用多家 AI 服务（Claude、Codex、GLM、MiniMax…）的重度用户与团队。痛点：额度分散在各家控制台/本地凭证/网页后台，无法一眼看清"哪个账号快用完了"。

## 核心功能

集中监控以下服务的用量与费用，每个连接器一份定义（见 `spec_index.md`）：

- **本地凭证型**：Claude（`~/.claude`）、Codex（`~/.codex` 会话日志）
- **官方 API 轮询型**：智谱 GLM、MiniMax、DeepSeek（余额）、Tavily、Firecrawl
- **网页登录型**：MiMo、OpenCode Go（受控登录窗口捕获 Cookie）
- **聚合代理型（CPA）**：一份管理密钥经本地 CPA-Manager 代拉 Claude×N + Codex×N + Antigravity + Kimi 多账号

配套能力：多账号、账号级隐藏/删除、provider 聚合概览、明暗主题、代理、自定义刷新间隔、数据标签映射、配置导入导出、系统托盘、悬浮/弹出两种主面板形态。

## 成功标准

- 每条展示的数字都能追溯到 `observedAt`（观测时刻）+ `source`（来源）。
- 采集失败保留上次成功数据并明确标 stale，绝不把旧数据装成新的。
- CPA 单账号失败不拖垮同渠道其他账号（错误归属到账号，不到渠道）。
- 多账号 provider 概览用 `sum(used)/sum(limit)` 聚合，不对百分比取平均。
- 密钥不出主进程；渲染进程只见 `hasSecret` 布尔，不见明文。

## 明确不做

- 不做趋势图 UI（SQLite 留了历史数据，但第一版不出图）。
- 不做通用开放代理（LocalAPI 只白名单 ingest + health）。
- 不做系统钥匙串/safeStorage（自管 Vault，见 `specs/secret-vault.md` 威胁模型）。
- 不为第三方开放沙箱脚本连接器（`node:vm` 非真隔离，见 `architecture.md` 已知限制）。
- 界面语言切换、检查更新、问卷、赞助入口当前为占位，未落地实现。

## 对标项目

UsageBoard（macOS）、all-api-hub、aiusage、TokenTracker、codexbar。
