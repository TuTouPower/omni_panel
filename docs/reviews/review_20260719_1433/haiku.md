# OmniUsage `src/main/` 全量审阅报告 — haiku 路

## 当前模型判断依据

主会话模型来源综合判断：

- `~/.claude/settings.json` 顶层 `model` = "opus"
- `env.ANTHROPIC_MODEL` = "default_model"
- `env.ANTHROPIC_DEFAULT_OPUS_MODEL` = "default_opus[1m]"
- 主会话 /model 命令显示 `default_opus[1m]`（含 [1m] 1M context tier 标记）
  综合判断：主会话模型为 default_opus。本路（haiku）通过 Agent 工具 model 参数显式指定为 haiku。subagent 不自行判断，只把这段原样写入报告头部。

## 审阅范围

审阅了 `src/main/` 下全部 53 个 TypeScript 源文件，合计约 8500 行。

| 文件                                       | 行数 | 说明                                              |
| ------------------------------------------ | ---- | ------------------------------------------------- |
| `index.ts`                                 | 849  | 应用入口：窗口/托盘/IPC/生命周期                  |
| `core/logging.ts`                          | 107  | 日志初始化、轮转、导出                            |
| `core/paths.ts`                            | 68   | 文件路径常量                                      |
| `core/settings-close-action.ts`            | 11   | 设置窗口关闭决策纯函数                            |
| `core/local-api/server.ts`                 | 440  | 本地 HTTP API（ingest+health+web panel）          |
| `core/session/session-manager.ts`          | 217  | 受控登录窗口 + cookie 捕获                        |
| `core/auth/grok_oauth_manager.ts`          | 533  | Grok OAuth device-code + token rotation           |
| `core/network/effective_proxy.ts`          | 7    | 代理优先级合并                                    |
| `core/config/config-store.ts`              | 259  | JSON 配置读写 + 去重排队                          |
| `core/config/secrets-store.ts`             | 84   | Vault 封装 + 导出导入                             |
| `core/config/auto-seed.ts`                 | 91   | 连接器自动注册 + 间隔解析                         |
| `core/config/types.ts`                     | 120  | Zod schema + 默认配置                             |
| `core/connector/runtime.ts`                | 167  | `node:vm` 沙箱 + `transpileModule`                |
| `core/connector/manifest-loader.ts`        | 82   | manifest 发现 + 校验                              |
| `core/connector/net-client.ts`             | 457  | undici HTTP + ctx 构造 + SSRF 防护                |
| `core/connector/host-io.ts`                | 49   | `ConnectorContext` 接口定义                       |
| `core/connector/tier1-poll-executor.ts`    | 92   | 声明式 poll 执行器                                |
| `core/connector/probe-executor.ts`         | 120  | observe.probe 执行器                              |
| `core/observation/observation-store.ts`    | 226  | SQLite 观测存储                                   |
| `core/storage/write-json.ts`               | 53   | 原子 JSON 写入                                    |
| `core/vault/vault-backend.ts`              | 8    | VaultBackend 接口                                 |
| `core/vault/file-vault-backend.ts`         | 199  | AES-256-GCM 加密 vault                            |
| `core/scheduler/connector-scheduler.ts`    | 96   | per-instance setTimeout 引擎                      |
| `core/scheduler/scheduler-orchestrator.ts` | 169  | startAll/rebuild/suspend/resume/shutdown          |
| `core/scheduler/refresh-service.ts`        | 420  | 单次刷新：锁/重试/写库/映射                       |
| `core/scheduler/runtime-store.ts`          | 92   | 内存状态 + 防抖持久化                             |
| `core/scheduler/snapshot-cache.ts`         | 181  | 快照序列化 + JSON 缓存                            |
| `core/scheduler/hydrate-runtime-store.ts`  | 50   | 从 SQLite 恢复 manualRefreshOnly                  |
| `core/scheduler/endpoint-resolver.ts`      | 34   | 子进程 env 端点解析                               |
| `core/scheduler/types.ts`                  | 29   | 调度器类型                                        |
| `core/scheduler/observation-mapping.ts`    | 64   | Observation → MetricRecord                        |
| `core/main-panel/main-panel-controller.ts` | 239  | 主面板窗口生命周期                                |
| `core/main-panel/main-panel-config.ts`     | 22   | 模式解析纯函数                                    |
| `core/main-panel/main-panel-types.ts`      | 42   | 面板类型定义                                      |
| `core/main-panel/floating-bounds.ts`       | 68   | 悬浮窗边界恢复                                    |
| `core/popup/popup-height-controller.ts`    | 240  | 动态高度计算纯函数                                |
| `core/token-stats/manager.ts`              | 131  | 子进程 collector 管理                             |
| `core/token-stats/collector.ts`            | 306  | 子进程入口：Token 统计采集                        |
| `core/token-stats/claude-reader.ts`        | 645  | Claude Code costs.jsonl + session JSONL 解析      |
| `core/token-stats/kimi-reader.ts`          | 462  | Kimi Code wire.jsonl 解析                         |
| `core/token-stats/opencode-reader.ts`      | 328  | OpenCode SQLite 日志解析                          |
| `core/token-stats/token-stats-store.ts`    | 470  | Token stats SQLite 存储                           |
| `window/window-manager.ts`                 | 152  | 窗口目录 + 工厂                                   |
| `ipc/connector-ipc.ts`                     | 232  | 连接器列表/状态/刷新 IPC                          |
| `ipc/config-ipc.ts`                        | 422  | 配置 CRUD + 导出导入 IPC                          |
| `ipc/auth-ipc.ts`                          | 128  | Cookie 登录 + 静默刷新 IPC                        |
| `ipc/session-ipc.ts`                       | 71   | 会话登录 IPC                                      |
| `ipc/grok_auth_ipc.ts`                     | 135  | Grok OAuth IPC                                    |
| `ipc/event-ipc.ts`                         | 104  | 状态变化广播 + 主题 IPC                           |
| `ipc/log-ipc.ts`                           | 86   | 渲染日志转发 + 导出 IPC                           |
| `ipc/logged.ts`                            | 68   | IPC handler 日志包装器                            |
| `ipc/popup-ipc.ts`                         | 32   | 弹窗高度上报 IPC                                  |
| `ipc/size-validation.ts`                   | 28   | 尺寸报告校验                                      |
| `ipc/token-stats-ipc.ts`                   | 63   | Token stats 查询 IPC                              |
| `ipc/helpers.ts`                           | 73   | ok/fail/assert_valid_sender/state_to_snapshot_dto |

