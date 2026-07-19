## 当前模型判断依据

主会话模型来源综合判断：

- `~/.claude/settings.json` 顶层 `model` = "opus"
- `env.ANTHROPIC_MODEL` = "default_model"
- `env.ANTHROPIC_DEFAULT_OPUS_MODEL` = "default_opus[1m]"
- 主会话 /model 命令显示 `default_opus[1m]`（含 [1m] 1M context tier 标记）

综合判断：current 路继承主会话，模型为 default_opus（即 opus 档），通过 ANTHROPIC_DEFAULT_OPUS_MODEL 解析，带 [1m] 后缀。subagent 不自行判断，只把这段原样写入报告头部。

## 审阅范围

逐文件全量审阅 `src/main/` 目录，共 47 个 `.ts` 文件，约 9650 行。

| 路径                                                | 行数 |
| --------------------------------------------------- | ---- |
| `src/main/index.ts`                                 | 849  |
| `src/main/core/logging.ts`                          | 107  |
| `src/main/core/paths.ts`                            | 68   |
| `src/main/core/settings-close-action.ts`            | 11   |
| `src/main/core/auth/grok_oauth_manager.ts`          | 533  |
| `src/main/core/config/auto-seed.ts`                 | 91   |
| `src/main/core/config/config-store.ts`              | 259  |
| `src/main/core/config/secrets-store.ts`             | 84   |
| `src/main/core/config/types.ts`                     | 120  |
| `src/main/core/connector/host-io.ts`                | 49   |
| `src/main/core/connector/manifest-loader.ts`        | 82   |
| `src/main/core/connector/net-client.ts`             | 457  |
| `src/main/core/connector/probe-executor.ts`         | 120  |
| `src/main/core/connector/runtime.ts`                | 167  |
| `src/main/core/connector/tier1-poll-executor.ts`    | 92   |
| `src/main/core/local-api/server.ts`                 | 440  |
| `src/main/core/main-panel/floating-bounds.ts`       | 68   |
| `src/main/core/main-panel/main-panel-config.ts`     | 21   |
| `src/main/core/main-panel/main-panel-controller.ts` | 239  |
| `src/main/core/main-panel/main-panel-types.ts`      | 42   |
| `src/main/core/network/effective_proxy.ts`          | 7    |
| `src/main/core/observation/observation-store.ts`    | 226  |
| `src/main/core/popup/popup-height-controller.ts`    | 240  |
| `src/main/core/scheduler/connector-scheduler.ts`    | 96   |
| `src/main/core/scheduler/endpoint-resolver.ts`      | 34   |
| `src/main/core/scheduler/hydrate-runtime-store.ts`  | 50   |
| `src/main/core/scheduler/observation-mapping.ts`    | 64   |
| `src/main/core/scheduler/refresh-service.ts`        | 420  |
| `src/main/core/scheduler/runtime-store.ts`          | 92   |
| `src/main/core/scheduler/scheduler-orchestrator.ts` | 169  |
| `src/main/core/scheduler/snapshot-cache.ts`         | 181  |
| `src/main/core/scheduler/types.ts`                  | 29   |
| `src/main/core/session/session-manager.ts`          | 217  |
| `src/main/core/storage/write-json.ts`               | 53   |
| `src/main/core/token-stats/claude-reader.ts`        | 645  |
| `src/main/core/token-stats/collector.ts`            | 306  |
| `src/main/core/token-stats/kimi-reader.ts`          | 462  |
| `src/main/core/token-stats/manager.ts`              | 131  |
| `src/main/core/token-stats/opencode-reader.ts`      | 328  |
| `src/main/core/token-stats/token-stats-store.ts`    | 470  |
| `src/main/core/vault/file-vault-backend.ts`         | 199  |
| `src/main/core/vault/vault-backend.ts`              | 8    |
| `src/main/ipc/auth-ipc.ts`                          | 128  |
| `src/main/ipc/config-ipc.ts`                        | 422  |
| `src/main/ipc/connector-ipc.ts`                     | 232  |
| `src/main/ipc/event-ipc.ts`                         | 104  |
| `src/main/ipc/grok_auth_ipc.ts`                     | 135  |
| `src/main/ipc/helpers.ts`                           | 73   |
| `src/main/ipc/log-ipc.ts`                           | 86   |
| `src/main/ipc/logged.ts`                            | 68   |
| `src/main/ipc/popup-ipc.ts`                         | 32   |
| `src/main/ipc/session-ipc.ts`                       | 71   |
| `src/main/ipc/size-validation.ts`                   | 28   |
| `src/main/ipc/token-stats-ipc.ts`                   | 63   |
| `src/main/window/window-manager.ts`                 | 152  |

