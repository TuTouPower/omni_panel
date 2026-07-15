<!-- omni_powers: blueprint/conventions -->

# OmniUsage 编码约定

编码规范的唯一真相源。技术栈/目录见 `architecture.md`；业务不变量见 `domain.md`；测试见 `test.md`。

## 1. 命名

- 变量、函数、文件名、目录名一律 **`snake_case`**。例外：大写文件名（`CLAUDE.md`/`README.md`）保持原样。
- React 组件文件与组件名用 **`PascalCase`**（`CpaCard.tsx`、`SettingsView.tsx`）——沿用现有渲染层风格。
- 类型/接口用 `PascalCase`（`ConnectorConfiguration`、`Observation`）。
- 常量用 `UPPER_SNAKE_CASE`（`DEFAULT_TIMEOUT_MS`、`MAX_HEIGHT_RATIO`）。
- 术语中英一律以 `domain.md` §5 为准，落后词先改表再改代码。

## 2. 风格

- 缩进 **4 空格**，禁止 tab（prettier 强制）。
- 严格 TypeScript；共享类型放 `src/shared/`，主/渲染各自不重复定义。
- 不可变优先：runtime-store `getAll` 返回拷贝；observation/config 经 Zod 校验后视为只读 DTO。
- 精准修改：只动必须动的，删除因自己修改而变无用的 import/变量，不动既有死代码。

## 3. 日志

- **禁止 `print`/`console.log` 调试输出**，一律走 `src/shared/lib/logger.ts` 模块化 logger（scheduler / runtime / connector-sandbox / vault / session / local-api / ipc）。
- 日志 7 天滚动；scrubber 强制内联在写入路径，**开发期同样脱敏**，secret 一律记为 `***`。
- renderer 日志经 `LOG_RENDERER` IPC 转发主进程，preload 侧限流（100 条/秒），meta 仅 dev 保留。

## 4. 浏览器/网络 API 约定

- **连接器出网走宿主 NetClient（undici）**，不在连接器/渲染层直接 `fetch`。代理、endpoint override、超时、SSRF 防护统一在此生效。
- 主进程 OAuth 管理器可直接使用 undici + `ProxyAgent` 处理 device-code 与 token refresh；仍须从当前配置读取代理，且不得向渲染层暴露网络能力。
- 连接器脚本沙箱内无 `fetch/require/fs/process/timer`，只能用注入的 `ctx.http` / `ctx.files` / `ctx.params` / `ctx.log`。
- 渲染进程无 `fs/child_process/ipcRenderer` 直连，只调 `window.usageboard.*` 白名单。

## 5. 写一个新连接器（适配器步骤）

1. 建 `connectors/{id}/manifest.json`，按 `src/shared/schemas/manifest.ts` 的 `manifest_schema`（`.strict()`）填：`id` / `provider`（必须在 `connectorProviderSchema` 白名单）/ `capabilities` / `parameters` / `endpoints` / 能力配置（`poll`/`local`/`session`/`observe`）。
    - secret 参数若脚本要读明文，设 `exposeToScript:true`（默认 false）。
    - 需强制用户显式配 endpoint（如 CPA 本地 Manager）设 `requireExplicitEndpoints:true`。
2. 写 `connectors/{id}/connector.ts`：
    - `declare const ctx: ConnectorContext;`（契约见 `src/main/core/connector/host-io.ts`）。
    - 入口 `function main(): ScriptObservation[]`（可 `async`）。**禁止 `import`/`export` 语句**（运行时正则拦截）。
    - 用 `ctx.http.get_json/post_json/get_raw(endpoint_key, path, opts?)`、`ctx.files.read/list(pathPattern)`、`ctx.params[name]`、`ctx.log.*`。
3. 返回 `ScriptObservation[]`（snake_case 字段，见 `src/shared/schemas/observation.ts`）。**不要设 `source_instance_id`**——宿主盖章。
4. `account_id` 用服务商返回的稳定标识（邮箱/UUID/workspace id），**绝不用实例+序号**（`domain.md` 不变量 3）。
5. 新 provider 需同步：`usageProviderSchema` 枚举、`src/renderer/lib/provider-usage.ts` 的 `PROVIDER_ORDER` + `PROVIDER_LABELS`、logo 资源。
6. 补测试（见 `test.md`）。

