# OpenCode Go 登录与用量查看设计

日期：2026-06-27
状态：实施中

## 参考项目

本功能的参考项目固定为本地 vendor：`vendors/opencode-account-manager`，来源仓库：`https://github.com/heartmore/opencode-account-manager`。

关键参考文件：

- `vendors/opencode-account-manager/backend/src/services/cookie-manager.ts`：支持 JSON / EditThisCookie / Netscape / `k=v; k=v`，并保留 Cookie 的 `domain/path/httpOnly/secure/sameSite` 信息。
- `vendors/opencode-account-manager/backend/src/services/browser-pool.ts`：用 Playwright context 保存并读取 `opencode.ai` Cookie，不猜单一 Cookie 名。
- `vendors/opencode-account-manager/backend/src/services/registration-monitor.ts`：登录/注册成功的判断是 URL 进入 `/workspace/` 后读取整个 browser context cookies。
- `vendors/opencode-account-manager/backend/src/services/usage-checker.ts`：把账号 Cookie 数组拼成完整 Cookie header 后，按 `/auth -> /workspace/{id} -> /workspace/{id}/go -> /_server` 协议查询 rolling/weekly/monthly。

OmniUsage 不复制参考项目的账号工坊能力（邀请、注册监控、领奖、sub2api、独立账号库），但 OpenCode Go 的 Cookie 获取和 usage 协议必须按参考项目校准。

## 已知实现教训

2026-06-28 实测发现两处网页登录捕获缺陷：

1. 登录窗口和 Cookie 读取 session 曾使用不同 Electron partition，导致登录成功后读不到 Cookie。
2. 修复 partition 后仍失败，是因为实现只白名单 `session` / `__Host-session` / `__Secure-session`，但参考项目不这么猜名，而是读取 `opencode.ai` context 下的完整 Cookie；真实 OpenCode Cookie 可能叫 `session_token`、`auth` 等。

因此 OpenCode Go 网页登录应读取 `https://opencode.ai` 作用域下全部 Cookie，再拼成 `SESSION_COOKIE`。如果关闭窗口后没有匹配 Cookie，UI 必须明确提示“未捕获到 Cookie”，不能只让 IPC 返回 ok 或让按钮停在“登录中”。

## 目标

为 OmniUsage 添加 OpenCode Go 支持：

- 通过手动 Cookie 导入添加 OpenCode Go 账号。
- 通过网页登录窗口自动捕获 Cookie。
- 查询并展示每个账号的 rolling、weekly、monthly 用量。
- 复用现有概览、账号行、排序、隐藏、刷新、设置编辑能力。

## 明确不做

首版不实现以下参考项目能力：

- 链式邀请。
- 自动注册监控。
- 自动领奖。
- sub2api 同步。
- 独立 OpenCode Go 账号数据库。

这些能力属于账号工坊，不是 OmniUsage 当前用量监控主线。

## 用户确认的范围

- 方案：每个 OpenCode Go 账号 = 一个 OmniUsage connector 实例。
- 登录方式：手动 Cookie 导入 + 网页登录自动捕获。
- 手动 Cookie 格式：支持 JSON 数组、EditThisCookie、Netscape、`k=v; k=v`。
- 账号显示：手填账号名为主；可用 workspace id / 邮箱 / 用户名做默认或兜底。
- 用量展示：rolling、weekly、monthly 三个窗口；概览使用现有多账号聚合逻辑。

## 架构

新增一个内置 connector：`connectors/opencode_go/`。

```text
Settings/Add Account
  ├─ 手动 Cookie 文本
  └─ 网页登录窗口
        ↓
SESSION_COOKIE secret
        ↓
opencode-go connector
        ↓
Observation[]
        ↓
RuntimeStore / ObservationStore
        ↓
ProviderOverview / ProviderCard / AccountRow
```

### 为什么用 connector 实例模型

当前 OmniUsage 已经把账号抽象成 connector 实例：

- `ConnectorConfiguration.instanceId` 是账号实例 id。
- secret 存在 vault：`${instanceId}:SESSION_COOKIE`。
- 设置页 `create_plugin_instance` 已支持复制同 provider 模板创建多个实例。
- 概览页按 provider + accountId 聚合。

所以 OpenCode Go 不需要单独账号库。多账号就是多个 `opencode-go` connector 实例。

## Connector 定义

新增文件：

- `connectors/opencode_go/manifest.json`
- `connectors/opencode_go/connector.ts`

manifest：

- `id`: `opencode_go`
- `provider`: `opencode_go`
- `capabilities`: `["session"]`
- `parameters`:
    - `SESSION_COOKIE` secret，required，exposeToScript。
    - `ACCOUNT_LABEL` string，可选，默认空。用于 connector 内部生成 `account_label` 兜底；如果现有 ctx 不暴露实例名，靠这个参数保留显示名。
- `endpoints.default`: `https://opencode.ai`
- `endpoints.login`: `https://opencode.ai/auth`