按需读取了 `docs/omni_powers/op_blueprint/architecture.md` 与 `conventions.md` 对照。

## 高优先级问题（CRITICAL / HIGH）

### 1. CRITICAL — LocalAPI 监听 0.0.0.0 + `/v1/secrets` 完全无鉴权，明文外泄 vault 全部密钥

- **位置**：`src/main/core/local-api/server.ts:198-373`（`handle_request`、`handle_web_config`），`server.ts:395`（`listen(target_port, "0.0.0.0")`）
- **现象**：
    1. HTTP 服务绑定 `0.0.0.0:17863`，而非 `127.0.0.1`；
    2. `handle_web_config` 中的 `/v1/secrets?instanceId=<id>` GET 走在 `check_auth(req, token)` **之前**，直接调 `handleConfigGetSecrets` 返回 vault 内**明文密钥**；`/v1/config` GET、`/v1/config` POST、`/v1/secrets` POST、`/v1/connectors` POST、`/v1/connectors/:id/refresh` POST 等敏感读写均在鉴权闸门之前。
- **影响**：
    - 同一局域网内任何主机（含 NAT/桥接网络、虚拟机、容器、公共 Wi-Fi 中的对等节点）都能 `curl http://<victim-ip>:17863/v1/secrets?instanceId=<id>` 拉走用户存放在 vault 里的全部 API key、OAuth refresh token、session cookie；
    - 攻击者也可 POST `/v1/config` 改写 `endpointOverrides` 指向自己的服务器，等连接器下次刷新时把 secret 主动外发（绕过 `assert_safe_connector_host`，因为该函数只拦云元数据主机）；
    - 共享主机的其他本地用户也能用 `localhost` 拿到。
- **建议**：
    1. 立即把 `listen` 绑定地址从 `"0.0.0.0"` 改为 `"127.0.0.1"`（这与 `architecture.md` §3 "LocalAPI 仅 127.0.0.1" 一致）；
    2. 把 `handle_web_config`、`handle_web_connector` 中所有非静态资源的端点挪到 `check_auth` 之后；面板只读端点（`/v1/records`/sessions/buckets/status）若坚持要无鉴权，至少只返回聚合统计而非原始记录，并在 `architecture.md` 明确该例外；
    3. `/v1/secrets` 这种"明文返回 vault"端点**绝对不应**在 token 闸门外，建议直接从 HTTP API 移除，仅保留 IPC 路径。
- **置信度**：高
- **优先级**：CRITICAL

### 2. HIGH — Token stats IPC 4 个 handler 全部缺失 `assert_valid_sender`

- **位置**：`src/main/ipc/token-stats-ipc.ts:14-62`
- **现象**：`TOKEN_STATS_BUCKETS` / `TOKEN_STATS_SESSIONS` / `TOKEN_STATS_RECORDS` / `TOKEN_STATS_STATUS` 全部未调 `assert_valid_sender`，其他 IPC 文件（auth/config/connector/event/grok/log/popup/session）都做了该检查。
- **影响**：违反 `architecture.md` §3 "IPC sender 按 URL 协议白名单校验" 的边界规则。`/records`/`/sessions` 暴露用户的工作目录、模型、时间戳、message_id、parent_session_id，等同泄露工作内容画像。当前依赖 sandbox+contextIsolation，恶意渲染进程理论上仍可触发，且 standard 不一致让规则难维护。
- **建议**：四个 handler 起始处补 `assert_valid_sender(_event)`（`_event` 改为 `event: IpcMainInvokeEvent`）。
- **置信度**：高
- **优先级**：HIGH

### 3. HIGH — `POPUP_REPORT_CONTENT_HEIGHT` 未做 sender 校验，且 size 上限 10000px

- **位置**：`src/main/ipc/popup-ipc.ts:14-31`，配合 `src/main/ipc/size-validation.ts` 与 `src/main/index.ts:724-740`（`TRAY_REPORT_MENU_SIZE`）
- **现象**：`popup-ipc.ts` 的 handler 没有 `assert_valid_sender`；同类 `TRAY_REPORT_MENU_SIZE` 也未校验。任意 IPC 来源能调 `POPUP_REPORT_CONTENT_HEIGHT` 把窗口拉到 10000×10000 px。
- **影响**：DoS / UI 干扰；与 (2) 同性质的边界不一致。
- **建议**：补 `assert_valid_sender`；考虑上限收紧到现实分辨率（如 4096）。
- **置信度**：高
- **优先级**：HIGH（DoS 维度偏低，但边界一致性必须修）

