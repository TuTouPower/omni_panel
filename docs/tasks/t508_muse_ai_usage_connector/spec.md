# Task spec

## 背景

Muse AI（Meta 智能体平台，`https://muse.ai/`）提供模型与智能体服务，网页端提供免费周期限额（每周限额及重置日）与额外使用额度（从不过期词元额度）。用户要求将 Muse AI 用量接入 OmniPanel，对标 `mimo`、`opencode_go` 与 `kimi_web`，采用 Web 会话登录（`session` / `web_login`）模式，支持网页登录捕获 Cookie、后台常驻保活与凭据失效时自动隐藏窗口重登。

## 契约区

### 范围

- 新增 `connectors/muse/`：
    - `manifest.json`：声明 `id: "muse"`, `provider: "muse"`, `capabilities: ["session"]`, `auth: { method: "web_login", secret_name: "SESSION_COOKIE", login_url: "https://muse.ai/" }`, `loginDomains: ["muse.ai", "auth.muse.ai"]`, `cookieNames: ["hatch_sess", "hatch_gw", "hatch_vml", "datr"]`。
    - `connector.ts`：以 POST 调用 Next.js Server Action（`fetchSubscriptionAction`），携带会话 Cookie 解析 RSC 响应流，输出周期限额（`muse:weekly`，百分比、重置时间）与额外额度（`muse:extra`）。
- 注册新 provider：
    - 扩展 `usageProviderSchema` 与 catalog 清单，添加账号界面提供 Muse AI 入口（渲染 WebLoginForm）。
    - 添加 Muse AI 品牌矢量图标并对齐亮暗主题规范。
- 会话保持与保活：接入现存 session 自动重登管线（t504 / t505），凭据失效抛出被 `is_auth_error` 识别的错误。
- 测试覆盖：编写 connector 解析单测（脱敏 RSC fixture，含成功解析与 401/403/Authentication required 失效场景）、catalog 注册测试；`pnpm test` 绿灯。

### 非范围

- 不做模拟表单账密提交的逆向登录（直接使用会话登录与持久化 Cookie 体系）。
- 不做 Muse 对话历史提取（仅作为用量与额度连接器）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：添加账号界面存在“Muse AI”入口，点击进入网页登录表单，并可触发基于 `https://muse.ai/` 的会话登录。
- [ ] AC-002：使用有效会话 Cookie 执行采集时，成功解析周期限额（`weekly` 窗口，百分比、重置时间戳）与额外额度，产出合法的 `ScriptObservation` 指标列表。
- [ ] AC-003：当 Cookie 缺失、过期或无效（服务端返回 `Authentication required` 或 401/403）时，连接器抛出可被 `is_auth_error` 识别的错误，触发后台自动重登。
- [ ] AC-004：系统已有全量自动化测试（`pnpm test` 及类型检查）通过，无回归破坏。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：用户需求（2026-09-25）；已通过真实浏览器与离线 HTTP 探针实测验证 `POST https://muse.ai/` 携带 `hatch_sess` 调用 Server Action（`fetchSubscriptionAction`）契约。

### 有意不测

- 外部服务端 Server Action hash 跨大版本变更的长期行为：不测，遵循项目既有外部页面解析类连接器惯例，靠错误可见性与告警兜底。

### 测试策略

- connector 单元/集成测试：基于抓取的脱敏 RSC 响应 fixture，验证成功提取数据及各字段映射。
- 错误路径单测：模拟无 Cookie、401、Authentication required 文本，断言抛出认证异常。
- UI/Catalog 测试：验证添加账号列表正确出现 Muse 及其图标与配置表单。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无。

### 风险与回退

- 风险：新 provider 需在多个 schema 和前端枚举中注册，若遗漏可能导致配置反序列化或展示缺失；通过 catalog 和 schema 测试把关。
- 回退：删除 `connectors/muse/` 目录并还原 provider 注册修改，单 commit 回退。

### 依赖与约束

- 前置依赖：无。
- 约束：会话凭据（`hatch_sess`）属 secret，仅存本地 vault，禁止落入 git 与测试 fixture。

### Finalization 时更新的 blueprint

- `docs/blueprint/decisions.md`：记录 Muse AI 采用 Next.js Server Action 的会话用量抓取决策。
