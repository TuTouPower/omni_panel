## 当前模型判断依据

主会话模型来源综合判断：

- `~/.claude/settings.json` 顶层 `model` = "opus"
- `env.ANTHROPIC_MODEL` = "default_model"
- `env.ANTHROPIC_DEFAULT_OPUS_MODEL` = "default_opus[1m]"
- 主会话 /model 命令显示 `default_opus[1m]`（含 [1m] 1M context tier 标记）
  综合判断：主会话模型为 default_opus。本路（opus）通过 Agent 工具 model 参数显式指定为 opus。subagent 不自行判断，只把这段原样写入报告头部。

## 审阅范围

审阅目录：`src/main/`（OmniUsage Electron 主进程）。共 55 个 `.ts` 文件，逐文件、逐函数通读。

| 子目录                       | 文件数 | 主要职责                                                                                                  |
| ---------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `src/main/index.ts`          | 1      | 应用引导、窗口/托盘/IPC 注册、生命周期                                                                    |
| `src/main/window/`           | 1      | 窗口工厂与配置目录                                                                                        |
| `src/main/ipc/`              | 12     | IPC handler（config/connector/auth/session/grok/log/popup/event/token-stats）                             |
| `src/main/core/config/`      | 4      | config-store / secrets-store / auto-seed / types                                                          |
| `src/main/core/vault/`       | 2      | AES-256-GCM file vault                                                                                    |
| `src/main/core/connector/`   | 6      | 沙箱运行时 / manifest 加载 / net-client / host-io / poll+probe 执行器                                     |
| `src/main/core/scheduler/`   | 9      | refresh-service / orchestrator / runtime-store / snapshot-cache / endpoint-resolver / observation-mapping |
| `src/main/core/observation/` | 1      | SQLite observation store                                                                                  |
| `src/main/core/session/`     | 1      | 登录窗 + cookie 捕获                                                                                      |
| `src/main/core/local-api/`   | 1      | 本地 HTTP 服务器（ingest / web panel）                                                                    |
| `src/main/core/auth/`        | 1      | Grok device-code OAuth                                                                                    |
| `src/main/core/network/`     | 1      | effective proxy 合并                                                                                      |
| `src/main/core/storage/`     | 1      | 原子写 JSON                                                                                               |
| `src/main/core/main-panel/`  | 4      | 托盘弹出/悬浮窗控制                                                                                       |
| `src/main/core/popup/`       | 1      | 动态高度纯函数                                                                                            |
| `src/main/core/token-stats/` | 5      | Claude/Kimi/OpenCode 用量采集 + SQLite 存储                                                               |
| `src/main/core/` 根          | 3      | logging / paths / settings-close-action                                                                   |

未抽样、未跳读；涉及跨区类型按需读取了 `src/shared/`（constants、logger、schemas/manifest、types/ipc 等）但仅对 `src/main/` 范围内代码出意见。`docs/omni_powers/op_blueprint/architecture.md` 与 `conventions.md` 全文对照。

---

## 高优先级问题（CRITICAL / HIGH）

### C-1. local-api 监听 `0.0.0.0`，违反「仅 127.0.0.1」架构契约

- **位置**：`src/main/core/local-api/server.ts:395`
- **现象**：`active_server.listen(target_port, "0.0.0.0")`。注释也明示 `LocalAPI listening on 0.0.0.0:${port}`。
- **影响**：`architecture.md` §3 明确「LocalAPI 仅 `127.0.0.1`」。绑定 `0.0.0.0` 意味着监听所有网卡——同 Wi-Fi 内任何主机/容器/虚拟机都能直访本机 API。配合 C-2 形成密钥外泄链。
- **建议**：改为 `listen(port, "127.0.0.1")`；如需远程访问再单独走显式 opt-in。
- **置信度**：高
- **优先级**：CRITICAL

### C-2. local-api `/v1/config`、`/v1/secrets`、`/v1/connectors*` 在 `check_auth` 之前执行，无任何鉴权