### 4. HIGH — `create_connector_context` 内的 `ProxyAgent` 从不 close，长期 socket 泄漏

- **位置**：`src/main/core/connector/net-client.ts:218-223`（创建），整段 `create_connector_context` 无 `Symbol.dispose` / finally 关闭路径
- **现象**：每次 `refresh-service.execute_connector` 都调一次 `create_connector_context`，里面 `config.proxy_url` 不为空时 `new ProxyAgent({ uri, connections })`。该 dispatcher 持有独立连接池，**函数返回后无人 close**。`init_global_network` 注册的全局 Agent 被此覆盖，连接复用初衷失效。
- **影响**：启用代理的用户每次刷新都会泄漏一个 ProxyAgent（含 TCP keep-alive sockets + TLS context）；长时间运行 + 多连接器 → socket 句柄耗尽、内存增长、连不上目标。
- **建议**：要么让 `ConnectorContext` 持有 `close()` 方法，由 `execute_connector` 在 finally 调用；要么 process 生命周期内复用同一 ProxyAgent（keyed by proxy_url），由 `init_global_network` 统一管理。
- **置信度**：高
- **优先级**：HIGH

### 5. HIGH — `file-vault-backend.write_vault` 非原子写，损坏风险

- **位置**：`src/main/core/connector/../vault/file-vault-backend.ts:133-144`
- **现象**：直接 `writeFile(vault_path, json)`。`storage/write-json.ts` 提供了 `writeJsonAtomic`（tmp + rename）但此处没用。同目录 `.bak` 回退是 best-effort，主文件写一半被中断（断电、磁盘满、kill）会留下截断的 JSON，下次 `read_vault` 解析失败再尝试 `.bak`——但 `.bak` 是上一次成功写入前的状态，可能已经很旧。
- **影响**：vault 损坏 → 用户全部 secret 丢失（OAuth refresh token、API key、session cookie），不可恢复。
- **建议**：改用 `writeJsonAtomic(vault_path, data, { chmod: 0o600 })`；Windows 下 `writeJsonAtomic` 内部走 `rename`，需验证 `chmod` 是否被忽略（当前 `writeJsonAtomic` 在 `options.chmod` 才传 mode，rename 后再补 `set_file_permissions`）。
- **置信度**：高
- **优先级**：HIGH

### 6. HIGH — `loadURL` 失败时登录窗口不关闭，资源泄漏

- **位置**：`src/main/core/session/session-manager.ts:165-167`
- **现象**：
    ```ts
    void window.loadURL(request.login_url).catch((error) => {
        finish_with_error(to_error(error));
    });
    ```
    `finish_with_error` 仅 reject promise + 清 timer + 释放锁，**没有调用 `window.close()` 或 `window.destroy()`**。timeout 路径（line 159-163）调用了 close，但 loadURL 失败路径漏了。
- **影响**：登录 URL 无效、网络断开、CSP 拒绝加载时，登录窗口残留在屏幕上（且 `in_progress` 锁已释放，用户再次触发登录会叠开新窗口）。窗口引用无人持有，最终只能靠用户手动关闭或 app 退出。
- **建议**：`finish_with_error` 内统一加 `if (!window.isDestroyed()) window.close()`，或在 loadURL catch 中显式关闭。
- **置信度**：高
- **优先级**：HIGH

### 7. HIGH — `app.whenReady()` 回调内 async 流程无 try/catch，启动失败走 unhandledRejection

- **位置**：`src/main/index.ts:106-844`（整段 `void app.whenReady().then(async () => {...})`）
- **现象**：`create_file_vault_backend`、`create_observation_store`、`discover_connector_definitions`、`configStore.load()`、`local_api.start()` 任一抛错都走 `unhandledRejection`（line 77），仅 log，应用进入半启动状态（窗口没建、托盘没建、IPC 没注册），用户看到进程在跑但什么都没反应。
- **影响**：单点故障 → 整个 app 不可用且无 UI 反馈；vault key 写失败、SQLite 打开失败、连接器目录读失败等场景都会触发。
- **建议**：外层加 `try { ... } catch (err) { log.error(...); dialog.showErrorBox(...); app.quit(1); }`，或关键步骤独立 catch + 优雅降级。
- **置信度**：中（取决于实际错误率）
- **优先级**：HIGH

### 8. HIGH — `will-quit` 等待 `configStore.flushPendingSave()`，但 `hasPendingSave()` 只看 `pendingTimer`，进行中的 save 被丢