对照文档：`docs/omni_powers/op_blueprint/architecture.md`（架构）与 `conventions.md`（编码约定）。

---

## 高优先级问题（CRITICAL / HIGH）

### [CRITICAL] 1. LocalAPI 监听 0.0.0.0 而非 127.0.0.1——架构文档与实际代码矛盾

- **位置**：`src/main/core/local-api/server.ts:395`
- **现象**：`active_server.listen(target_port, "0.0.0.0")`，监听所有网络接口
- **影响**：同一局域网内的其他机器可直接访问本机 LocalAPI（含 web panel、config/secrets 查询、ingest）。虽然 ingest 端点有 Bearer token 保护，但 web panel 和部分 `/v1/` 读取端点无 auth 检查，局域网内任意设备可读取配置和观测数据。
- **对照 architecture.md**：第 77 行明确写 "仅 127.0.0.1"，第 78 行说 "Bearer token，只 ingest+health，非通用代理"——但代码监听 `0.0.0.0`，web panel 和 `/v1/config`、`/v1/secrets` 可通过 LAN 访问。
- **建议**：将监听地址改为 `"127.0.0.1"`，或在 `handle_request` 中检查 `req.socket.remoteAddress` 是否为 loopback。
- **置信度**：高
- **优先级**：CRITICAL

### [CRITICAL] 2. token-stats-ipc handlers 缺少 assert_valid_sender——IPC 安全边界缺口

- **位置**：`src/main/ipc/token-stats-ipc.ts:14-62`
- **现象**：4 个 handler（`TOKEN_STATS_BUCKETS`、`TOKEN_STATS_SESSIONS`、`TOKEN_STATS_RECORDS`、`TOKEN_STATS_STATUS`）均接收 `_event: unknown` 且不调用 `assert_valid_sender`。而所有其他 IPC 模块（connector-ipc、config-ipc、auth-ipc、session-ipc、grok_auth_ipc、event-ipc、log-ipc）全部调用了 `assert_valid_sender`。
- **影响**：如果攻击者通过某种方式（如 XSS 在渲染进程中执行）向这些通道发送请求，可绕过 sender 来源校验。token stats 数据虽然不是密钥，但包含了用户的 session 元数据（目录路径、标题等）。
- **建议**：在 token-stats-ipc 中为每个 handler 添加 `assert_valid_sender(e)`（需要将参数从 `_event: unknown` 改为接收真实事件对象）。
- **置信度**：高
- **优先级**：CRITICAL