- **位置**：`src/main/core/local-api/server.ts:208-373`（`handle_request` 顺序：health → static → web_read → web_config → web_connector → `check_auth` → ingest）
- **现象**：
    - `/v1/secrets?instanceId=<id>` GET → 调 `handleConfigGetSecrets`，**返回 vault 内所有 secret 明文**（包括 SESSION_COOKIE、API key、OAUTH_TOKEN 等）。
    - `/v1/config` GET/POST → 调 `handleConfigGet`/`handleConfigSave`，可读改用户配置（含 `endpointOverrides`，配合 C-1 可把 secret 重定向到攻击者主机，再触发 refresh 即外泄）。
    - `/v1/connectors` 与 `/v1/connectors/:id/refresh` → 触发任意连接器刷新、查询快照。
    - `/v1/records`、`/v1/sessions`、`/v1/buckets` → 读全部 AI 用量历史。
    - 注释明示 "Web read endpoints serve the panel UI without auth (intranet use per project decision). ingest stays token-gated below." 但代码同时把写敏感操作（POST `/v1/config`、`/v1/secrets`）放在鉴权之前，**完全不是「只读」**。
- **影响**：同机器内任意进程（或因 C-1 + 局域网内任意主机）可读 vault 明文、篡改配置、强制刷新触发 secret 外发。这是 P0 级密钥外泄。
- **建议**：把 `/v1/secrets*`、`/v1/config*`、`/v1/connectors*` 全部挪到 `check_auth(req, token)` 之后；web panel 的只读 UI（buckets/sessions/records）按需独立白名单，或也加 token。
- **置信度**：高
- **优先级**：CRITICAL

### C-3. local-api ingest 信任客户端传入的 `source_instance_id`，可伪造任意 instance 写观测

- **位置**：`src/main/core/local-api/server.ts:169-196`
- **现象**：`observation: Observation = { ...(result.data as unknown as Observation), observed_at: Date.now(), stale: false, last_error: null }`。`source_instance_id` 直接来自请求体。
- **影响**：`architecture.md` §5 「instance identity 归宿主」契约——脚本运行时发现 account/metric，但 `source_instance_id` 只由 `refresh-service` 盖，防同 provider 多实例在下游 collapse。ingest 通道未做此约束，外部 producer 可写入任意 `source_instance_id`，污染/覆盖目标实例的最新观测。
- **建议**：要么强制 ingest 时不接受 `source_instance_id`（由 server 生成 `external:<token-hash>` 之类前缀），要么严格 schema 拒绝重复 instance id。
- **置信度**：中（取决于 ingest 设计意图）
- **优先级**：HIGH

### H-1. 连接器沙箱逃逸：`node:vm` 非真隔离（已知限制，但缓解不足）

- **位置**：`src/main/core/connector/runtime.ts:31-37, 39-55`
- **现象**：`compile_script` 用正则 `/^\s*(?:import|export)\s/m` 拦 import/export，但 `import type` / `declare const` 的剥离正则是 `^import\s+type\s+[^;]+;\s*$` 与 `^declare\s+const\s+[^;]+;\s*$`——要求**分号结尾且独占整行**。脚本写 `import type { X } from "y"` 不带分号或多类型合并即不被剥离，会被 `import` 拦截；但写 `export{};` + 行内 `import` 注入到字符串拼接，或 `(0,eval)("this")`、`Promise.constructor.constructor` 等 VM 标准逃逸技巧全部没拦。
- **影响**：架构 §6 已承认这是「已知安全限制」。但当前缓解仅有「禁 import/export」+ 超时 + deep_freeze，**对最简单的逃逸 payload 都无效**。一旦未来引入用户贡献的 connector（`getUserConnectorsDir()` 已支持），任何下载的连接器可直接拿到主进程权限（fs/child_process/secrets）。
- **建议**：
    1. 短期：把 `(0, eval)`、`Function`、`process.binding`、`Promise.constructor` 等明显逃逸点列入 compile 前 AST 检查；
    2. 中期：迁 `isolated-vm`（真内存隔离 + 传输白名单）；
    3. 长期：架构 §6 「待办：子进程隔离」。
- **置信度**：高
- **优先级**：HIGH（与 architecture §6 「已知限制」一致，但缓解强度低于声称）

### H-2. `endpointOverrides` 导入路径无 SSRF/host 校验，可把 secret 发到攻击者主机

