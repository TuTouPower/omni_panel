# Task spec

## 背景

花云（FlowerCloud / flower.yt / api-flowercloud.com）是广泛使用的代理服务商，其订阅链接采用阅后即焚安全策略（约 10 分钟自动失效且强制直连），无法通过传统静态订阅 URL 定时轮询用量。用户在 Web 控制台（WHMCS 架构，带 Cloudflare 质询与代理 IP 403 拦截）可直观查看已用流量、总额度与账单重置日期。

OmniPanel 已有完善的 `web_login` / 会话托管（`session-manager`，基于持久化分区窗口通过 Cloudflare 质询、后台静默保活重登、WebLoginForm 渲染）基础设施。用户要求创建 task 接入花云用量与刷新时间监控，充分复用既有连接器运行时、会话登录管线与设置表单组件，**并且必须在真实环境中实际登录账号走通全流程，验证拿到真实用量数据展示在面板上**。

## 契约区

### 范围

- 新增 `connectors/flowercloud/`：
    - `manifest.json`：声明 `id: "flowercloud"`, `provider: "flowercloud"`, `capabilities: ["session"]`, `auth: { method: "web_login", secret_name: "SESSION_COOKIE", login_url: "https://api-flowercloud.com/clientarea.php" }`, `endpoints: { "default": "https://api-flowercloud.com" }`, `loginDomains: ["api-flowercloud.com", "flower.yt", "flowercloud.net"]`, `cookieNames: ["*"]`，并支持可选配置项 `RESET_DAY`（每月重置日兜底）。
    - `connector.ts`：读取 `SESSION_COOKIE`，通过 `ctx.http.get_raw` 加载客户区页面，解析已用流量（used）、总额度（limit）、账单日（`nextduedate`，计算 `reset_at`），产出月度用量指标（`flowercloud:traffic`，`window: "month"`, `display_style: "ratio"`）。
- 扩展 provider 注册与前端元数据：
    - 在 `src/shared/schemas/plugin-output.ts`（及对应 JSON Schema）扩充 `usageProviderSchema` 包含 `"flowercloud"`。
    - 在 `src/renderer/lib/provider_registry.ts` 注册 `flowercloud` 元数据与展示标签（`FlowerCloud (花云)`），自动接入 `AddAccountDialog` / `WebLoginForm`。
    - 在 `src/renderer/components/Icon.tsx` 注册 FlowerCloud 品牌图标。
- 会话保活与异常识别：
    - 在 `src/shared/lib/auth-error.ts` 补充 FlowerCloud 会话失效判定，未登录或 Cookie 失效时触发既有后台静默重登/前台重登唤起。
- 测试覆盖与真实环境全流程闭环：
    - 编写 `tests/integration/connector/flowercloud_connector.test.ts`（覆盖正常解析、低倍率/单位换算、401/403/重定向到登录页失效识别、自定义 RESET_DAY 兜底）。
    - 验证 `pnpm test` 与类型检查通过。
    - **真实全流程走通（Live Dogfooding）**：经用户许可后启动真实测试实例，实际登录花云账号并通过 Cloudflare 验证，验证抓取到真实账户的用量与刷新时间，面板正常渲染对应卡片。

### 非范围

- 不做模拟提交账密的后端逆向自动化（统一通过桌面内置会话登录窗进行交互验证）。
- 不抓取与解析订阅链接节点内容（仅关注套餐用量与刷新时间）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：在添加账号界面提供“FlowerCloud (花云)”入口，点击展示网页登录授权表单，支持调起登录窗访问 `https://api-flowercloud.com/clientarea.php`。
- [ ] AC-002：使用有效会话 Cookie 执行采集时，成功解析已用流量、套餐总额度及基于账单日推算的当期重置时间戳（`reset_at`），产出规范的月度流量 `ScriptObservation`。
- [ ] AC-003：当 Cookie 缺失、过期或被重定向至登录页时，连接器抛出带认证失效语义的错误，能被 `is_auth_error` 准确识别并接入既有重登管线。
- [ ] AC-004：支持可选参数 `RESET_DAY`；当页面未抓取到账单日文本时，以配置的每月重置日自动计算下一次刷新时间戳。
- [ ] AC-005：全量自动化测试（`pnpm test`）与类型检查通过，无既有逻辑回归。
- [ ] [deploy] AC-006：在真实桌面运行环境中，通过用户交互界面完成真实花云账号的网页登录与 Cloudflare 质询，成功捕获会话并在 OmniPanel 真实面板中完整呈现该账户的真实套餐名称、已用流量、总限额与刷新时间。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-006：需在真实桌面环境（经用户明确许可后启动 `pnpm start:test`）由用户进行交互式登录并由真实 Cloudflare 质询放行，无法在无网络、无外部凭据的纯 CI 单测环境中全自动运行；替代验证方式为在 task 执行期以黑盒方式实测走通一次全流程（弹窗登录 -> 质询放行 -> 会话入库 -> 发起抓取 -> 真实数据展示在面板），并将脱敏的观察指标与运行证据记入实施笔记与 `handoff.json`。

## 上下文区

- 来源：用户需求与调研报告 `docs/research/flowercloud_usage_and_api_research.md`（2026-09-27）。
- 架构复用点：
    - `src/main/core/session/session-manager.ts`：复用现有带 partition 隔离的 BrowserWindow 登录捕获、wildcard cookie 收集与后台 `hidden: true` 保活能力。
    - `src/renderer/components/forms/WebLoginForm.tsx` & `WebLoginSection.tsx`：复用 `auth.method === "web_login"` 表单交互与手动粘贴 fallback。
    - `src/shared/lib/auth-error.ts`：复用统一认证错误识别与告警分发机制。

### 有意不测

- 外部 Cloudflare 验证码算法与 WAF 内部实现：依赖真实 Chromium 浏览器环境的自然交互与质询放行，不测逆向绕盾。

### 测试策略

- 连接器集成测试：使用提取并脱敏的 WHMCS 客户区 HTML fixture 验证流量单位（MB/GB/TB）解析与重置时间计算。
- 错误路径单测：模拟返回登录页 HTML、401/403 响应，断言正确抛出会话过期异常。
- 元数据与表单测试：断言 provider registry 与 manifest 正确加载并在前端展示。
- **真机端到端全流程验证（Dogfooding）**：在真实环境下启动测试实例，调起窗口输入花云账号密码并过盾登录，验证 Cookie 自动捕获落盘，并在面板上渲染出真实的 FlowerCloud 卡片（流量数字、进度条、刷新时间与网页控制台核对一致）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无。

### 风险与回退

- 风险：若 FlowerCloud 客户区页面模板改版导致 DOM 结构变化，可能无法匹配用量文本；通过健壮的正则表达式与容错选择器处理，并在解析失败时记录详细 warn 日志。
- 回退：删除 `connectors/flowercloud/` 目录并恢复 provider 枚举修改，单 commit 回退。

### 依赖与约束

- 前置依赖：执行期黑盒全流程需要有效的花云账号在真实窗口中完成一次交互登录。
- 约束：会话 Cookie 属于用户敏感凭据，仅持久化于系统本地安全存储（Vault），严禁进入日志、测试用例或 git 提交。

### Finalization 时更新的 blueprint

- 无。
