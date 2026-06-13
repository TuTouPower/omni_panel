# Brave Search API 用量统计方案讨论

## 1. 项目背景

OmniUsage 是一个桌面端 AI 服务用量监控工具，技术栈是 Electron、React、TypeScript。

它的目标是把多个 AI 服务的用量和额度集中显示在一个应用里，用户不用分别打开每个服务商的网页控制台查看。当前项目已经支持 Claude、OpenAI Codex、Gemini、Antigravity、Kimi、智谱 GLM、MiniMax、DeepSeek、Tavily、MiMo 等来源。

应用大体分三层：

- 主进程：负责配置、密钥、缓存、调度、插件运行。
- 渲染进程：负责设置页、主面板、托盘弹窗等 UI。
- 插件系统：每个服务商一个 TypeScript 插件，插件查询该服务商的用量数据，然后输出统一格式，主进程再把结果展示到 UI。

现有插件的设计目标是“查询用量”，不是“代理业务请求”。例如 Tavily 插件会调用 Tavily 的 `/usage` 接口获取月度用量，然后把结果转成 OmniUsage 的统一用量项。

## 2. 当前 MiMo 方案：登录后持久化获取用量

MiMo 是当前项目里最接近 Brave 讨论场景的例子，因为它不是单纯输入 API key 后调用公开 usage endpoint，而是需要先让用户完成网页登录，再复用登录态持续获取用量。

当前 MiMo 链路如下：

```text
用户点击 MiMo「网页登录」
-> 主进程打开 Electron BrowserWindow
-> 使用固定持久化分区 persist:mimo-login
-> 用户在 MiMo / 小米账号页面完成登录
-> MiMo 页面发起 /api/v1/* 请求
-> 主进程通过 webRequest.onBeforeSendHeaders 捕获浏览器真实 Cookie 请求头
-> 用户关闭登录窗口
-> 主进程把 Cookie 写入 SecretsStore
-> 后续 MiMo 插件定时运行，读取 SESSION_COOKIE 调 MiMo API 获取用量
```

这个方案的关键点：

- 登录窗口不是插件自己开的，而是宿主主进程开的。
- 浏览器会话使用 `persist:mimo-login`，登录态会持久化到磁盘，重启后仍可复用。
- 主进程优先捕获浏览器实际发送到 `/api/v1/*` 的完整 `Cookie` 请求头，而不是只从 cookie jar 猜测拼接。
- 捕获到的 Cookie 作为 `SESSION_COOKIE` secret 保存到对应插件实例。
- MiMo 插件仍然是一次性执行模型：运行时读取 `SESSION_COOKIE`，调用 `/api/v1/tokenPlan/usage`、`/api/v1/tokenPlan/detail`、`/api/v1/balance`，输出统一用量 JSON，然后退出。
- 后台 `cookie-refresh-service` 会从同一个持久化分区读取 MiMo cookie，并定期写回所有 MiMo 实例的 `SESSION_COOKIE`，减少用户反复登录。

MiMo 说明了当前架构的一个重要边界：需要浏览器登录、cookie 持久化、刷新登录态时，宿主可以提供受控能力；但插件本身没有变成常驻进程，也没有自己管理 BrowserWindow 或本地服务。

这对 Brave Search 的启发是：如果要新增本地代理，也应该由宿主管理生命周期和安全边界，插件只读取宿主暴露的统计结果。这样符合现有架构，而不是把插件改造成任意常驻服务。

## 3. Brave Search API 的特殊问题

Brave Search API 目前公开文档里能看到的用量信息主要来自两处：

1. Dashboard 网页：登录后可以看 usage、remaining credits、billing 等信息。
2. API 响应头：每次调用 Brave Search API 后，响应里会带 rate limit / quota 相关 header。

关键响应头包括：