- **位置**：`src/main/ipc/config-ipc.ts:314-362`（`handleConfigImport`）；`src/main/core/connector/net-client.ts:106-115`（`assert_safe_connector_host`）
- **现象**：`handleConfigImport` 直接 `appConfigurationSchema.safeParse` + `configStore.save`，未对 `endpointOverrides` 做主机白名单校验。`net-client.assert_safe_connector_host` 仅拦 3 个云元数据主机（`169.254.169.254`、`metadata.google.internal`、`metadata.azure.com`），公网任意 IP/域名都放行。`refresh-service.execute_connector` 只对 grok 删除 `grok_billing` override，其他连接器的 override 原样进入 `apply_request_auth` → secret 进 URL query 或 Authorization header 发往 override 主机。
- **影响**：用户「导入设置」攻击链：打开恶意导出的 JSON → `endpointOverrides` 指向攻击者主机 → 应用触发 refresh → vault 内 API key/cookie 随请求外发。架构 §6 已标为「待办：改端点后强制重录 secret」，但目前无任何提示/隔离。
- **建议**：
    1. 导入配置时，若 `endpointOverrides` 含非 manifest 默认主机的值，弹窗确认并强制重录 secret；
    2. 扩展 `assert_safe_connector_host` 覆盖 RFC1918 之外的「公网未知主机」由用户白名单（per-instance 主机记忆）。
- **置信度**：高
- **优先级**：HIGH

### H-3. `token-stats-ipc` 所有 handler 缺 `assert_valid_sender`

- **位置**：`src/main/ipc/token-stats-ipc.ts:18-61`
- **现象**：4 个 handler（`TOKEN_STATS_BUCKETS` / `SESSIONS` / `RECORDS` / `STATUS`）直接 `ipc.handle`，未调 `assert_valid_sender(e)`，与同文件其他 IPC（`config-ipc`、`connector-ipc`、`auth-ipc`、`session-ipc`、`grok_auth_ipc`、`log-ipc`）风格不一致。
- **影响**：
    1. 违反 `architecture.md` §3 「IPC sender 按 URL 协议白名单校验」契约；
    2. 任何能注入到 default session 的 page（如 XSS、`<iframe>`、`webview`、devtools 打开的任意 URL）都能调用这些 handler 拉取用户全部 AI 用量历史，含目录路径/会话标题（可能含敏感信息）。
- **建议**：每个 handler 起手 `assert_valid_sender(_event as IpcMainInvokeEvent)`；或抽到 logged wrapper 里默认带。
- **置信度**：高
- **优先级**：HIGH

### H-4. `token-stats` collector 子进程崩溃后无指数退避重启

- **位置**：`src/main/core/token-stats/manager.ts:83-95`
- **现象**：`child.on("exit", ...)` 固定 30s 后 `start(current_config)`。若 collector 启动即崩（如 better-sqlite3 native binding 缺失、WSL 路径异常），将无限 30s 循环。
- **影响**：CPU/IO 浪费 + 日志爆炸；`child.stderr.on("data")` 每次崩都打错误日志。
- **建议**：连续短间隔退出（如两次退出间隔 < 5min）记入失败次数，达到阈值后停止重启并 `log.error`；或用 `start_time - exit_time < threshold` 判断「启动即崩」。
- **置信度**：高
- **优先级**：HIGH

### H-5. `undici.ProxyAgent` 每 connector context 新建且不 `close`

- **位置**：`src/main/core/connector/net-client.ts:212-223`
- **现象**：`create_connector_context` 每次 refresh 调用都 new 一个 `ProxyAgent`，未缓存也未 `close()`。`refresh-service.execute_connector` → 每次 attempt 都创建新 context → 新 ProxyAgent。Grok OAuth manager 的 `make_default_http_post` 倒是在 finally 里 `await dispatcher.close()`。
- **影响**：
    1. 连接池/TLS 复用完全失效（`init_global_network` 设置的 `MAX_CONNECTIONS_PER_ORIGIN` 对带 dispatcher 的请求不生效，每个 ProxyAgent 独占池）；
    2. 长期运行会泄漏 socket/file descriptor（Node.js undici ProxyAgent 不被 GC 自动释放）。
- **建议**：缓存 ProxyAgent by proxy_url（一次创建、复用），进程退出时统一 close；或改为全局单例 dispatcher + per-request override。
- **置信度**：高
- **优先级**：HIGH

---

## 中低优先级问题（MEDIUM / LOW）

### M-1. `session-manager.should_capture_cookie` 路径白名单写死，其他 session 连接器永远捕不到 cookie