- **位置**：`src/main/core/config/config-store.ts:254-256`、`src/main/index.ts:821-841`
- **现象**：`scheduleSave` 的 setTimeout 触发后 `pendingTimer = null`，再 `void this.save(cfg)`。这段时间窗口内 `hasPendingSave()` 返回 false。`will-quit` 因此跳过等待，进程退出，正在飞的 `writeJsonAtomic` 被打断。`runtimeStore.flushPendingCache` 在 `before-quit` 调用了但**没 await**（line 814 `void`），同样会丢。
- **影响**：用户保存配置后立刻退出应用 → 配置丢失；快照缓存也丢；导致下次启动回退到旧状态。
- **建议**：
    1. `AppConfigStore` 暴露 `pendingSavePromise` 或在 `hasPendingSave` 里同时检查 `saveTail` 是否已 settle；
    2. `before-quit` 改为 `await Promise.all([runtimeStore.flushPendingCache(), ...])`；
    3. `will-quit` 检查项加入 `runtimeStore` pending cache。
- **置信度**：高
- **优先级**：HIGH

### 9. HIGH — `serve_static` 路径穿越防护是字符串前缀匹配，可被同前缀目录绕过

- **位置**：`src/main/core/local-api/server.ts:101-127`
- **现象**：
    ```ts
    const resolved = path.resolve(web_root, requested.replace(/^[/\\]+/, ""));
    if (!resolved.startsWith(web_root)) { ... }
    ```
    `startsWith` 是字符串前缀比较。若 `web_root = "D:\\app\\web"`，攻击者构造路径让 `resolved = "D:\\app\\web-secret\\x"`（同前缀不同目录），`startsWith` 通过，但实际访问的是隔壁目录。虽然 URL 类会规范化 `..`，但 Windows 下反斜杠/特殊字符组合 + URL 解码后的结果不一定被 URL 规范化覆盖。
- **影响**：理论可访问 web_root 同级目录（如 `web-private/`）下的文件；当前部署形态下风险有限，但写法不严谨。
- **建议**：改为 `path.relative(web_root, resolved)` 不以 `..` 开头，且不为空字符串以外的非 `.`/分隔符起始；或检查 `resolved === web_root || resolved.startsWith(web_root + path.sep)`。
- **置信度**：中
- **优先级**：HIGH

### 10. HIGH — `should_capture_cookie` 路径白名单只放 `/api/v1/` 和 `/_server`，覆盖不全

- **位置**：`src/main/core/session/session-manager.ts:177-185`
- **现象**：
    ```ts
    return parsed_url.pathname.includes("/api/v1/") || parsed_url.pathname === "/_server";
    ```
    硬编码两条路径，源自 Claude/智谱的登录回调。其他 provider（Kimi/MiniMax/DeepSeek 等）登录回调若用 `/api/v2/`、`/oauth/callback`、`/login/success` 等，请求头里的 Cookie 会被丢弃，`captured_cookie` 始终为 null，`save_cookie_on_close` 走 `resolve({ saved: false })` 分支，**session 登录静默失败**。
- **影响**：新 provider 接入时 cookie 登录不工作，需改源码；与 manifest 的 `cookieNames` 字段不耦合，违反"manifest 声明一切"的架构原则。
- **建议**：捕获所有同 origin 请求的 Cookie 头，由 `select_cookie_header_values` 按 `cookie_names` 过滤决定是否接受；若担心过早捕获，可要求 cookie_names 全部出现才视为成功（已实现），但 path 白名单应去掉。
- **置信度**：中（取决于现有 provider 是否都符合该路径模式）
- **优先级**：HIGH

## 中低优先级问题（MEDIUM / LOW）

### 11. MEDIUM — `opencode-reader.copy_db_to_temp` 在 query 失败时不清理临时目录

- **位置**：`src/main/core/token-stats/opencode-reader.ts:128-182`
- **现象**：`copy_path = copy_db_to_temp(...)`；若 `query_sessions(copy_path)` 返回 null（line 175），代码直接 `return via_copy ?? {...}`，**没调用 `fs.rmSync(path.dirname(copy_path), ...)`**。成功路径才清理。
- **影响**：每次 opencode 直接打开失败 + 副本打开也失败，就在 `os.tmpdir()` 留一个 `omni-usage-opencode-{env}-XXXXXX/` 目录（含 opencode.db/wal/shm，可能数 MB）。长期运行 → tmpdir 堆积。
- **建议**：把 `rmSync` 放 finally；或直接返回时统一清理。
- **置信度**：高
- **优先级**：MEDIUM

### 12. MEDIUM — `manager.ts` 子进程重启 timer 未 `unref()`，且无退出协调

