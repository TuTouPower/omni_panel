# Task spec

## 背景

OpenCode 官方已全面升级至全新的 OpenCode Console（`/console/`）单页应用架构，彻底废弃了旧版的 `/workspace/{id}` SSR 页面体系（旧路由现已 404）：

1. **认证凭据与探测变更**：官方核心 Session Cookie 变更为 `__Host-console_session`。主进程 `verify_cookie` 和 `is_valid_opencode_login` 写死了旧版的 `/auth` 必须重定向至 `/workspace/`，导致用户在登录窗口成功登录后，新 Cookie 被判定为无效而被丢弃，无法落库。
2. **连接器旧采集逻辑失效**：`connectors/opencode_go/connector.ts` 依然依赖抓取 `/workspace/{id}/go` 的 HTML 和 `$R[...]` 正则解析，甚至依赖旧版 server-fn fallback。由于旧版路由已 404，导致采集固定抛错失败。
3. **官方 REST API 稳定可用**：已通过前端 bundle 逆向与实测验证，OpenCode 官方已开放完整的 Console REST API（如 `GET /console/api/orgs`、`GET /console/api/usage/summary`、`GET /console/api/billing/status`），能够直接获取精准的用量、配额和余额数据。

## 契约区

### 范围

- **更新 Manifest 与登录配置**：
    - `connectors/opencode_go/manifest.json`：`login_url` 更新为 `https://opencode.ai/console/login`，`cookieNames` 声明为 `["__Host-console_session", "auth"]`，`endpoints` 增加 `console: "https://opencode.ai/console"`；
    - 维持 `loginDomains` 为 `["opencode.ai"]`。
- **重构登录探测（`verify_cookie` & `is_valid_opencode_login`）**：
    - 修改 `src/main/core/session/session-manager.ts` 和 `src/main/index.ts` 中的 OpenCode 登录有效性验证逻辑：
        改为请求 `https://opencode.ai/console/api/orgs`（带上捕获的 Cookie），HTTP 200 且返回组织数组即视为登录有效；或者在携带 Cookie 请求 `/auth` 时识别重定向至 `/console/` 或 `/console/login` 为有效；
    - 确保用户在登录窗口登录完成后，`__Host-console_session` 能够顺利通过验证并保存到 Vault。
- **重构连接器（`connectors/opencode_go/connector.ts`）全面对接 REST API**：
    - 彻底移除旧版 HTML 正则爬虫、SSR `$R[...]` 解析及 `server_fn_fallback` 废弃逻辑；
    - 标准 REST 流程：
        1. 从 Vault 获取 `SESSION_COOKIE`；
        2. 请求 `GET /console/api/orgs` 获取用户所属的 `orgId`（如 `wrk_...`）；
        3. 携带 `x-org-id: orgId` 请求 `GET /console/api/usage/summary?range=30d`（以及 24h / 7d），获取精准请求数、Tokens 与费用；
        4. 携带 `x-org-id: orgId` 请求 `GET /console/api/billing/status`，获取余额与账户模式；
        5. 产出规范的 `ScriptObservation` 观测项。
- **测试套件同步**：
    - 补齐/更新 `connectors/opencode_go` 的集成测试，用新接口契约替代旧 HTML fixture；
    - 更新 `session-manager.test.ts` 中针对 `is_valid_opencode_login` 的单测。

### 非范围

- 不修改其他服务商（Kimi, MiMo 等）的连接器与探测逻辑。
- 不修改代理面板（TokenStats）对本地 opencode.db 会话日志的扫描。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`connectors/opencode_go/manifest.json` 声明 `login_url` 为 `https://opencode.ai/console/login`，`cookieNames` 包含 `__Host-console_session`。
- [ ] AC-002：`verify_cookie` 能够正确验证 `__Host-console_session` Cookie 的有效性，用户在 Web 登录窗口登录完成后，Cookie 顺利通过验证并持久化写入 Vault，不再报 `Captured cookie failed validation`。
- [ ] AC-003：`connectors/opencode_go/connector.ts` 彻底废弃旧版 HTML 正则与 server-fn，改为调用 `/console/api/orgs` 获取 `orgId`。
- [ ] AC-004：连接器携带 `x-org-id` 请求 `/console/api/usage/summary` 与 `/console/api/billing/status`，正确产出用量与余额相关的 `ScriptObservation`。
- [ ] AC-005：当 Cookie 失效（接口返回 401 Unauthorized）时，连接器规范抛出 `Cookie 可能已失效，未跳转到 workspace` 或 `OpenCode 会话已失效，请重新登录`，触发保活重登管线。
- [ ] AC-006：更新自动化测试套件，覆盖新 REST API 响应映射、组织提取、余额解析及失效抛错分支。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试。

## 上下文区

- 来源：用户实测问题（OpenCode 官方改版为 `/console/` 导致原 `/workspace/` 体系失效，登录成功 Cookie 被判定无效抛弃）。
- 逆向与实测结论（2026-09-20 验证）：
    - 认证凭据：`__Host-console_session` Cookie
    - 组织端点：`GET https://opencode.ai/console/api/orgs` 返回 `[{"id":"wrk_...","name":"..."}]`
    - 用量端点：`GET https://opencode.ai/console/api/usage/summary?range=24h|7d|30d`（需 header `x-org-id: wrk_...`）
    - 余额端点：`GET https://opencode.ai/console/api/billing/status`（需 header `x-org-id: wrk_...`）
- 既有设施：
    - `connectors/opencode_go/manifest.json`
    - `connectors/opencode_go/connector.ts`
    - `src/main/core/session/session-manager.ts`（`is_valid_opencode_login`）
    - `src/main/index.ts`（`verify_cookie`）
- 相关历史 task：t115（OpenCode HTML 解析）、t337（OpenCode 登录验证）、t363（OpenCode server-fn fallback）、t504（Web 会话保活统一）。

### 有意不测

- 外部真实人机交互登录过程（密码输入/第三方 OAuth 授权）：用 mock 响应与 Cookie 覆盖。

### 测试策略

- 单元测试：更新 `tests/unit/session/session-manager.test.ts` 覆盖新版 `is_valid_opencode_login`。
- 集成测试：编写或更新 `tests/integration/connector/opencode_go_connector.test.ts`，基于真实抓包数据覆盖 `/console/api/orgs`、`/console/api/usage/summary`、`/console/api/billing/status` 的映射解析与 401 失效分支。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：若用户存在多个 organization，默认取首个 personal/default 组织；需确保单账号单组织与多组织容错。
- 回退：保留基础参数结构，若遇异常安全降级并抛出可读错误。

### 依赖与约束

- 无外部新增依赖。

### Finalization 时更新的 blueprint

- 无
