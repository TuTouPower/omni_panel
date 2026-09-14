# platform-services-api

> 验证方式：API。拆自 platform-services（t037）。

主进程宿主能力。运行时消费见 `connector-runtime.md`；session 详见 `connector-session.md`。

## LocalAPI（`src/main/core/local-api`）

监听 `0.0.0.0`，端口默认 `18263`（被占则回退 `0` 由系统分配），启动后把 port/token 交给宿主展示。Bearer token 仅用于受保护的 producer ingest；绑 `0.0.0.0` 是 web-panel 决策--为局域网内其它设备访问 web 面板。

### 共享权限基线（t473）

Web LocalAPI 与桌面 IPC 是同一受信内网应用的两种入口，配置、secret、登录、控制和连接器刷新等用户业务操作均不要求凭据；两端复用同一业务 handler，输入校验与错误分类保持有效。`/v1/ingest` 是外部 producer 上报通道，仍必须携带 Bearer token，不属于用户业务操作。桌面 secret IPC 只保留 `assert_valid_sender` 的 renderer 进程隔离，不再要求 URL `#setting` hash；敏感日志继续经 scrub/redact，破坏性导入、重启、退出和删除操作保留显式用户动作或可观察确认。

- `GET /v1/health` - 健康检查（无 auth，返回 `{status, uptime}`）。
- `POST /v1/ingest` - 接收外部 producer 观测上报（`observation_ingest_schema`，服务端补 `observed_at`/`stale`/`last_error`），校验后入 ObservationStore，`source` 按 producer 标记。**Bearer token 必需**。
- `GET /v1/config` / `POST /v1/config` - 读 / 写宿主配置（复用 `config-ipc` handler，无 auth）。
- `POST /v1/config/duplicate` / `POST /v1/config/createInstance` / `GET /v1/config/export` / `POST /v1/config/import` - 配置复制、创建、canonical v2 导出/导入（无 auth；导入仍按 endpoint override 策略确认/拒绝）。
- `GET /v1/secrets?instanceId=...` / `POST /v1/secrets` - 读 / 写指定 instance 的 vault 明文（无 auth；日志与 IPC trace 脱敏）。
- `GET /v1/records` / `/v1/sessions` / `/v1/buckets` / `/v1/status` - token-stats 面板只读查询（无 auth，intranet 决策；`env`/`agent`/`start`/`end` 作 query 过滤）。
- `GET /v1/trend?provider&accountId&metricId&days?` - sparkline 走势序列（`build_trend_series`，缺失日期填 null，默认 7 天）。
- `GET /v1/connectors` / `POST /v1/connectors` - 连接器列表 / 全量刷新（POST = `refreshAll`，无 auth）。
- `GET /v1/connectors/:id/state` / `POST /v1/connectors/:id/refresh` - 单连接器快照 / 刷新。
- `GET /v1/events` - SSE 推送（`text/event-stream`，无 auth）。每连接 `runtimeStore.subscribe`，默认 `message` 帧 `data: {instanceId, state: ConnectorSnapshotDTO}`；另可推命名事件 `config` / `theme` / `control` / `messagesUpdated`。查询参数：`connectionId`（t414 页级共享流，一连接挂多会话订阅）、`subscriberId`（t279 旧客户端专属流，仍兼容）。连接关闭时注销该连接上全部会话订阅（防 watcher 泄漏）。web 面板每页一条共享流，对齐桌面端 IPC 推送且不占满 HTTP/1.1 连接池。
- `POST /v1/sessionHistory/subscribe` - body：`source`/`env`/`session_id`/`subscriber_id`，可选 `connection_id`（t414：定位页级 SSE；缺省则按 `subscriber_id` 查专属流）。须先建立对应 `/v1/events` 连接，否则 409。同 `subscriber_id` 重复订阅先卸旧 watcher。
- `POST /v1/sessionHistory/unsubscribe` - body：`subscriber_id`；只卸该订阅方，不关 SSE 连接。
- `POST /v1/auth/*`、`POST /v1/session/*`、`POST /v1/control/*` - 登录、暂停/恢复、刷新、自启、重启/退出等宿主操作（无 auth；输入校验与显式用户动作保护不变）。
- `GET /v1/control/status` - 返回 orchestrator 暂停态（`paused`/`reasons`）与宿主自启实际状态（`available`/`enabled`），无 auth。
- `POST /v1/control/autostart` - 由主进程按 config `launchAtLogin` 双向应用 OS 登录项并返回实际状态；Linux/无 `setLoginItemSettings` 平台返回 `available:false`，不崩溃。
- 非 `/v1/` 路径 GET - web 面板 SPA 静态 fallback（web_root 存在时；`index.html` 不缓存，path-traversal 由 `is_within_web_root` 守）。
- **不支持任意上游 URL** -- 绝不变成通用开放代理。

`observation_ingest_schema = observation_schema.omit({observed_at, stale, last_error})`。

## NetClient（`src/main/core/connector/net-client.ts`，undici）

宿主统一 HTTP 出口。连接器 / 探测 / 网关 / 会话采集全部经它出网。

- endpoint 解析：`endpoint_overrides[key]` > （`requireExplicitEndpoints` 为真且无 override 则报错）> `manifest.endpoints[key]`。
- 代理：`proxy_url` -> `ProxyAgent` dispatcher。
- 超时默认 15s，`opts.timeout_ms` 可覆盖；响应体上限 50MB。
- 错误归一：status ≥ 400 抛 `HTTP <status>`；`text/html` 抛"possible interception page"；空 body 返 null。
- SSRF：`assert_safe_connector_host` 拦云元数据主机（`169.254.169.254` / `metadata.google.internal` / `metadata.azure.com`），**不拦公网/私有主机**（commit `ab96616`，已知限制见 `secret-vault.md`）。

## Logger（`src/shared/lib/logger`，commit `11ada10`）

模块化日志（scheduler / runtime / vault / session / local-api / ipc / window-manager 等），7 天滚动。

- `createLogger(module)` 工厂
- scrubber 强制内联在写入路径，不可绕过；secret 值注册后任何日志输出前替换
- `accountLabel` 等对外字段在采集校验层再查不含已注册 secret 值
- `log:renderer` 转发渲染日志，`log:export` 导出日志包

## paths（`src/main/core/paths.ts`）

集中 userData 下文件路径常量与资源定位。

- 配置/密钥：`getConfigPath`（`config.json`）、`get_vault_path`（`secrets.vault`）、`get_vault_key_path`（`vault.key`）。
- 数据：`get_observations_db_path`（`observations.sqlite`）、`get_token_stats_db_path`（当前与 observations 共享同一 SQLite 文件，A17 决策）、`get_snapshot_cache_path`（`snapshot-cache.json`）、`getStatesDir`（`states/`，连接器状态 JSON 目录）、`get_logs_dir`（`logs/`）。
- 连接器目录：`getBundledConnectorsDir`（ packaged 取 `process.resourcesPath/connectors`，dev 取项目根 `connectors/`）、`getUserConnectorsDir`（userData 下 `connectors/`）。
- 图标：`get_tray_icon_path`（`tray-icon.png`）、`get_app_icon_path`（`icon.png`），均按 `app.isPackaged` 切换 resourcesPath / 项目 `assets/`。
- `getDataRoot()` = `app.getPath("userData")`；所有 `get_*` 路径函数接受可选 `base` 参数注入测试目录。