命名固定：provider 使用 `opencode_go`，UI 显示为 `OpenCode Go`。实现时同步更新所有 schema、类型、UI 映射和测试。

## Cookie 导入

### 手动导入

在 `AddAccountDialog` 的 session 表单中，对 OpenCode Go 使用多格式 Cookie 文本解析。

支持格式：

1. JSON 数组：浏览器 DevTools / Cookie Editor 导出。
2. 单个 JSON 对象。
3. Netscape cookie 文件格式。
4. Cookie header 字符串：`name=value; name2=value2`。

Cookie 输入旁新增“复制脚本”按钮。点击后把一段浏览器控制台脚本写入系统剪贴板。用户在已登录的 `https://opencode.ai` 页面 DevTools Console 运行该脚本：

- 成功：脚本提示成功，并把 `document.cookie` 中可读取的 OpenCode Cookie header 写入用户剪贴板。用户可直接粘贴回 Cookie 输入框。
- 失败：脚本提示明确原因，如未在 `opencode.ai` 域名、未登录、无可读取 Cookie、剪贴板写入失败。
- 限制：浏览器脚本无法读取 `HttpOnly` Cookie。如果 OpenCode Go 必需 Cookie 是 `HttpOnly`，脚本应提示改用网页登录捕获或 DevTools/Application 导出。

解析后统一生成 Cookie header，并保存到 `SESSION_COOKIE` secret。

解析逻辑应放在共享小模块，避免塞进 React 组件：

- 建议文件：`src/shared/lib/cookie_parser.ts`
- 输入：raw string。
- 输出：`{ header: string; names: string[] }`。
- 错误：返回明确错误信息，如“无法识别 Cookie 格式”。

### 网页登录捕获

复用现有 `window.usageboard.session.login()`，不要继续扩展旧的 `auth.cookieLogin()` MiMo 专用通道。

需要改造点：

- `SettingsForm` 不应只在 `providerId === "mimo"` 时显示“网页登录”。
- 对 OpenCode Go 传入：
    - `instance_id`
    - `login_url`
    - `cookie_names`
- `cookie_names` 用 OpenCode Go 关键 Cookie 名称集合。关闭窗口时必须能从 Electron session cookies 拼出 `SESSION_COOKIE`。

当前 `SessionManager` 只在请求 URL 包含 `/api/v1/` 时捕获 Cookie header。OpenCode Go 使用 `/_server`、`/auth`、`/workspace/...`，所以首版必须调整为：

- 关闭窗口时读取 session cookies 并按 `cookie_names` 拼接。
- 对 OpenCode Go 不依赖 `/api/v1/` 捕获。
- 如需捕获请求 header，则支持匹配 `/_server`。

网页登录窗口使用 `persist:session-login`。这会让不同 session provider 共享登录 partition；如果出现串号风险，改为 `persist:session-login:${safeProviderId}` 或 `persist:session-login:${instanceId}`。首版推荐 provider 级 partition，兼顾复用和隔离。

## OpenCode Go 用量协议

参考项目的流程：

1. 带 Cookie 请求 `https://opencode.ai/auth`，读取 302 location 中的 `/workspace/{workspaceId}`。
2. 请求 workspace 和 go 页面：
    - `/workspace/{workspaceId}`
    - `/workspace/{workspaceId}/go`
3. 从 HTML 里提取 `/_build/assets/*.js`。
4. 下载 JS bundle。
5. 从 bundle 中找到 `createServerReference("<64 hex>")` 与 `lite.subscription.get` 的绑定。
6. 请求：

```text
GET /_server?id=<hash>&args=<encoded args>
```

args：

```json
{
    "t": {
        "t": 9,
        "i": 0,
        "l": 1,
        "a": [{ "t": 1, "s": "<workspaceId>" }],
        "o": 0
    },
    "f": 31,
    "m": []
}
```

7. 解析返回文本中的：
    - `rollingUsage`
    - `weeklyUsage`
    - `monthlyUsage`

每个窗口包含：

- `usagePercent`
- `resetInSec`
- `status`

## Observation 映射

OpenCode Go 返回百分比。OmniUsage observation 使用：

- `display_style`: `percent`
- `used`: `usagePercent`
- `limit`: `100`
- `reset_at`: `Date.now() + resetInSec * 1000`
- `source`: `session`
- `stale`: `false`

三个 observation：

| raw_label | normalized_label  | window   |
| --------- | ----------------- | -------- |
| `rolling` | `滚动` 或 `5小时` | `second` |
| `weekly`  | `一周`            | `day`    |
| `monthly` | `一月`            | `month`  |

当前 `ObservationWindow` 只允许 `second | day | month | total`。首版不扩展 schema，避免牵动全局语义；UI 依赖 `raw_label`/`normalized_label` 展示真实窗口。后续若更多 provider 有周窗口，再统一扩展 schema。

## UI

### 添加账号

在“添加账号”常用服务中加入 `OpenCode Go`。

认证方式：session。

表单：

