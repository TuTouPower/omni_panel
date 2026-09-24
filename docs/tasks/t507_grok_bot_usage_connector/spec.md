# Task spec

## 背景

参考 GitHub 仓库 https://github.com/kargatharaakash/grok-bot-mcp 的接口逆向与协议契约，为 OmniPanel 接入独立的 Grok Bot 用量监控能力。全链路闭环，不依赖外部 CLI 工具、不读取外部项目的凭据目录（如 `~/.gbm/`），通过标准的 Browser PKCE 登录流程获取凭据并安全存储在 OmniPanel 专有 Vault 中，支持周用量、按需额度采集与长效静默续期。

## 契约区

### 范围

- 在 `src/shared/schemas/plugin-output.ts` 注册 `grok_bot` 到 `usageProviderSchema`。
- 新增连接器 `connectors/grok_bot/`（`manifest.json` 与 `connector.ts`）：
    - 纯算法实现请求校验和计算（`x-cursor-checksum`），无外部模块或原生 Buffer/crypto 依赖；
    - 请求 `https://api2.cursor.sh` 的 `GetSandUsageStatus` 与 `GetCurrentPeriodUsage`；
    - 归一化输出 `grok_bot:weekly`（周用量，百分比与重置倒计时）和 `grok_bot:ondemand`（按需金额，已用/限额/周期结算日）两条 `ScriptObservation`。
- 主进程新增 `GrokBotOAuthManager`（`src/main/core/auth/grok_bot_oauth_manager.ts`）与对应 IPC/preload 暴露：
    - Browser PKCE 授权流：生成 code verifier / challenge / uuid，拉起默认浏览器访问授权页，后台轮询 `auth/poll` 获取 `accessToken` 与 `refreshToken`；
    - 凭据全生命周期写入 OmniPanel 自身的 Vault（`ACCESS_TOKEN` 与 `REFRESH_TOKEN`）；
    - 支持令牌静默续期（POST `https://api2.cursor.sh/oauth/token`），在 401 失败或临近过期时自动换票更新 Vault。
- 渲染层接入：
    - `src/renderer/lib/common-services.ts` 注册 Grok Bot 服务；
    - `src/renderer/components/Icon.tsx` 增加专属品牌图标；
    - 添加账号弹窗支持 Grok Bot 浏览器一键授权（兼支持手动输入 Token 备选）。

### 非范围

- 不读取外部 `~/.gbm/` 或 `~/.gbu/` 目录。
- 不通过 macOS Keychain 或 `sand-secrets.json` 提取桌面端凭据。
- 不实现 Grok Bot 的 MCP agent 交互或会话历史数据库同步（仅聚焦用量看板查询）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`usageProviderSchema` 包含 `grok_bot`，`connectors/grok_bot/manifest.json` 与 `connector.ts` 正确加载；在给定有效 Token 下，连接器向 `https://api2.cursor.sh` 发送携带有效 `x-cursor-checksum` 和鉴权头的请求，成功解析返回的周用量（`grok_bot:weekly`，包含百分比和重置时间戳）与按需用量（`grok_bot:ondemand`，包含已用/限额/账单周期）。
- [ ] AC-002：`GrokBotOAuthManager` 能够生成符合 PKCE 规范的校验码与 UUID，构造正确的授权 URL 并通过系统默认浏览器打开；轮询完成时成功捕获 `accessToken` 与 `refreshToken` 并安全写入当前实例命名空间的 Vault。
- [ ] AC-003：当 `ACCESS_TOKEN` 过期或采集遇到 401 错误时，主进程能够使用 Vault 中的 `REFRESH_TOKEN` 请求 `/oauth/token` 端点换取新令牌，并原子更新 Vault，确保后续采集重试成功且无需用户重复登录。
- [ ] AC-004：添加账号弹窗内包含 Grok Bot 项，点击开始登录能够触发浏览器授权并监听登录完成事件，成功创建实例并上报用量卡片。
- [ ] AC-005：当接口返回异常（如 403/500/网络中断或 JSON 格式异常）时，连接器通过 `report_failed_account` 正确上报失败并保留旧观测 stale 状态，不产生未捕获异常。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：参考 GitHub 仓库 https://github.com/kargatharaakash/grok-bot-mcp

### 有意不测

无。

### 测试策略

- 单元测试覆盖连接器内部的纯算法 checksum 计算、UUID 生成、RPC 响应格式解析、各字段可空边界。
- 单元测试覆盖 `GrokBotOAuthManager` 的 PKCE 码生成、轮询成功与超时分支、401 静默刷新与 Vault 写回。
- Mock HTTP 边界，不产生公网网络请求。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无。

### 风险与回退

- 风险：若官方后端 `api2.cursor.sh` 变更 checksum 算法或端点路径，可能导致请求被拒。
- 回退：连接器具备独立的错误归类和 stale 容错保护；若协议变更，只需就地升级连接器脚本与签名算法。

### 依赖与约束

无。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：更新连接器清单与 Provider 描述。