### [HIGH] 3. Grok OAuth 每次请求新建 + 销毁 ProxyAgent——连接池复用被破坏

- **位置**：`src/main/core/auth/grok_oauth_manager.ts:123-150`（`make_default_http_post`）
- **现象**：每次 HTTP POST 调用时创建一个新的 `ProxyAgent`，在 finally 中调用 `await dispatcher.close()` 关闭。undici ProxyAgent 维护连接池，每次新建后立即销毁完全丧失了连接复用的意义。
- **影响**：Grok OAuth token refresh 的每次 HTTP 请求都会经历完整的 TCP+TLS 握手。refresh 按 `expires_at - 5min` 触发，频繁刷新时增加延迟和资源消耗。
- **对比 net-client**：`net-client.ts:218-223` 中 `create_connector_context` 同样创建了一个 `ProxyAgent`，但它的生命周期与整个 connector context 绑定（一次 refresh 内多请求复用），且不在请求间关闭。OAuth 管理器的模式更差。
- **建议**：在 manager 创建时初始化一个 `ProxyAgent` 实例，在 `shutdown()` 时关闭，HTTP 请求中共享复用。由于代理 URL 可能随配置变化，需在 proxy_url 变更时重建。
- **置信度**：高
- **优先级**：HIGH

### [HIGH] 4. calendar_date_of 在不同 reader 中行为不一致——token stats 日桶混用本地时区与 UTC

- **位置**：`src/main/core/token-stats/claude-reader.ts:247-251` vs `src/main/core/token-stats/opencode-reader.ts:119-123`
- **现象**：
    - `claude-reader.ts:247` 注释写 "Local calendar date (YYYY-MM-DD) using the system timezone"
    - `kimi-reader.ts:90-93` 无注释，但实现与 claude-reader 相同（本地时区）
    - `opencode-reader.ts:119` 注释写 "UTC calendar date (YYYY-MM-DD) — matches Claude Code /stats bucketing"
- **三个 reader 对同一天的同一时间戳会产生不同的 `date` 字符串**。例如，UTC+8 时区的用户在 2026-07-19 23:30（UTC）发起请求，claude-reader 记入 2026-07-20（本地），opencode-reader 记入 2026-07-19（UTC）。
- **影响**：Web panel 的日桶柱状图中，同一来源的 Claude Code 数据按本地时间分桶，OpenCode 数据按 UTC 分桶，Kimi 数据按本地时间分桶。跨来源对比时会产生一天的偏差。
- **建议**：统一为 UTC（opencode 的做法），因为 token-stats-store 的 migration v2 注释（line 199-200）明确提到 "daily `date` switched from collector-local to UTC bucketing — local-dated rows would linger next to UTC rows and double-count"。这表明团队已意识到此问题但 claude-reader 和 kimi-reader 尚未更新。
- **置信度**：高
- **优先级**：HIGH

### [HIGH] 5. collector.ts 子进程中直接使用 console.error/console.warn——违反编码约定

- **位置**：`src/main/core/token-stats/collector.ts:196, 231, 247`
- **现象**：
    ```typescript
    // line 196
    console.error(`[collector] ${src.key} read failed:`, msg);
    // line 231
    console.warn("[collector] sessions exceed limit, stopping source collection");
    // line 247
    console.error("[collector] postMessage failed:", msg);
    ```
- **影响**：编码约定（conventions.md §3）明确："禁止 print/console.log 调试输出，一律走 logger"。collector 是 utilityProcess 子进程，其 stderr 输出会被主进程的 `manager.ts:97-98` 捕获为 `log.error`，但 `console.error` 产生非结构化输出，丢失了模块名、trace_id 等 logger 元信息。
- **建议**：collector 应通过 `postMessage` 发送日志到主进程，或使用共享的 logger 模块（需确认 utilityProcess 子进程是否能正确初始化 logger）。
- **置信度**：高
- **优先级**：HIGH

---

## 中低优先级问题（MEDIUM / LOW）

### [MEDIUM] 6. config-store load() 中 schema 校验失败后的 .bak 备份逻辑可能覆盖有效的 .bak