- **位置**：`src/main/core/session/session-manager.ts:177-185`
- **现象**：`return parsed_url.pathname.includes("/api/v1/") || parsed_url.pathname === "/_server";`——这是 Antigravity / Kimi 风格的硬编码路径。其他 session 模式连接器（如未来加 Cursor、Windsurf）的 API 路径若不含 `/api/v1/`，cookie 永远不会被捕获，`save_cookie_on_close` 直接 `resolve({ saved: false })`。
- **影响**：架构扩展性问题；当前已有连接器测试覆盖的 provider 没问题，但 manifest 系统承诺「session capability 通用」。
- **建议**：把路径匹配规则挪到 manifest（如 `session.capture_path_prefixes`），`should_capture_cookie` 接收参数。
- **置信度**：中
- **优先级**：MEDIUM

### M-2. `auto_seed_connectors` 用 `base_name.includes(def.manifest.id)` 判同，会误匹配

- **位置**：`src/main/core/config/auto-seed.ts:29-37`
- **现象**：连接器 id 是短串（`cpa`、`kimi`、`grok`）。若用户曾手动删过某 connector，目录名 `my-cpa-backup` 会匹配 `cpa`，下次启动「复活」已被删除的实例。
- **影响**：用户删除操作被静默回滚；`config-store.prune_invalid_plugins` 只在 manifest 失效时才清理，不会拦这种「manifest 还在但用户已删」的情况。
- **建议**：维护显式「已删除 connector ids」黑名单写到 config，或改为 `base_name === def.manifest.id` 精确匹配。
- **置信度**：中
- **优先级**：MEDIUM

### M-3. `main-panel-controller.position_popup` 在 tray bounds 为 0 时直接 return，Windows 首开位置未定

- **位置**：`src/main/core/main-panel/main-panel-controller.ts:102-116`
- **现象**：`if (!tray_bounds || tray_bounds.width <= 0 || tray_bounds.height <= 0) return;`——Windows 下 `Tray.getBounds()` 返回 0（`index.ts:759` 注释已承认），所以 `position_popup` 在 Windows 下首次打开 popup 永远不执行，窗口停在窗口工厂默认位置（屏幕中央或上次保存的 floating bounds）。
- **影响**：UX 问题，Windows 用户首开 popup 位置不可预测。
- **建议**：bounds 为 0 时回退到光标位置（`screen.getCursorScreenPoint()`）或主屏右下角。
- **置信度**：中
- **优先级**：MEDIUM

### M-4. `refresh-service.is_auth_error` 判断过宽

- **位置**：`src/main/core/scheduler/refresh-service.ts:54-63`
- **现象**：`lower.includes("auth")` 把含 "auth" 字样的任何错误都归为 auth error（如 `"batch auth rate limited"`、`"oauth preflight"`）→ 触发不必要的交互式 re-login。
- **影响**：用户体验问题——非鉴权错误弹出登录窗。
- **建议**：精确匹配 HTTP 401 或 manifest 定义的 auth error 关键词；去掉泛 `auth` 子串匹配。
- **置信度**：高
- **优先级**：MEDIUM

### M-5. `connector-scheduler` 启动时 jitter setTimeout 未纳入 timers Map，shutdown 漏管

- **位置**：`src/main/core/scheduler/connector-scheduler.ts:43-47`
- **现象**：`if (jitter > 0) setTimeout(do_refresh, jitter);` 这个 timer 没有存到 `timers` Map，`stop()` / `stopAll()` 只清 interval timer。shutdown 时若 jitter timer 还在 pending，最多 3s 后仍会触发 refresh。
- **影响**：低——但与架构 §6 「shutdown 干净退出」精神不符。
- **建议**：把 jitter timer 也存进 timers（或单独 pending-immediate 集合），shutdown 时一并 clearTimeout。
- **置信度**：高
- **优先级**：MEDIUM

### M-6. `config-store.load()` 中 `prune_invalid_plugins` 后 `writeJsonAtomic` 未进 `saveTail` 队列

- **位置**：`src/main/core/config/config-store.ts:141-160`
- **现象**：load 发现无效 plugin 后直接 `await writeJsonAtomic(configPath, sortKeys(pruned))`，绕过 `enqueueSave` 串行化。若此时另一路径在 `configStore.save()`，两路 write/rename 可能交错（atomic rename 保证最终一致，但顺序丢失，prune 结果可能被 save 覆盖或反过来）。
- **影响**：低——atomic rename 保证文件不损坏，最坏情况是 prune 未持久化、下次启动再 prune 一次。
- **建议**：用 `enqueueSave` 或 `saveTail` 串行化 prune 写入。
- **置信度**：中
- **优先级**：MEDIUM