- **位置**：`src/main/core/token-stats/manager.ts:83-95`
- **现象**：`child.on("exit", ...)` 内 `setTimeout(() => { start(current_config); }, 30_000)`，没 `unref()`，也没在 `stop()`/`shutdown` 时清。
- **影响**：用户退出 app 时，若子进程先 exit，30s 重启 timer 会拖延退出；`before-quit` 调 `manager.stop()` 但 stop 不清这个 timer。
- **建议**：保存 timer 引用到实例变量，`stop()` 清除；`unref()` 让事件循环不为其阻塞。
- **置信度**：高
- **优先级**：MEDIUM

### 13. MEDIUM — `effective_wsl_user` 缓存跨 distro 切换失效

- **位置**：`src/main/core/token-stats/collector.ts:96-108`
- **现象**：`wsl_user_cache ??=` 在第一次调用时赋值，`configure()` 不清缓存（只有 `reset_config()` 清）。用户在设置里改 `wslDistro`，`manager.update_config` → 子进程收到 `config` 消息 → `configure(new_cfg)` → `collect()`，但 `wsl_user_cache` 还是旧 distro 探测出的 user。
- **影响**：切换 WSL distro 后读错 home 路径，统计数据消失或错位。
- **建议**：`configure` 时若 `cfg.wsl_distro` 变化则 `wsl_user_cache = null`；或缓存 key 包含 distro。
- **置信度**：中
- **优先级**：MEDIUM

### 14. MEDIUM — `hydrate_runtime_store` 把 stale 观测标为 `status: "ready"`

- **位置**：`src/main/core/scheduler/hydrate-runtime-store.ts:30-43` + `observation-mapping.ts:25-50`
- **现象**：启动时把 `manualRefreshOnly` 连接器的所有最新观测映射为 ready 状态，包括 `stale:true` 的。`observation_to_metric_record` 直接传 `stale: obs.stale`，所以 item 上有 stale 标记，但 snapshot 状态是 "ready"。
- **影响**：UI 看到 ready + stale item，语义矛盾（"成功刷新"但"数据过期"）。可能让用户误以为数据是最新的。
- **建议**：hydrate 时若所有 items 都 stale，标 `status: "failed"` + `lastSuccess`；或新增混合状态。
- **置信度**：中
- **优先级**：MEDIUM

### 15. MEDIUM — `prune_invalid_plugins` 每次 `load()` 都跑全量健康检查

- **位置**：`src/main/core/config/config-store.ts:113-218`
- **现象**：`load()` 内无条件调 `prune_invalid_plugins(migrated.plugins)`，每个 plugin 一次 `readFile + JSON.parse + manifest_schema.safeParse`。每个 IPC handler 都 `configStore.load()`，频繁触发。
- **影响**：高频 I/O，磁盘忙时延迟放大；manifest 损坏 → 每次 load 都重新 prune + writeJsonAtomic。
- **建议**：load 缓存（带 mtime 失效），或只在启动时 prune。
- **置信度**：高
- **优先级**：MEDIUM

### 16. MEDIUM — `handleConfigSave` 的字段合并对数组字段（plugins）整体替换

- **位置**：`src/main/ipc/config-ipc.ts:120-150`
- **现象**：`merged[key] = incoming[key]` 是顶层字段级合并，但 `plugins` 数组整体替换。两个窗口同时编辑不同 plugin → 后写者覆盖前写者的 plugin 改动。
- **影响**：并发保存竞争（罕见但存在，特别是 IPC + Web API 并存后）。
- **建议**：要么按 `instanceId` 深合并 plugins；要么显式声明 "config 写入串行单源" 并在 UI 层强制。
- **置信度**：中
- **优先级**：MEDIUM

### 17. MEDIUM — `assert_safe_connector_host` 只拦 3 个元数据主机，IPv6/其他云厂商漏拦

- **位置**：`src/main/core/connector/net-client.ts:106-115`
- **现象**：仅拦 `169.254.169.254`、`metadata.google.internal`、`metadata.azure.com`。漏：`fd00:ec2::254`（AWS IPv6 IMDS）、`100.100.100.200`（阿里云）、`169.254.170.2`（ECS task metadata）、`[fd00:ec2::254]` 等。代码注释也承认"public attacker-controlled host 不拦"。
- **影响**：恶意导入配置可把连接器 endpoint 重定向到云元数据 → secret 泄漏（其他云厂商）。
- **建议**：扩展黑名单，并在导入配置时强制 secret 重录（与 `architecture.md` §6 待办一致）。
- **置信度**：中
- **优先级**：MEDIUM

### 18. MEDIUM — `index.ts` 启动时探测系统代理只做一次，配置改变不重探