- **位置**：`src/main/core/config/config-store.ts:188-190`
- **现象**：当 `appConfigurationSchema.safeParse` 失败时，代码先尝试从 `.bak` 恢复，然后**无条件**将损坏的 `raw` 写入 `.bak`（覆盖之前有效的备份）。如果主文件和 .bak 都恰好损坏（如磁盘故障），这一步无伤；但如果主文件损坏而 .bak 有效，第一次启动会成功恢复，但主文件的损坏内容会覆盖 .bak——下一次启动如果主文件再次损坏，.bak 就不再有有效备份。
- **影响**：损坏恢复能力从两次降为一次。
- **建议**：恢复成功后不将损坏数据写入 .bak，或使用轮转备份机制。
- **置信度**：中
- **优先级**：MEDIUM

### [MEDIUM] 7. auto-seed 连接器匹配逻辑存在误匹配风险

- **位置**：`src/main/core/config/auto-seed.ts:28-37`
- **现象**：`existing_by_id` 使用 `base_name.includes(def.manifest.id)` 匹配现有配置中的连接器。如果 manifest.id 是 `"cpa"`，它能匹配 `executablePath` 包含 `"cpadapter"` 的目录。同样 `connector.name.toLowerCase() === def.manifest.id` 作为 alternative match 没有处理空字符串。
- **影响**：极少数边缘情况下，连接器可能被误归类为已有配置而不是新建配置，导致 auto-seed 行为不正确。
- **建议**：使用更精确的匹配逻辑，如 `executablePath.endsWith('/' + def.manifest.id)` 或 `executablePath.endsWith('\\' + def.manifest.id)`（平台感知）。
- **置信度**：中
- **优先级**：MEDIUM

### [MEDIUM] 8. observation-store 迁移中多 ALTER TABLE 语句可能部分失败

- **位置**：`src/main/core/observation/observation-store.ts:103-108`
- **现象**：`MIGRATE_ADD_LABEL_COLUMNS_SQL` 包含两条 ALTER TABLE 语句（`raw_label` 和 `normalized_label`/`display_label`），用分号分隔后通过 `db.exec()` 一次性执行。SQLite 不支持事务中的 schema 变更，如果第二条 ALTER 失败（例如列名冲突），第一条已生效且不会被回滚。
- **影响**：极低（这些列不太可能已存在），但防御性代码应在执行前逐列检查而非依赖一次性迁移成功。
- **建议**：逐列检查 `PRAGMA table_info`，只添加缺失的列；或使用 try-catch 包裹每个 ALTER。
- **置信度**：中
- **优先级**：MEDIUM

### [MEDIUM] 9. refresh-service 错误分类使用字符串子串匹配——误判风险

- **位置**：`src/main/core/scheduler/refresh-service.ts:54-76`
- **现象**：`is_auth_error` 检查错误消息是否包含 "401"、"unauthorized"、"token"、"credential"、"auth" 等子串。`is_connection_error` 类似。
- **影响**：
    - 如果 API 返回的错误消息中包含 "authorization" 但实际是权限不足（非凭证过期），会被误判为 auth 错误并触发不必要的 session re-login
    - 如果 API 返回 401 但 body 中的 JSON 错误消息碰巧包含 "token"（如 "token parameter required"），也会误判
- **建议**：区分 HTTP 状态码（401/403）和错误消息内容，使用更精确的分类。或由连接器脚本通过 `report_failed_account` 提供明确的错误类型而非依赖宿主侧字符串匹配。
- **置信度**：中
- **优先级**：MEDIUM

### [MEDIUM] 10. file-vault-backend 写操作顺序：先写 .bak 再写主文件——中断可能损坏主文件

- **位置**：`src/main/core/vault/file-vault-backend.ts:136-143`
- **现象**：`write_vault` 先写 `.bak` 再写主文件。如果进程在写入主文件时崩溃，主文件可能被截断或写入不完整 JSON，而 .bak 和主文件都不再可靠。相比之下，原子写入模式（先写 .tmp，再 rename 到主文件，最后更新 .bak）更安全。
- **影响**：在写入过程中崩溃可能导致 vault 数据丢失（所有密钥的加密 blob）。
- **建议**：采用 write-json.ts 的 `writeJsonAtomic` 模式（先写 .tmp，rename 到主文件），然后复制到 .bak。或至少先写主文件再写 .bak。
- **置信度**：中
- **优先级**：MEDIUM

