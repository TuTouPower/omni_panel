# platform-services-api

> 验证方式：API。拆自 platform-services（t037）。

主进程宿主能力。运行时消费见 `connector-runtime.md`；session 详见 `connector-session.md`。

## LocalAPI（`src/main/core/local-api`）

监听 `0.0.0.0`，端口默认 `17863`（被占则回退 `0` 由系统分配），启动后把 port/token 交给宿主展示。Bearer token 由宿主生成、存 Vault。绑 `0.0.0.0` 是 web-panel 决策--为局域网内其它设备访问 web 面板；SSRF/认证防护另由 NetClient 层和端点级 token 负责。

- `GET /v1/health` - 健康检查（无 auth，返回 `{status, uptime}`）。
- `POST /v1/ingest` - 接收外部 producer 观测上报（`observation_ingest_schema`，服务端补 `observed_at`/`stale`/`last_error`），校验后入 ObservationStore，`source` 按 producer 标记。**Bearer token 必需**。
- `GET /v1/config` / `POST /v1/config` - 读 / 写宿主配置（复用 `config-ipc` handler）。
- `GET /v1/secrets?instanceId=...` / `POST /v1/secrets` - 读 / 写指定 instance 的 vault 明文。
- `GET /v1/records` / `/v1/sessions` / `/v1/buckets` / `/v1/status` - token-stats 面板只读查询（无 auth，intranet 决策；`env`/`agent`/`start`/`end` 作 query 过滤）。
- `GET /v1/trend?provider&accountId&metricId&days?` - sparkline 走势序列（`build_trend_series`，缺失日期填 null，默认 7 天）。
- `GET /v1/connectors` / `POST /v1/connectors` - 连接器列表 / 全量刷新（POST = `refreshAll`）。
- `GET /v1/connectors/:id/state` / `POST /v1/connectors/:id/refresh` - 单连接器快照 / 刷新。
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