- 账号名称。
- Cookie 文本框。
- 提示支持多格式 Cookie。
- “网页登录”按钮。

保存时：

- 如果填了 Cookie：解析并保存 `SESSION_COOKIE`。
- 如果没填 Cookie：不允许保存，提示“请粘贴 Cookie 或先网页登录”。

### 设置页

OpenCode Go connector 的设置页显示：

- 登录 Cookie secret。
- 网页登录按钮。
- 刷新间隔。
- label map。
- duplicate 入口（现有复制能力）。

### 概览页

不新增专用页面。

现有 provider 概览显示：

- Provider: OpenCode Go。
- 多账号：每个 connector 实例一个账号行。
- 每个账号行：rolling / weekly / monthly 三条用量。
- Provider 总览：沿用现有多账号平均/收敛逻辑。

如果账号名无法从 OpenCode Go 自动识别，使用 connector 实例名。

## 错误处理

Connector 错误应明确可操作：

- 缺少 Cookie：`Missing required secret: SESSION_COOKIE` 或中文 UI 兜底。
- Cookie 失效：`Cookie 可能已失效，未跳转到 workspace`。
- workspace id 解析失败：提示重新网页登录。
- JS bundle 提取失败：`无法从 OpenCode Go 页面提取 JS bundle`。
- server function hash 提取失败：`OpenCode Go 页面协议可能已变更`。
- usage 响应解析失败：保留原始响应前 200 字符到 debug log，不显示完整 Cookie 或敏感数据。
- 网络超时：使用 connector 默认 timeout；必要时给 OpenCode Go connector 内部请求设置更长 timeout。

日志禁止输出 Cookie header。

## 安全与隐私

- Cookie 只进 vault，不写 config 明文。
- config export 不导出真实 secret。
- 日志中不得包含 Cookie、完整响应里可能的个人数据。
- 手动 Cookie parser 只做本地解析，不发外网。
- 网页登录窗口只允许 `https://opencode.ai`。

## 测试

### 单元测试

新增或修改：

- Cookie parser：
    - JSON 数组。
    - 单 JSON 对象。
    - Netscape。
    - `k=v; k=v`。
    - 无法识别格式。
- OpenCode Go connector：
    - 从 `/auth` 302 location 提取 workspace id。
    - 从 HTML 提取 JS bundle URL。
    - 从 bundle 提取 `lite.subscription.get` hash。
    - 从 server response 解析 rolling/weekly/monthly。
    - Cookie 失效时失败。
    - 协议变更时失败信息明确。
- Schema/UI 映射：
    - `UsageProvider` 包含 OpenCode Go。
    - `PROVIDER_ORDER` / `PROVIDER_LABELS` 包含 OpenCode Go。
    - `ADD_COMMON_SERVICES` 包含 OpenCode Go。
- Session login：
    - OpenCode Go 不依赖 `/api/v1/` 才能保存 Cookie。
    - 按 provider/instance 隔离 partition（如果实现）。

### 集成/行为测试

- 添加 OpenCode Go 账号时，Cookie secret 能保存到 vault。
- 刷新 connector 后产生 3 个 observations。
- 多个 OpenCode Go 实例显示为多个账号。
- 概览 provider 平均/收敛逻辑不被破坏。

### 手工验证

按项目要求，涉及 UI 必须手工点击：

1. 打开设置。
2. 添加 OpenCode Go。
3. 粘贴 Cookie 保存。
4. 手动刷新。
5. 概览看到 rolling/weekly/monthly。
6. 再添加第二个账号，确认多账号显示。
7. 点击网页登录，登录后保存 Cookie，再刷新。

完成前必须跑：

```bash
pnpm test
```

若涉及打包产物行为，还要按 `CLAUDE.md` 运行 package smoke。

## 文档更新

实现时同步更新：

- `CLAUDE.md` 如新增关键限制或测试要求。
- `docs/TEST.md` 如新增 OpenCode Go 手工验证步骤。
- 现有 provider / direct integration 文档（如果存在）。
- 本 spec 如实现中改变范围。

## 实施顺序建议

1. Cookie parser + 测试。
2. Provider/schema/UI 注册 + 测试。
3. OpenCode Go connector parser + mocked HTTP 测试。
4. connector manifest + runtime 刷新测试。
5. Settings/AddAccount 手动 Cookie 导入。
6. Session login 通用化，支持 OpenCode Go 网页登录。
7. UI 手工验证。
8. `pnpm test`。

## 风险

- UI 手工点击和真实 OpenCode Go 账号验证仍需手动执行。
- OpenCode Go 页面协议依赖 SolidJS server function hash，网站更新会破坏解析。
- 当前 observation window schema 没有 `week`，首版如果用最小映射，内部语义不完美。
- 当前 session login 捕获逻辑偏 MiMo，需要通用化；否则 OpenCode Go 网页登录保存不了 Cookie。
- 自动识别邮箱/用户名不稳定，所以首版以手填账号名为准。