### M-7. `local-api.serve_static` Windows 下 `requested.replace(/^[/\\]+/, "")` 后 `path.resolve` 行为依赖 cwd

- **位置**：`src/main/core/local-api/server.ts:101-127`
- **现象**：`resolved = path.resolve(web_root, requested.replace(/^[/\\]+/, ""))`，再 `resolved.startsWith(web_root)` 检查。Windows 下 `path.resolve` 会把 `C:\foo` 识别为绝对路径，若 requested 是 `D:/attack` 形式，`path.resolve(web_root, "D:/attack")` 返回 `D:\attack`，`startsWith(web_root)` 为 false → 403。看似安全，但 `web_root` 大小写在 Windows 不敏感而 `startsWith` 敏感，理论上可构造大小写混淆路径绕过。
- **影响**：低（需要精确猜出 web_root 大小写变体，且文件系统要支持）。
- **建议**：用 `path.relative(web_root, resolved)` 判断 `..` 前缀，更稳。
- **置信度**：中
- **优先级**：MEDIUM

### M-8. `is_connection_error` 关键词 `tls` / `ssl` 太宽

- **位置**：`src/main/core/scheduler/refresh-service.ts:65-77`
- **现象**：`lower.includes("tls")` 会匹配 `"failed to parse metrics.jsonl"` 之类的字符串（含 "tls" 子串的概率不高但存在）；`ssl` 同理。
- **影响**：误判连接错误 → 累计 `connection_error_count` → 触发不必要的 `reset:true` 新建连接。
- **建议**：改为 `includes("tls/")` 或匹配 undici 错误码 `UND_ERR_SOCKET` / `UND_ERR_CONNECT`（已有）+ `ECONNRESET` 等 errno，去掉 `tls`/`ssl` 泛匹配。
- **置信度**：中
- **优先级**：MEDIUM

### M-9. CSP dev 模式 `connect-src 'self' ${devOrigin} ws:`，ws: 通配所有 WebSocket

- **位置**：`src/main/index.ts:122`
- **现象**：dev 模式 `connect-src ... ws:` 允许任意 ws:// 主机。Vite HMR 其实是固定 devOrigin，不需要全开 `ws:`。
- **影响**：dev 模式下若有 XSS，可经任意 ws 外发数据。生产模式不受影响（无 ws:）。
- **建议**：改为 `ws://${devHost}:` 精确匹配 dev origin 的 ws。
- **置信度**：中
- **优先级**：MEDIUM

### M-10. `grok_oauth_manager.schedule_retry` 无最大重试次数

- **位置**：`src/main/core/auth/grok_oauth_manager.ts:437-449`
- **现象**：refresh 失败（非 terminal_grant）即递归 schedule 60s 后重试，无上限。token 永久失效但非 terminal_grant 类错误（如 5xx）会无限轮询。
- **影响**：低（x.ai OAuth 较稳定），但缺乏保险。
- **建议**：加连续失败计数器，达阈值后停止 auto_refresh 并 log。
- **置信度**：中
- **优先级**：MEDIUM

### M-11. `detected_system_proxy` 只在启动时探测一次

- **位置**：`src/main/index.ts:170-180`
- **现象**：`await session.defaultSession.resolveProxy("https://auth.x.ai")` 只在 `app.whenReady` 时调一次。用户运行中切换系统代理（如开关 Clash）不会被重新探测；但用户可在设置里手动配 `proxy.url`。
- **影响**：UX 问题——系统代理变化后需重启应用。
- **建议**：定期（如每 5min）或在网络变化事件时重探；或文档明示需重启。
- **置信度**：高
- **优先级**：MEDIUM

### M-12. `session-manager.start_login` 的 `window.loadURL` 失败后不关窗

- **位置**：`src/main/core/session/session-manager.ts:165-167`
- **现象**：`void window.loadURL(request.login_url).catch((error) => finish_with_error(to_error(error)))`。`finish_with_error` reject 了 promise 并清空 captured_cookie，但 window 没关。要么等用户手动关，要么等 timeout（120s）触发 close。
- **影响**：用户体验——加载失败后窗口挂起。
- **建议**：`finish_with_error` 内部调 `window.close()`，或单独 close 路径。
- **置信度**：中
- **优先级**：MEDIUM