- `X-RateLimit-Limit`：当前计划的限制，例如每秒请求数、月度请求数。
- `X-RateLimit-Remaining`：当前窗口还剩多少请求额度。
- `X-RateLimit-Reset`：当前窗口多久后重置。
- `X-RateLimit-Policy`：限制窗口的策略，例如 1 秒窗口和月度窗口。

公开资料里没有看到一个稳定的、官方的“用 API key 查询完整用量/账单”的独立 usage endpoint。也就是说，OmniUsage 不能像 Tavily 那样简单写一个 Brave 插件去请求 `/usage`。

这带来一个核心矛盾：

- 用户想在 OmniUsage 里看到 Brave Search API 的用量。
- Brave Search 的用量数据又主要出现在“每次真实搜索请求的响应头”里。
- 如果 OmniUsage 自己为了读取 header 去额外发一次搜索请求，会消耗用户额度，而且只能拿到当时剩余额度，不是完整账单明细。

因此，Brave Search 的统计方式更适合“记录真实调用过程中返回的 header”，而不是“单独查询一个 usage API”。

## 4. 现有插件架构的限制

当前 OmniUsage 插件是一次性执行模型：

1. 主进程按计划启动插件子进程。
2. 插件读取参数，例如 API key、endpoint、语言设置。
3. 插件发起一次或几次 HTTP 请求。
4. 插件把统一 JSON 写到 stdout。
5. 插件进程退出。

这个模型适合 Tavily、DeepSeek、GLM 这类“有可查询用量接口”的服务商。

但它不适合 Brave Search 的代理统计需求，因为 Brave 方案需要一个长期运行的本地 HTTP 服务：

- 外部代码调用本地服务。
- 本地服务转发请求到 Brave Search API。
- 本地服务在每次响应后读取 `X-RateLimit-*` header。
- 本地服务保存最新统计。
- OmniUsage 再读取本地保存的统计并展示。

如果让普通插件自己常驻，会破坏现有插件模型：

- 插件不再是“跑一次就退出”。
- 主进程很难统一管理它的启动、停止、端口、崩溃恢复。
- 打包后路径、权限、日志、进程退出都会更复杂。
- 第三方插件如果能任意开启本地服务，安全边界会变差。

所以问题不是“加一个 Brave 插件”这么简单，而是要决定 OmniUsage 是否要支持一种受控的本地服务能力。

## 5. 可选方案

### 方案 A：只做回调上报

外部代码仍然直接调用 Brave Search API。调用完成后，外部代码把响应头里的用量信息 POST 给 OmniUsage 本地接口。

流程：

```text
外部代码 -> Brave Search API
外部代码 -> OmniUsage 本地接口：上报 X-RateLimit-* header
OmniUsage 插件 -> 读取已上报统计
```

优点：

- 实现较小。
- 不需要代理 Brave 请求。
- 不改变用户原有 Brave 调用链路。

缺点：

- 普通用户容易漏接入。
- 每个调用方都要记得“调用后上报”。
- 如果某些调用失败、异常退出、忘记上报，统计就不可靠。
- 面向普通用户时，心智负担较重。

适合场景：内部工具、开发者自己可控的代码、短期验证。

### 方案 B：本地代理服务

用户代码不再直接调用 Brave Search API，而是调用 OmniUsage 提供的本地代理服务。本地服务再转发到 Brave Search API，并自动记录响应头。

流程：

```text
外部代码 -> OmniUsage 本地代理
OmniUsage 本地代理 -> Brave Search API
Brave Search API -> OmniUsage 本地代理：返回结果和 X-RateLimit-* header
OmniUsage 本地代理 -> 外部代码：返回 Brave 原始响应
OmniUsage 插件 -> 读取本地代理保存的统计
```

优点：

- 不容易漏统计。
- 用户只要把 Brave API endpoint 换成本地 endpoint。
- 统计逻辑集中在 OmniUsage 内部。
- 可以统一处理用量缓存、reset 时间、错误状态、日志。
- 更适合开放给普通用户。

