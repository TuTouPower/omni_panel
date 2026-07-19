# 连接器运行时（connector runtime）

连接器执行的共享机制。每个连接器 spec（`connector-*.md`）只写自己的 endpoint/metric/解析，运行时契约看这里。

## 接口

### manifest schema（`src/shared/schemas/manifest.ts`，`.strict()`）

顶层 key：`id`、`provider`（= `usageProviderSchema` ∪ `"cpa"`）、`capabilities`（`["poll"|"local"|"session"|"observe"]`，≥1）、`parameters[]`、`endpoints?`（record<string,url>）、`requireExplicitEndpoints?`、`manualDefault?`、`script?`、`poll?`、`observe?`、`local?`。`.refine`：声明的 poll/local/observe 能力必须有对应配置（session 无此约束）。

- `parameter`：`name` / `type`（`secret`|`string`|`number`）/ `required`（默认 false）/ `label` / `label@zh-Hans` / `default` / `exposeToScript`（默认 **false**）。
- `poll.request`：`endpoint` / `path` / `method`（GET|POST，默认 GET）/ `auth?` / `body?`；`poll.map`：`used`/`limit`/`remaining` 若存在须以 `$` 开头。
- `auth`：`type`（bearer|query|header）/ `secret` / `header_name?` / `query_param?`。
- `observe`：`headers[]`（≥1）/ `probe?`。`local`：`paths[]`（≥1）。

### ConnectorContext（`src/main/core/connector/host-io.ts`，注入脚本的 `ctx`）

- `ctx.http.get_json/post_json(endpoint_key, path[, body], opts?)` → `unknown`；`get_raw(endpoint_key, path, opts?)` → `{status, headers(全小写), body}`。`opts = {headers?, timeout_ms?, reset?}`。
- `opts.reset`：跳过 undici 全局连接池，强制新建 TCP+TLS 连接。由 refresh-service 在连续两次连接级错误后自动注入，连接器脚本一般不需直接使用。
- `ctx.files.read(pathPattern) → string`；`list(pathPattern) → string[]`。
- `ctx.params: Record<string,string>`（非 secret 参数 + `exposeToScript:true` 的 secret 明文）。
- `ctx.log.debug/info/warn/error`；`ctx.trace_id?`。

### 脚本输出（`script_observation_schema`，snake_case，无 `source_instance_id`）

`provider` / `account_id` / `account_label` / `metric_id` / `raw_label` / `normalized_label` / `display_label?` / `window`（second|day|month|total）/ `used`(number|null) / `limit`(number|null) / `display_style`（percent|ratio）/ `reset_at`(number|null) / `status`（normal|warning|critical|unknown）/ `observed_at`(number) / `source` / `stale` / `last_error`。宿主 `.extend({source_instance_id})` 得 `observation_schema`。

## 行为（现在是什么）

- **沙箱**：`node:vm`（`vm.createContext` + `runInContext`），非 isolated-vm。`ctx` 经 `deep_freeze`。**非真隔离**（见 `architecture.md` §6）。
- **编译**：`typescript.transpileModule`（CommonJS/ES2022），非 esbuild，**无 SHA-256 缓存**。编译前正则剥 `import type`/`declare const`；含 `import`/`export` 语句即抛错；包裹成 `(async()=>{...; if(typeof main==="function") return await main();})()`。
- **超时**：`DEFAULT_TIMEOUT_MS = 15_000`（15s），双重（vm 同步超时 + Promise race）。
- **能力分发**（`refresh-service.execute_connector`）：有 `script` → 跑脚本；否则 `poll` → `tier1-poll-executor`（宿主发 HTTP，`resolve_json_path` 取 `map`，盖 `observed_at`/`source:"poll"`）；否则 `observe.probe` → `probe-executor`（取响应头，`source:"probe"`）；否则报错。`local`/`session` 无独立 executor——都靠 script 分支 + `ctx.files`/vault cookie。
- **observedAt 盖章**：poll/probe 路径宿主 `Date.now()`；script 路径脚本自填。`source_instance_id` 一律宿主盖（= `connector_config.instanceId`）。
- **secret 注入**：`build_params` 仅 `exposeToScript:true` 的 secret 从 vault 取明文进 `ctx.params`；其余 secret 走 `ctx.http` 宿主侧 `apply_auth`（bearer/header/query），脚本看不到。
- **完整性校验**：**未实现**（无 SHA-256 清单/签名）。唯一防护是脚本路径逃逸检查（script 路径不得逃出连接器目录）。

## NetClient（`net-client.ts`，undici）

- 全局 `Agent`（`init_global_network()`）：`connections=6`（每 origin 上限）+ `keepAliveTimeout=30s`，在主进程启动早期 `setGlobalDispatcher`。连接复用后 TLS 握手从「每请求一次」降到「每 origin 几次」。
- endpoint 解析优先级：`endpoint_overrides[key]` > （`requireExplicitEndpoints` 为真且无 override 则报错）> `manifest.endpoints[key]`。
- 代理：`proxy_url` → `ProxyAgent` dispatcher，同样传 `connections: 6`。超时默认 15s，可 `opts.timeout_ms` 覆盖；响应体上限 50MB。
- **连接池 reset**：`NetClientConfig.reset` 或 `opts.reset` 为 true 时，undici 请求传 `{reset:true}` 跳过全局连接池，强制新建 TCP+TLS 连接。连接级错误重试时由 refresh-service 自动注入（需连续两次连接错误才升级）。
- 错误归一：status ≥ 400 抛 `HTTP <status>`；`text/html` 响应抛"possible interception page"；空 body 返回 null。
- SSRF：`assert_safe_connector_host` 拦云元数据主机（`169.254.169.254`/`metadata.google.internal`/`metadata.azure.com`），**不拦公网/私有主机**（见 `architecture.md` §6 已知限制）。

## 数据模型映射

`observation-mapping.ts` `observation_to_metric_record`：drop 非白名单 provider；`id = ${source_instance_id}:${account_id}:${metric_id}`；产出 `MetricRecord`。`observations_to_ready_state` → `{items, updatedAt=max(observed_at)}`。

## 边界

- 单实例串行锁 5 分钟（`refresh-service`）；`refreshAll` 并发上限 5。
- 连接器脚本扇出节流：脚本内并发 HTTP 请求应使用 `map_with_limit(items, limit, fn)` 闸门（`Promise.race` 实现），避免大量请求同时对同 origin 发起 TLS 握手。参考 `connectors/opencode_go/connector.ts` 的 `bundle_limit=4` 实现。
- script / poll / probe 及观测写库失败统一最多尝试 3 次，相邻尝试固定等待 1s；三次均失败才向 runtime-store 写 `failed`，错误取最后一次失败。
- 连接级错误（`ECONNRESET`/`EPROTO`/`ETIMEDOUT`/`socket hang up`/`UND_ERR_SOCKET`/`UND_ERR_CONNECT`/`tls`/`ssl`）触发 `force_fresh_connection`，后续重试向 undici 传 `{reset:true}` 跳过连接池。**需连续两次连接错误才升级**，非连接级错误重置连续计数。
- session 连接器首次出现 auth 错误（消息含 401/unauthorized/token/credential/auth）且有 `sessionLogin` 依赖 → 每轮刷新最多触发一次重新登录；保存成功后额外等待 2s，再继续剩余通用尝试。