- **位置**：`src/main/index.ts:170-180`
- **现象**：`detected_system_proxy` 在 whenReady 内一次性赋值，之后 `currentConfigSnapshot` 是动态的但 `detected_system_proxy` 是闭包常量。
- **影响**：用户改系统代理后必须重启 app，否则 OAuth/连接器仍走旧代理。
- **建议**：定时重探（如每 5min）或在 `onConfigSaved` 时重探。
- **置信度**：中
- **优先级**：MEDIUM

### 19. MEDIUM — `observation-store` migration 只检查 `raw_label` 一列

- **位置**：`src/main/core/observation/observation-store.ts:101-108`
- **现象**：
    ```ts
    if (!column_names.has("raw_label")) {
        db.exec(MIGRATE_ADD_LABEL_COLUMNS_SQL);
    ```
    `MIGRATE_ADD_LABEL_COLUMNS_SQL` 一次加三列（raw/normalized/display），但只在 `raw_label` 缺失时执行。若历史 DB 已加 `raw_label` 但缺 `normalized_label`（部分迁移中断），不会补加。
- **影响**：极老 DB 中断升级后，`normalized_label` 列缺失，insert 时 `@normalized_label` bind 失败。
- **建议**：三列分别检查，分别 ALTER。
- **置信度**：中
- **优先级**：MEDIUM

### 20. MEDIUM — `observation-store.prune` SQL 性能差，无索引覆盖

- **位置**：`src/main/core/observation/observation-store.ts:155-162`
- **现象**：`DELETE FROM observations WHERE observed_at < ? AND id NOT IN (SELECT id FROM ... WHERE MAX(...))`，子查询对全表 group by 多字段。现有索引 `idx_lookup` 覆盖 (provider, account_id, metric_id, source_instance_id, observed_at)，但 prune 的子查询不带 source_instance_id 前缀，无法走索引。
- **影响**：表大时 prune 阻塞写入（WAL 下仍会锁）。
- **建议**：保留每个 (provider, account_id, metric_id, source_instance_id) 最新 id 的辅助表或索引；或用窗口函数。
- **置信度**：中
- **优先级**：MEDIUM

### 21. MEDIUM — `enqueue_token_mutation` 用 `previous.then(mutation, mutation)` 在失败链上继续跑，可能跑同一 mutation 两次

- **位置**：`src/main/core/auth/grok_oauth_manager.ts:228-245`
- **现象**：then 的两个参数都是 mutation，意图"无论前次成败都跑"。但若前次 mutation reject（如 vault 写失败），当前 mutation 仍跑——前次副作用没生效，本次再试。看似 OK，但若 mutation 内部依赖前次已完成（如 advance_token_generation），可能跳号。
- **影响**：理论上影响 token generation 单调性，从而让 in-flight token 检查误判。
- **建议**：mutation 内做幂等检查，或对 vault 失败做明确放弃路径。
- **置信度**：低（需要具体失败场景触发）
- **优先级**：MEDIUM

### 22. LOW — `isFinitePositiveNumber` 命名误导（允许 0，非 "positive"）

- **位置**：`src/main/ipc/size-validation.ts:1-3`
- **现象**：函数名说 positive，实际 `value >= 0`（非负）。
- **建议**：改名为 `isFiniteNonNegativeNumber`，或加注释。
- **置信度**：高
- **优先级**：LOW

### 23. LOW — `index.ts` 主进程 `uncaughtException` 仅 log，不退出

- **位置**：`src/main/index.ts:72-82`
- **现象**：Electron 主进程 uncaughtException 后内部状态可能已损坏，继续跑可能行为异常。
- **建议**：严重错误时 `dialog.showErrorBox` 后 `app.quit()`；或至少把错误计数上报。
- **置信度**：中
- **优先级**：LOW

### 24. LOW — `file-vault-backend.set_file_permissions` 未校验 USERNAME 字符

- **位置**：`src/main/core/vault/file-vault-backend.ts:41-58`
- **现象**：`username = process.env["USERNAME"] ?? process.env["USER"] ?? ""`，直接拼到 icacls 参数。execFile 不走 shell 所以无 shell 注入，但 icacls 自身解析参数时对特殊字符（空格、引号）可能误解。
- **建议**：username 加正则白名单 `^[A-Za-z0-9_\-\.\\]+$`，不匹配则 fallback `chmod` 或抛错。
- **置信度**：低
- **优先级**：LOW

### 25. LOW — `compile_script` 正则不匹配多行 import type

- **位置**：`src/main/core/connector/runtime.ts:39-55`
- **现象**：`/^import\s+type\s+[^;]+;\s*$/gm` 单行匹配。多行 `import type { X } from "y";` 不被剥离 → 触发 "cannot use import" 抛错。安全（失败而非绕过）但限制连接器作者写法。
- **建议**：用 TypeScript parser 或更宽松的正则。
- **置信度**：高
- **优先级**：LOW