> 阈值约定：percent 型（used 是百分比）用 90 critical / 75 warning；ratio 型（used/limit）用 0.9 / 0.75；余额型（越低越危险，如 DeepSeek）反向。

### 5.1 Grok 连接器：OAuth device-code 授权

Grok（SuperGrok）连接器与本仓库其他连接器的 cookie/API-key 授权不同，采用 **OAuth 2.0 device-code flow**（RFC 8628），与 grok CLI 的 `~/.grok/auth.json` **完全独立**——本应用持有自己的 token pair，互不干扰。

**关键组件：**

- `connectors/grok/manifest.json`：script 模式连接器，`poll.request.auth.secret = "OAUTH_TOKEN"`，由宿主 `apply_request_auth` 自动注入 bearer token 到 billing 请求。
- `connectors/grok/connector.ts`：解析 `GET /v1/billing?format=credits`，返回 `creditUsagePercent`（总量）+ `productUsage[]`（分产品），window = `"week"`，display_style = `"percent"`。
- `src/main/core/auth/grok_oauth_manager.ts`：OAuth 管理器，职责：
    - `start_device_login()`：向 `https://auth.x.ai/oauth2/device/code` 发 form-urlencoded POST，返回 `{ device_code, user_code, verification_uri, ... }`。
    - `await_completion()`：轮询 `https://auth.x.ai/oauth2/token`，处理 `authorization_pending` / `slow_down`（+5s 惩罚）/ `expired_token` / `access_denied`。
    - `refresh_now()`：用 `refresh_token` 刷新；**refresh token rotation**——新 refresh_token 存入 vault，旧作废。终端错误（`invalid_grant` 等）清除 token 强制重登。
    - token 写入、rotation、logout 按 `instance_id` 串行，防止交错 mutation 恢复已退出 token。
    - `start_auto_refresh()`：按 `expires_at - 5min` 设置一次性 timer；成功刷新按新 expiry 重排，超长 delay 分段重算，临时失败延迟重试。`reconcile_auto_refresh()` 维护启用实例真相。
- `src/main/ipc/grok_auth_ipc.ts`：5 个 IPC handler（login start / login poll / login status / logout / refresh）。
- `src/renderer/components/GrokLoginSection.tsx`：设置页内的 device-code 授权 UI——展示 user_code + verification_uri，轮询完成后显示状态。

**Vault 存储（per instance_id）：** `OAUTH_TOKEN` / `OAUTH_REFRESH_TOKEN` / `OAUTH_EXPIRES_AT`。

**代理支持：** 用户配置代理优先于系统探测代理；探测值仅参与运行时 effective proxy，不写入 `AppConfiguration`。OAuth 管理器每次请求读取最新 effective proxy，所有 OAuth HTTP 请求走 undici `ProxyAgent`。

**Endpoint 安全：** Grok billing bearer 请求固定使用 manifest 中 `grok_billing` endpoint；实例 `endpointOverrides.grok_billing` 在进入 NetClient 前删除，避免 token 发往自定义主机。

**OAuth 常量（公开，非 secret）：** `GROK_CLIENT_ID`、`GROK_DEVICE_AUTH_URL`、`GROK_TOKEN_URL`、`GROK_SCOPE` 定义在 `grok_oauth_manager.ts`，来自 xAI OIDC discovery 文档与 grok CLI Rust 源码。

## 6. 提交 & 质量门

- Commit message 走行业规范：`feat/fix/refactor/docs/test/chore(scope): 描述`，不受极简模式影响。
- 一次 commit 一个连贯改动，不混入无关变更。
- 合并前跑 `pnpm check`（typecheck + lint + format:check + deadcode + arch）与 `pnpm test`。
- 改代码后检查 `docs/` 与 `CLAUDE.md` 是否受影响，一并更新。