### M-13. `handleConfigSave` 合并策略与 `saveSecrets` 紧耦合

- **位置**：`src/main/ipc/config-ipc.ts:98-159`
- **现象**：`merged = { ...current, ...incomingKeys }`——incoming 覆盖 current 的所有同名字段；但 incoming schema 不要求所有字段必填，renderer 若漏传 `plugins` 之外的字段（如 `proxy`），会用 current 的旧值。这是**有意设计**（注释说明了），但 `JSON.stringify(reloaded) !== JSON.stringify(current)` 的冲突检测对字段顺序敏感——若 current 经历过 `sortKeys`（save 时），reloaded 也是 sorted，但 current 是内存对象未排序，对比会误报冲突。
- **影响**：低（实际场景冲突罕见）。
- **建议**：对比改用 deep-equal 或限定关键字段（plugins/proxy/theme）。
- **置信度**：中
- **优先级**：MEDIUM

### L-1. `local-api.get_token()` 返回明文，注释承认必要但调用方未脱敏

- **位置**：`src/main/core/local-api/server.ts:432-437`
- **现象**：注释说「callers must redact before logging or persisting」，但无静态保证。如果未来有调用方 `log.info(local_api.get_token())`，token 直接进日志。
- **建议**：提供 `get_token_redacted()` 返回 `***`，明文接口重命名为 `get_token_unsafe()`。
- **置信度**：中
- **优先级**：LOW

### L-2. `observation-store.prune` SQL 子查询 O(N²)

- **位置**：`src/main/core/observation/observation-store.ts:155-162`
- **现象**：每行执行相关子查询找 MAX(observed_at)。表大时性能差。
- **影响**：低（典型规模 < 10K 行，且有 `idx_lookup` 覆盖索引）。
- **建议**：改用窗口函数（SQLite 3.25+）或 `LEFT JOIN ... ON ... AND o2.observed_at > o1.observed_at WHERE o2.id IS NULL`。
- **置信度**：中
- **优先级**：LOW

### L-3. `window-manager.getRendererUrl` 用 `file://${opts.rendererIndexPath}` 在 Windows 下未正规化反斜杠

- **位置**：`src/main/window/window-manager.ts:97`
- **现象**：Windows path `C:\...\index.html` 拼成 `file://C:\...\index.html`，标准 file URL 应为 `file:///C:/...`。Electron 通常容忍，但 CSP `script-src 'self'` 的 'self' 派生自此 URL，若派生异常会破坏 CSP。
- **影响**：低（Electron 长期兼容此格式）。
- **建议**：`pathToFileURL(opts.rendererIndexPath).toString()`。
- **置信度**：中
- **优先级**：LOW

### L-4. `snapshot-cache` 序列化无 schema 版本

- **位置**：`src/main/core/scheduler/snapshot-cache.ts:43-88`
- **现象**：未来 `ConnectorSnapshotState` 字段变更后，老 cache 反序列化可能落入错误分支。`deserialize_entry` 用 switch + 可选字段，相对健壮，但无显式 `formatVersion`。
- **影响**：低——try/catch 兜底为空 Map。
- **建议**：cache 文件加 `{ formatVersion: 1, entries: [...] }` 外层。
- **置信度**：中
- **优先级**：LOW

### L-5. `claude-reader.message_id_from_line` 用 sha256 前 32 字符，碰撞概率虽低但未防

- **位置**：`src/main/core/token-stats/claude-reader.ts:269-272`
- **现象**：32 字符 = 128 bit，碰撞概率 2^-128，理论可忽略。但 Claude Code 重写 transcript 行时可能产生完全相同的行（byte-identical，已被 `seen_lines` 去重），所以实际上无碰撞风险。
- **影响**：无实际问题。
- **置信度**：高
- **优先级**：LOW

### L-6. `is_safe_positive_number` 校验 `value >= 0`，但 `parseSizeReport` 用于 width/height 应 `> 0`

- **位置**：`src/main/ipc/size-validation.ts:1-7`
- **现象**：`isFinitePositiveNumber` 接受 0，但 width/height=0 对 setBounds 无意义。
- **影响**：低——`main-panel-controller` 没专门检查 0。
- **建议**：单独 `isPositiveNumber` 或在 `parseSizeReport` 后加 `> 0` 守卫。
- **置信度**：中
- **优先级**：LOW