### 26. LOW — `grok_oauth_manager.make_default_http_post` 每次请求重建 ProxyAgent

- **位置**：`src/main/core/auth/grok_oauth_manager.ts:122-150`
- **现象**：每次 post_form 内 `new ProxyAgent(proxy_url)` → finally `dispatcher.close()`。与 (4) 同类问题，但 OAuth 频次低，影响小。
- **建议**：进程级缓存 ProxyAgent（按 proxy_url）。
- **置信度**：高
- **优先级**：LOW

### 27. LOW — `event-ipc` 广播 state 变化到所有窗口，含无关的 tray_menu

- **位置**：`src/main/ipc/event-ipc.ts:18-49`
- **现象**：`BrowserWindow.getAllWindows().forEach(...)`，包括 tray_menu、settings、main_panel、agent。tray_menu 不需要 state 变化，多一次 IPC 序列化。
- **建议**：维护"订阅 state 变化"的窗口集合（main_panel + popup 等）。
- **置信度**：高
- **优先级**：LOW

### 28. LOW — `index.ts` tray `right-click` 修改 `tray.getBounds()` 返回对象

- **位置**：`src/main/index.ts:757-765`
- **现象**：`trayBounds.x = primary.workArea.x + ...` 直接赋值到返回对象。Electron 文档未保证返回新对象，可能影响内部状态。
- **建议**：构造新对象 `{ ...trayBounds, x: ..., y: ... }`。
- **置信度**：低
- **优先级**：LOW

### 29. LOW — `runtime-store` `getSnapshot` 未命中返回 `{ status: "idle" }` 共享同一对象字面量？非共享（每次新建）

- **位置**：`src/main/core/scheduler/runtime-store.ts:42-44`
- **现象**：`return states.get(instanceId) ?? { status: "idle" };`——每次都新建字面量，OK；但若消费者修改返回值，下次 get 仍返回新对象，不影响。OK。
- **建议**：可缓存一个共享 idle 常量减少分配。
- **置信度**：高
- **优先级**：LOW

### 30. LOW — `connector-scheduler.start` jitter 仅基于 `timers.size > 0`，刚停所有 timer 后启动无 jitter

- **位置**：`src/main/core/scheduler/connector-scheduler.ts:32-47`
- **现象**：第一只 connector 启动时 `timers.size === 0`，jitter = 0，立即触发；若同时多个 start 串行调用，第二只才有 jitter。orchestrator.startAll 顺序启动 → 第一只无 jitter。轻微。
- **建议**：始终带小随机。
- **置信度**：高
- **优先级**：LOW

### 31. LOW — `index.ts:138` `create_file_vault_backend` 在 whenReady 内但无独立 catch

- **位置**：`src/main/index.ts:138`
- **现象**：见 (7)，单独点出来因为 vault 是关键路径。
- **置信度**：高
- **优先级**：LOW（已被 7 覆盖）

### 32. LOW — `assert_valid_sender` 未校验 sender frame 的 origin 是否包含恶意 file:// 子路径

- **位置**：`src/main/ipc/helpers.ts:15-28`
- **现象**：`url.startsWith("file://")` 直接放行所有 file 协议。Electron 渲染进程在 file:// 下加载，但若有第三方 file:// HTML 被注入（如用户本地 HTML 文件被打开），仍能调 IPC。
- **建议**：进一步比对 `url` 是否等于 `rendererIndexPath`（已知白名单）。
- **置信度**：低
- **优先级**：LOW

### 33. LOW — `parse_body` 在 reject 后仍可能收到 `data` 事件，缺少 `req.destroy()`

- **位置**：`src/main/core/local-api/server.ts:56-77`
- **现象**：超过 MAX_BODY_BYTES 后 `req.pause()` + reject。pause 只暂停 flow，socket buffer 仍可能继续填充。攻击者持续发数据 → 内存占用。
- **建议**：reject 时 `req.destroy()` 强制关闭连接。
- **置信度**：中
- **优先级**：LOW

### 34. LOW — `read_body_with_limit` 把 chunk 转 Uint8Array 但用 Buffer.concat

- **位置**：`src/main/core/connector/net-client.ts:33-53`
- **现象**：chunks 是 `Uint8Array[]`，`Buffer.concat(chunks)` 在新版 Node 下接受 Uint8Array，但旧版本只接受 Buffer。文档契约不稳定。
- **建议**：明确保存为 Buffer。
- **置信度**：低
- **优先级**：LOW

## 改进建议

### 架构层面