### [MEDIUM] 11. onConfigSaved 回调中 grok OAuth reconcile + token stats config update + scheduler reconcile 串行化——但错误处理不足

- **位置**：`src/main/index.ts:279-311`
- **现象**：`onConfigSaved` 回调执行多项副作用：更新 `secretParamKeys`、调用 `orchestrator.reconcile`（同步）、调用 `grokOAuthManager.reconcile_auto_refresh`（触发异步 token refresh）、调用 `tokenStatsManager.update_config`（同步）、广播 `CONFIG_CHANGED` 到所有窗口。
- **影响**：如果 `grokOAuthManager.reconcile_auto_refresh` 内部抛错，不会被捕获且不会阻塞后续的广播。这是预期行为，但错误信息可能丢失。
- **建议**：无明显 bug，但建议对每个子操作加 try-catch 并记录错误。
- **置信度**：低
- **优先级**：LOW

### [LOW] 12. popup-height-controller 注释与实际常量不一致

- **位置**：`src/main/core/popup/popup-height-controller.ts:66`
- **现象**：注释写 "When clamp bounds invert (min > max because work area is tiny), honour the max — we must not exceed the 85% screen rule." 但实际 `MAX_HEIGHT_RATIO = 0.75`（75%），不是 85%。
- **影响**：仅注释错误，不影响功能。
- **建议**：将注释中的 "85%" 改为 "75%"。
- **置信度**：高
- **优先级**：LOW

### [LOW] 13. endpoint-resolver.ts 未被任何当前代码引用——疑似死代码

- **位置**：`src/main/core/scheduler/endpoint-resolver.ts`
- **现象**：该文件导出 `resolveRuntimeEnv` 和 `ResolvedRuntimeEnv` 类型，用于将 endpoint 配置序列化为子进程环境变量。但当前架构使用 `node:vm` 同进程沙箱（而非子进程），endpoint 通过 `ConnectorContext` 的 `endpoint_overrides` 传入。Grep 确认没有任何文件 import 该模块。
- **影响**：死代码增加维护负担，可能在重构时被误用。
- **建议**：如确认不再需要，移除该文件。如计划将来切回子进程模式，添加 `@deprecated` 或 TODO 注释。
- **置信度**：高
- **优先级**：LOW

### [LOW] 14. net-client.ts 中 init_global_network 使用 setGlobalDispatcher——可能影响其他 undici 使用者

- **位置**：`src/main/core/connector/net-client.ts:21-31`
- **现象**：`setGlobalDispatcher` 会替换 undici 的全局 Agent，影响进程中所有 undici 请求（包括 `grok_oauth_manager.ts` 中的独立 undici 调用和 Electron 内部可能使用的 undici）。
- **影响**：Grok OAuth 的请求也会经过这个全局 Agent（设置了 keepAlive 和连接上限），但 OAuth manager 又创建了独立的 ProxyAgent dispatcher，两者行为一致与否取决于请求时是否显式传入 dispatcher。
- **建议**：全局 Agent 与 per-request dispatcher 的交互依赖 undici 实现细节。建议在 grok_oauth_manager 的 `make_default_http_post` 中也应用一致的连接池参数，或不依赖全局 dispatcher 而显式为每个请求构造 dispatcher。
- **置信度**：中
- **优先级**：LOW

### [LOW] 15. connector-scheduler 中 setTimeout 递归可能导致微小的时间漂移

- **位置**：`src/main/core/scheduler/connector-scheduler.ts:50-63`
- **现象**：`schedule_next` 在每次 refresh 触发后递归调用 `setTimeout`。如果 refresh 耗时 2 秒，下一个周期会延迟 2 秒。
- **影响**：实际上这是一种设计选择（防止并发刷新），但缺少日志说明。不影响功能。
- **建议**：在注释中说明"非重叠刷新"的设计意图。
- **置信度**：高
- **优先级**：LOW

### [LOW] 16. session-manager 中 captured_cookie 在 window.loadURL 之前设置为 null

- **位置**：`src/main/core/session/session-manager.ts:75`
- **现象**：`captured_cookie` 初始化为 `null`。如果 `window.loadURL` 在 `session.on_before_send_headers` 注册之前就触发了请求（极低的竞态可能），cookie 会丢失。
- **影响**：实际上 `on_before_send_headers` 在 `loadURL` 之前注册（line 131 在 line 165 之前），所以 cookie handler 在第一个请求之前一定已就绪。无实际影响，仅为代码阅读提醒。
- **建议**：无需修改，仅记录。
- **置信度**：低
- **优先级**：LOW