### L-7. `config-store.stripRemovedConfigFields` 手维护，未来字段堆积

- **位置**：`src/main/core/config/config-store.ts:35-39`
- **现象**：每废弃一个字段就改此处。`schemaVersion` 字段无版本分支（架构 §6 已承认）。
- **影响**：低——技术债。
- **建议**：引入 schemaVersion 迁移引擎，集中处理 deprecated 字段。
- **置信度**：高
- **优先级**：LOW

### L-8. `connector.runtime.deep_freeze` 对循环引用只防 object，不防 Array 自循环

- **位置**：`src/main/core/connector/runtime.ts:19-29`
- **现象**：`WeakSet` 防 object 循环，但 `Object.values` 在数组上返回元素，元素是对象才进 seen 检查。基本够用，但 primitive 数组每次都会 freeze 一遍（无害）。
- **影响**：无实际问题。
- **置信度**：高
- **优先级**：LOW

### L-9. `index.ts` 全局 `process.on("uncaughtException", ...)` 吞 EPIPE

- **位置**：`src/main/index.ts:72-75`
- **现象**：EPIPE 直接 return，不退出。对 broken pipe 场景合理，但其他 uncaught 也只 log 不退出。
- **影响**：低——主进程可能进入未定义状态。
- **建议**：考虑对非 EPIPE 错误触发 `app.quit()` + relaunch。
- **置信度**：中
- **优先级**：LOW

### L-10. `is_within_allowed` 路径前缀检查未规范化大小写（Windows）

- **位置**：`src/main/core/connector/net-client.ts:71-79`
- **现象**：`resolved.startsWith(resolved_root + sep)` 在 Windows 下若大小写不同（`C:\Users` vs `c:\users`）会误判。`resolve` 会保留原大小写。
- **影响**：低——manifest 配置的 `local.paths` 应与系统一致。
- **建议**：Windows 下 `toLowerCase()` 后比较。
- **置信度**：中
- **优先级**：LOW

### L-11. `collector.ts` `wsl_user_cache` 模块级缓存不失效

- **位置**：`src/main/core/token-stats/collector.ts:96-107`
- **现象**：第一次调 `effective_wsl_user` 后 cache 永久。若用户在 WSL 新增用户，cache 不更新。
- **影响**：低（罕见场景）。
- **建议**：cache 加 TTL 或在 `reset_config` 中清。
- **置信度**：高
- **优先级**：LOW

### L-12. `event-ipc` 主题广播遍历所有窗口但未过滤 webContents 是否已销毁中间状态

- **位置**：`src/main/ipc/event-ipc.ts:32-36`
- **现象**：`if (!win.isDestroyed())` 检查后立即 `webContents.send`，但 webContents 可能在两步之间开始销毁（极少）。
- **影响**：低——`webContents.send` 抛错会被 try/catch 捕获（外层有）。
- **置信度**：中
- **优先级**：LOW

### L-13. `index.ts` `will-quit` 二次 `app.quit()` 可能死循环

- **位置**：`src/main/index.ts:821-841`
- **现象**：`will-quit` 阻止退出等 flush 完成，再 `app.quit()`。若 flush 永远失败（catch 已吞错），finally 必触发 quit；OK。但若 flush 内部又触发新的 will-quit 事件（理论上不会），可能死循环。
- **影响**：低。
- **置信度**：中
- **优先级**：LOW

### L-14. `assert_valid_sender` 允许 `about:blank`

- **位置**：`src/main/ipc/helpers.ts:17-19`
- **现象**：`if (!url || url === "about:blank")` 抛错——好。但默认 dev server URL 派生自 `process.env["ELECTRON_RENDERER_URL"]`，若该变量被恶意设置（如父进程注入），任何 file:// 之外的 origin 都会匹配 dev URL。
- **影响**：低（env 注入需要本地权限）。
- **置信度**：中
- **优先级**：LOW

### L-15. `connector-schedule.start` 的 `Math.random()` jitter 无种子，无法复现

- **位置**：`src/main/core/scheduler/connector-scheduler.ts:34-35`
- **现象**：`Math.floor(Math.random() * STAGGER_MAX_MS)`——测试不可复现。
- **影响**：低。
- **建议**：注入随机函数或固定种子的 PRNG。
- **置信度**：高
- **优先级**：LOW