缺点：

- 需要新增本地 HTTP 服务。
- 需要处理端口、鉴权 token、生命周期、健康检查。
- 用户调用路径要改成走本地代理。
- 如果代理服务没启动，用户代码会请求失败。

适合场景：面向普通用户、需要长期可靠统计、希望减少接入错误。

### 方案 C：插件定时主动探测

OmniUsage 插件定时用用户 API key 发一个很小的 Brave Search 请求，例如 `q=test&count=1`，然后读取响应头推算剩余额度。

流程：

```text
OmniUsage Brave 插件 -> Brave Search API
Brave Search API -> 返回 X-RateLimit-* header
OmniUsage -> 展示推算后的额度
```

优点：

- 实现最接近现有插件模型。
- 不需要新增本地服务。
- 用户不用改外部调用代码。

缺点：

- 每次探测都会消耗 Brave Search API 请求额度。
- 只能看到“探测当下”的剩余额度。
- 无法区分是谁消耗了额度。
- 不适合作为精确统计方案。

适合场景：临时兜底、用户接受额外消耗、只需要粗略剩余额度。

## 6. 推荐方向

推荐方案 B：本地代理服务。

原因是这个能力准备开放给普通用户，而普通用户场景下，统计链路必须尽量自动化。方案 A 要求用户在每次调用后主动上报，容易漏。方案 C 会消耗额度，且统计不够可靠。

但不建议让插件拥有任意常驻服务能力。更好的边界是：

- 插件声明自己需要一个本地代理能力。
- 宿主主进程负责真正启动和管理本地服务。
- 插件仍然保持一次性执行，只负责读取本地服务的统计并输出 OmniUsage 统一格式。

也就是说，不是“Brave 插件自己变成一个 server”，而是“OmniUsage 宿主支持受控 local service，Brave 插件读取这个 service 的统计”。

## 7. 建议架构

### 7.1 宿主新增 Local Service Manager

主进程新增一个本地服务管理模块，职责包括：

- 监听 `127.0.0.1`，不默认暴露到局域网。
- 分配或读取固定端口。
- 生成本地访问 token。
- 启动、停止、重启服务。
- 提供健康检查。
- 管理服务日志。
- 在应用退出时关闭服务。

本地服务必须由宿主执行，而不是插件任意启动。

### 7.2 Brave Local Proxy

Brave 本地代理提供面向用户代码的 HTTP API。

建议最小接口：

```text
GET /v1/brave/search
```

行为：

1. 接收外部代码传来的 Brave Search 查询参数。
2. 带上用户配置的 Brave API key，转发到 Brave Search API。
3. 返回 Brave 原始响应 body 和关键响应 header。
4. 读取并保存 `X-RateLimit-*` header。
5. 更新本地统计快照。

后续如果要覆盖更多 Brave endpoint，可以扩展：

```text
GET /v1/brave/images/search
GET /v1/brave/news/search
GET /v1/brave/videos/search
```

第一阶段不建议一次性覆盖所有 endpoint，先做 Web Search 主路径。

### 7.3 统计读取接口

本地代理提供给 OmniUsage 插件读取的统计接口：

```text
GET /v1/usage
```

返回建议结构：

```json
{
    "provider": "brave_search",
    "updatedAt": "2026-06-13T00:00:00.000Z",
    "limits": [
        {
            "window": "second",
            "limit": 1,
            "remaining": 1,
            "resetSeconds": 1
        },
        {
            "window": "month",
            "limit": 15000,
            "remaining": 14523,
            "resetSeconds": 1234567
        }
    ]
}
```

OmniUsage Brave 插件读取这个接口后，转换为统一的插件输出：

- `used = limit - remaining`
- `limit = limit`
- `resetAt = updatedAt + resetSeconds`
- `displayStyle = ratio`

### 7.4 配置项

用户侧至少需要：