1. **LocalAPI 鉴权与绑定全面收紧**（关联 1、2、3）：所有非静态 GET 端点必须经过 token；`/v1/secrets` 这种明文返回 vault 的端点直接从 HTTP API 移除；监听地址固化为 `127.0.0.1`。在 `architecture.md` §3 增加明确条目："LocalAPI 仅 127.0.0.1，Bearer token 闸门统一应用于所有非 /v1/health 与静态资源端点"。当前代码偏离架构文档，必须二选一：改代码 或 改文档（强烈建议改代码）。

2. **资源生命周期显式化**（关联 4、6、11、12）：`ConnectorContext` / `ProxyAgent` / 登录窗口 / 临时目录 / 重启 timer 都需要明确的 dispose 路径。建议引入轻量的 `AsyncDisposable` 模式或统一的 shutdown hook 注册表。

3. **IPC sender 校验作为通用 wrapper**（关联 2、3）：把 `assert_valid_sender` + `createLoggedIpcHandler` 合成单一工厂函数，所有 `ipcMain.handle` 必须经过它，避免 token-stats/popup 这种漏网。

4. **配置写入与持久化的真实串行化**（关联 8、16）：`AppConfigStore.hasPendingSave` 必须反映所有进行中的写操作；考虑引入 `flush()` 显式接口让 `will-quit` 等待。

5. **vault 写入原子化**（关联 5）：`file-vault-backend` 改用 `writeJsonAtomic`，与 `config-store`、`snapshot-cache` 一致。

### 一致性 / 可维护性

6. **session-manager 路径白名单去掉**（关联 10），让 manifest `cookieNames` 成为唯一契约。

7. **observation-store migration 列分别检查**（关联 19），三列 ALTER 拆成独立语句。

8. **hydrate stale 状态显式化**（关联 14），避免 ready + stale item 的语义矛盾。

9. **name 严格化**（关联 22、24、29、30），命名与语义对齐。

### 测试

10. 关键安全路径需要集成测试：LocalAPI 0.0.0.0 + 无鉴权 + /v1/secrets、IPC sender 伪造、vault 中断写入恢复、ProxyAgent 资源累积。当前测试纪律偏向业务逻辑，安全边界用例缺口大。

### 文档

11. `architecture.md` §3 的 LocalAPI 行与 §6 "已知限制：导入配置可重定向端点"应补充当前实际状况（0.0.0.0 + 无鉴权 + /v1/secrets 暴露）作为 P0 待办，而非默默存在。

## 不确定项 / 可能误报

1. **(1) LocalAPI 监听 0.0.0.0 是否产品意图**：代码注释 `// Web read endpoints serve the panel UI without auth (intranet use per project decision)` 暗示是有意"内网共享面板"。即便如此，`/v1/secrets` 明文端点位于无鉴权区也是明显 bug。建议向用户确认：LocalAPI 是定位"本机 only"还是"内网共享"，前者改 127.0.0.1，后者把敏感端点（secrets/config 写）挪到鉴权后并加 CSRF 防护。置信度高：`/v1/secrets` 无论哪种定位都不该这样裸奔。

2. **(10) `should_capture_cookie` 路径白名单**：现有内置 13 个连接器里，session 类的 provider 实际登录回调路径未全部确认。若所有内置 provider 都恰好走 `/api/v1/` 或 `/_server`，则不影响当前用户，但仍限制新接入。建议结合实际 provider 列表核验后再改。

3. **(14) hydrate stale 标 ready**：可能 UI 层已根据 item.stale 单独处理显示，未读取 renderer 代码无法确认是否真有"矛盾"。建议对照 `src/renderer/` 进一步确认。

4. **(20) prune SQL 性能**：未在实际数据规模下测过。若单用户 typical 规模 < 10 万行影响可忽略。

5. **(28) tray.getBounds() 返回对象**：Electron 不同版本行为不同，未实测。建议保守起见仍构造新对象。

6. **(33) `req.pause()` vs `req.destroy()`**：未压测，pause 在大多数场景足够，destroy 是更激进的选择。

7. **未覆盖范围**：
    - 本审阅只看 `src/main/`。`src/preload/` 的白名单严格性、`src/renderer/` 的 XSS/数据脱敏、`src/shared/` 的 schema 完备性需要独立审阅才能判断 main 暴露的接口是否被下游正确使用。
    - 未跑 `pnpm check` 与 `pnpm test` 验证静态/动态状态。
    - 未对照 `tests/` 评估覆盖率盲点。
    - 连接器 `connectors/*/manifest.json` 与 `connector.ts` 不在范围，secret 处理、auth 注入、错误恢复的"另一半"在那些文件里。