---

## 改进建议

### 1. 统一 token stats 时区处理

claude-reader、kimi-reader 使用本地时区 `calendar_date_of`，opencode-reader 使用 UTC。建议全部统一为 UTC，与 migration v2 注释一致。影响 web panel 的按日柱状图聚合准确性。

### 2. Grok OAuth ProxyAgent 生命周期管理

当前每次 HTTP 请求创建+销毁 ProxyAgent。建议在 manager 实例化时创建共享实例，在 `shutdown()` 时关闭，并随 proxy_url 变更重建。

### 3. token-stats-ipc 安全加固

为所有 handler 添加 `assert_valid_sender` 调用，与其他 IPC 模块保持一致。

### 4. LocalAPI 监听地址改为 127.0.0.1

与 architecture.md 描述的 "仅 127.0.0.1" 保持一致，或为 web panel 端点添加来源 IP 检查。

### 5. 移除或标注死代码

`endpoint-resolver.ts` 在当前架构中未被使用。建议移除以减少维护负担。

### 6. 迁移脚本加强原子性

`observation-store.ts` 的 migration 中多条 ALTER TABLE 语句应考虑逐条 try-catch 或预先检查列是否存在。

### 7. file-vault-backend 写入顺序优化

建议采用 write-json.ts 的原子写入模式（先 .tmp 再 rename），然后将新内容复制到 .bak，以降低写入中断导致数据丢失的风险。

### 8. collector 子进程日志规范化

将 `console.error`/`console.warn` 替换为通过 `postMessage` 发送的结构化日志，或统一使用共享 logger。

### 9. 同步 connnector-scheduler 的 `forEach` 迭代与 `stop()` 竞态

`scheduler-orchestrator.ts:167` 的 `shutdown()` 在 `stopAll()` 之外还有 `generation++` 清除安全网定时器。如果 `stopAll()` 遍历 timers Map 时，`schedule_next` 回调中正好向 Map 添加了新条目，新条目不会被清理。虽然 `shutdownStarted` 标志位会阻止新的 `start()`/`rebuild()` 调用，但已经在队列中的 `setTimeout` 回调不受此标志影响。建议 `stopAll()` 改为 while 循环 + 重新检查 Map 大小，或使用 `clearTimeout` 前快照所有 key。

---

## 不确定项 / 可能误报

### U1. net-client ProxyAgent 生命周期

`create_connector_context` (line 218-223) 创建的 `ProxyAgent` 没有对应的 `close()` 调用。undici 的 ProxyAgent 需要显式关闭以释放连接。不确定这是否导致连接泄漏——如果 connector context 短暂存在且 ProxyAgent 被垃圾回收时 undici 自动清理，则无问题。建议验证。

### U2. onHeadersReceived CSP handler 性能影响

`index.ts:123-131` 对每个 HTTP 响应注入 CSP header。在打包应用中这只影响 `file://` 协议页面的子资源请求（CSS/JS/image），数量有限。在 dev 模式下影响 dev server 的所有请求。不确定大量请求下回调的开销是否显著。

### U3. `session.fromPartition` 创建的持久化 session 不会被清理

`session-manager.ts:71` 使用 `persist:session-login:${instance_id}` 作为 partition。这些持久化 session 在连接器被删除后不会被清理，cookie 数据残留。不确定是否为有意设计（允许重新添加连接器后自动恢复登录态）。

### U4. `refresh-service.ts:242` 的 `max_attempts = 3` 重试逻辑

重试延迟固定 1000ms，无指数退避。connector-scheduler 无退避逻辑（architecture.md §6 已记录此限制）。当前设计是合理的，但如果是网络瞬时抖动（如 rate limit 429），3 次 1 秒间隔重试可能不够。不确定是否需要在连接器级别添加退避。

### U5. `token-stats-store.ts:204` migration v2/v3 使用 `user_version` PRAGMA

SQLite 的 `user_version` PRAGMA 是一个 32 位整数，migration v2 该值为 2，v3 该值为 3。如果单个版本中需要多次迁移，这个模式需要扩展。目前仅有两个迁移版本，无问题。

---

_审阅完成时间：2026-07-19 14:33 UTC+8_
_审阅工具：haiku（Claude Agent SDK subagent）_
_审阅范围：src/main/ 目录下 53 个文件，约 8500 行_