- Brave Search API key。
- 是否启用本地代理。
- 本地监听端口，默认可自动分配或使用固定值。
- 本地访问 token，默认自动生成。

普通用户视角应该尽量简单：

1. 在 OmniUsage 设置页填 Brave API key。
2. 打开 Brave Search 本地代理。
3. 复制本地 endpoint。
4. 在自己的代码里把 Brave API base URL 改成本地 endpoint。

## 8. 安全边界

本地代理必须默认只监听 `127.0.0.1`。

原因：

- Brave API key 是用户密钥。
- 如果监听 `0.0.0.0`，局域网其他设备可能调用这个代理。
- 如果没有 token，其他本机进程也能滥用用户额度。

建议规则：

- 默认只监听 `127.0.0.1`。
- 所有本地 API 要求 `Authorization: Bearer <local_token>`。
- 本地 token 由 OmniUsage 生成并保存在本机安全存储或配置中。
- 日志不能输出 Brave API key。
- 错误消息不能包含 Brave API key。
- 代理不要支持任意上游 URL，避免变成通用开放代理。
- 第一阶段只允许转发到 Brave Search API 固定域名。

## 9. 对插件系统的影响

这个方案需要扩展架构，但不应该把所有插件都变成常驻进程。

建议新增的是“宿主管理的本地服务能力”，而不是“插件常驻能力”。

插件 metadata 未来可以声明类似能力：

```json
{
    "localServices": [
        {
            "kind": "brave_search_proxy",
            "required": true
        }
    ]
}
```

但第一阶段也可以先不做通用 metadata，只为 Brave 做一个宿主内置 local service。等第二个服务商也需要类似能力时，再抽象通用 local service 注册机制。

推荐分阶段：

1. 第一阶段：实现 Brave 专用本地代理，验证产品价值。
2. 第二阶段：如果 Tavily、OpenAI 或其他服务也需要代理统计，再抽象插件声明式 local service。

这样可以避免过早设计一个复杂插件服务框架。

## 10. 最小可行范围

第一版建议只做这些：

- Brave Search Web Search 代理。
- 本地只监听 `127.0.0.1`。
- 本地 token 鉴权。
- 记录最近一次成功响应的 `X-RateLimit-*` header。
- OmniUsage Brave 插件读取 `/v1/usage` 并展示月度额度。
- UI 设置页能展示本地代理 endpoint 和 token。
- 用户可复制 endpoint，用于自己的代码。

第一版暂不做：

- 完整账单金额。
- Stripe billing 数据。
- 多 API key 聚合。
- 局域网共享代理。
- 通用开放代理。
- 所有 Brave endpoint 的完整覆盖。
- 历史趋势图。

这些可以后续基于真实使用反馈再扩展。

## 11. 需要讨论的开放问题

1. 本地代理端口是固定还是自动分配？
2. 本地 token 是否展示给用户复制，还是只用于 OmniUsage 内部？
3. 用户代码是否希望完全兼容 Brave 原始 API 路径？
4. 第一版是否只支持 Web Search？
5. Brave API key 是由 OmniUsage 保存，还是由用户调用本地代理时传入？
6. 如果 OmniUsage 没启动，用户代码是否接受请求失败？
7. 是否需要提供一个兼容 OpenAI SDK / LangChain 工具链的 adapter 示例？

## 12. 当前判断

Brave Search API 用量统计不是普通“新增插件”问题，而是一个“真实调用链路统计”问题。

MiMo 当前方案可以作为架构参考：宿主负责网页登录、持久化 session、cookie 捕获和刷新；插件仍然只做一次性用量查询。Brave 也应保持类似边界：宿主负责本地代理服务的生命周期、安全和统计缓存；Brave 插件只读取统计结果并输出统一用量 JSON。

为了面向普通用户，推荐走本地代理服务方案。这样既能保持现有插件架构稳定，又能可靠记录 Brave Search 的真实用量。