---

## 改进建议

### 架构层面

1. **明确 local-api 鉴权边界**（C-1/C-2/C-3）：当前 `handle_request` 顺序混乱，应改为「所有非 `/v1/health`、`/v1/ingest` 之外的端点都强制 Bearer token；web panel 静态资源不需 token 但 read-only 数据端点必须 token」。或彻底分两个 server（panel + ingest），不同端口不同策略。
2. **强制绑定 127.0.0.1**：恢复架构 §3 的契约，杜绝局域网暴露。
3. **沙箱升级路线图**（H-1）：`node:vm` → `isolated-vm` → 子进程，明确时间点。
4. **配置导入安全**（H-2）：在 `handleConfigImport` 后弹窗确认 `endpointOverrides` 与 secret 重录。

### 代码层面

5. **统一 IPC sender 校验**（H-3）：所有 `ipc.handle` 起手调 `assert_valid_sender`，或抽 wrapper 自动带。
6. **ProxyAgent 单例化**（H-5）：per-proxy_url 缓存 + 进程退出 close。
7. **collector 重启退避**（H-4）：连续启动失败计数 + 阈值熔断。
8. **修 session cookie 路径白名单**（M-1）：挪到 manifest。
9. **修 Windows popup 首开位置**（M-3）：tray bounds 为 0 时回退 cursor。
10. **收窄 is_auth_error / is_connection_error 关键词**（M-4/M-8）。

### 测试层面

11. **补 local-api 无鉴权回归测试**：模拟未授权请求 `/v1/secrets`、`/v1/config`，应返回 401。
12. **补 listener 绑定地址测试**：断言 server.address().address === "127.0.0.1"。
13. **补 connector 沙箱逃逸 payload 测试**（red team）：`(0,eval)("this")`、`Promise.constructor.constructor("return process")()` 等应被拦或逃逸后无 fs/child_process 能力。

---

## 不确定项 / 可能误报

1. **C-3 `source_instance_id` 信任**：架构 §4 说「外部 producer 可 `POST /v1/ingest`（Bearer）直接写观测，`source` 按 producer 标记」。如果 ingest 设计上就是「信任已通过 Bearer 认证的 producer 自报 instance id」，那 C-3 是合理设计而非 bug。但 `source_instance_id` 是 host 盖章的字段（§5），仍然矛盾。建议向产品负责人澄清。

2. **H-3 `token-stats-ipc` 缺 sender 校验**：可能有意为之（token-stats 不敏感、需要从 web panel 无登录访问）。但架构 §3 没有例外条款，且 records 含 directory 路径，仍是信息泄漏面。建议向架构负责人澄清是否例外。

3. **C-2 `/v1/config` POST 无鉴权**：web panel UI 是否需要直接 POST 修改配置？若是，应该走「同源 + token cookie」而非完全无鉴权。若 web panel 是「设置页的镜像」，那所有写操作应强制 Electron 内部走 IPC，web API 只读。不确定当前产品意图。

4. **M-3 Windows popup 首开位置**：未实际验证——可能在 `index.ts:759-764` 的 `tray.getBounds()` 返回 0 时已 fallback 到屏幕中心，所以 `position_popup` 直接 return 不会造成问题（窗口用 `getBounds()` 默认）。需要 Windows 实机验证。

5. **M-9 CSP dev ws:**：dev 模式安全要求较低，可能是有意为了 Vite HMR 灵活性。但精确匹配 dev origin 的 ws 也兼容 HMR，建议仍收紧。

6. **L-3 `file://` URL 格式**：未实际验证 Electron 是否容忍 Windows `file://C:\...` 格式，CSP 'self' 是否正确派生。可能 Electron 内部正规化了。

7. **H-1 沙箱逃逸缓解**：若产品定位是「只运行仓库官方连接器、不接受用户贡献」，H-1 风险降级到 MEDIUM（需要先获得本地写 `getUserConnectorsDir()` 权限才能投放恶意 connector，本地权限已经意味着更直接的攻击路径）。若计划开放用户贡献/第三方 connector 商店，必须升级到 isolated-vm。

8. **M-11 系统代理重探测**：可能产品策略是「让用户在设置里手动配」，detected 仅首次 hint。若是，不算 bug。

---

完成时间：2026-07-19。审阅模型：opus（通过 Agent 工具 model 参数显式指定）。
