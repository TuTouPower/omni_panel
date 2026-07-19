# Sonnet 审阅报告 — src/main/

## 当前模型判断依据

主会话模型来源综合判断：

- `~/.claude/settings.json` 顶层 `model` = "opus"
- `env.ANTHROPIC_MODEL` = "default_model"
- `env.ANTHROPIC_DEFAULT_OPUS_MODEL` = "default_opus[1m]"
- 主会话 /model 命令显示 `default_opus[1m]`（含 [1m] 1M context tier 标记）
  综合判断：主会话模型为 default_opus。本路（sonnet）通过 Agent 工具 model 参数显式指定为 sonnet。subagent 不自行判断，只把这段原样写入报告头部。

## 审阅范围

全量审阅 `src/main/` 下 55 个 TypeScript 源文件，共 9,865 行。逐文件、逐函数、逐段审阅，无抽样。

### 文件清单与行数

| 文件                                     | 行数 |
| ---------------------------------------- | ---- |
| core/auth/grok_oauth_manager.ts          | 532  |
| core/config/config-store.ts              | 258  |
| core/config/secrets-store.ts             | 83   |
| core/config/types.ts                     | 119  |
| core/config/auto-seed.ts                 | 90   |
| core/connector/net-client.ts             | 456  |
| core/connector/runtime.ts                | 166  |
| core/connector/manifest-loader.ts        | 81   |
| core/connector/host-io.ts                | 48   |
| core/connector/probe-executor.ts         | 119  |
| core/connector/tier1-poll-executor.ts    | 91   |
| core/local-api/server.ts                 | 439  |
| core/observation/observation-store.ts    | 225  |
| core/session/session-manager.ts          | 216  |
| core/vault/file-vault-backend.ts         | 198  |
| core/vault/vault-backend.ts              | 7    |
| core/scheduler/refresh-service.ts        | 419  |
| core/scheduler/scheduler-orchestrator.ts | 168  |
| core/scheduler/connector-scheduler.ts    | 95   |
| core/scheduler/runtime-store.ts          | 91   |
| core/scheduler/snapshot-cache.ts         | 180  |
| core/scheduler/hydrate-runtime-store.ts  | 49   |
| core/scheduler/observation-mapping.ts    | 63   |
| core/scheduler/endpoint-resolver.ts      | 33   |
| core/scheduler/types.ts                  | 28   |
| core/token-stats/claude-reader.ts        | 644  |
| core/token-stats/collector.ts            | 305  |
| core/token-stats/kimi-reader.ts          | 461  |
| core/token-stats/opencode-reader.ts      | 327  |
| core/token-stats/manager.ts              | 130  |
| core/token-stats/token-stats-store.ts    | 469  |
| core/logging.ts                          | 106  |
| core/paths.ts                            | 67   |
| core/network/effective_proxy.ts          | 6    |
| core/settings-close-action.ts            | 10   |
| core/main-panel/main-panel-controller.ts | 238  |
| core/main-panel/main-panel-types.ts      | 41   |
| core/main-panel/main-panel-config.ts     | 20   |
| core/main-panel/floating-bounds.ts       | 67   |
| core/popup/popup-height-controller.ts    | 239  |
| core/storage/write-json.ts               | 52   |
| window/window-manager.ts                 | 151  |
| index.ts                                 | 848  |
| ipc/config-ipc.ts                        | 421  |
| ipc/connector-ipc.ts                     | 231  |
| ipc/auth-ipc.ts                          | 127  |
| ipc/grok_auth_ipc.ts                     | 134  |
| ipc/event-ipc.ts                         | 103  |
| ipc/session-ipc.ts                       | 70   |
| ipc/log-ipc.ts                           | 85   |
| ipc/popup-ipc.ts                         | 31   |
| ipc/token-stats-ipc.ts                   | 62   |
| ipc/helpers.ts                           | 72   |
| ipc/logged.ts                            | 67   |
| ipc/size-validation.ts                   | 27   |

**合计：9,865 行**

---

## 高优先级问题（CRITICAL / HIGH）

### [H-01] Local API 绑定 0.0.0.0，违反架构约束，且多数端点无认证

- **位置**: `src/main/core/local-api/server.ts:395`
- **现象**: `active_server.listen(target_port, "0.0.0.0")` 将 HTTP 服务绑定到所有网络接口。`architecture.md` 第 3 节明确声明 "LocalAPI: 仅 127.0.0.1"。
- **影响**: 局域网内任意设备均可访问 web panel 和 API。以下端点**无 Bearer 认证**：
    - `/v1/health`（GET）
    - 静态文件（GET 非 /v1/ 路径）
    - `/v1/records`, `/v1/sessions`, `/v1/buckets`, `/v1/status`（GET，读 token 统计）
    - `/v1/config`（GET 读取完整配置 + POST **写入配置**）
    - `/v1/secrets`（GET **读取明文密钥** + POST **写入密钥**）
    - `/v1/connectors`（GET/POST，列出连接器 + 全量刷新）
    - `/v1/connectors/:id/state`, `/v1/connectors/:id/refresh`（GET/POST）

    仅 `/v1/ingest`（POST）要求 Bearer token。代码注释 "Web read endpoints serve the panel UI without auth (intranet use per project decision)" 说明这是有意设计，但 0.0.0.0 绑定使"内网"假设不成立——公共 WiFi、VPN、Docker bridge 网络均可触及。

- **建议**: 将 `listen` 地址改为 `"127.0.0.1"` 以符合 architecture.md；或至少为写入端点（POST /v1/config, POST /v1/secrets, POST /v1/connectors/:id/refresh）添加 Bearer 认证。
- **置信度**: 确定
- **优先级**: **CRITICAL**

### [H-02] Token Stats IPC handlers 未校验 sender

- **位置**: `src/main/ipc/token-stats-ipc.ts:18-62`
- **现象**: 4 个 IPC handler（`TOKEN_STATS_BUCKETS`, `TOKEN_STATS_SESSIONS`, `TOKEN_STATS_RECORDS`, `TOKEN_STATS_STATUS`）均未调用 `assert_valid_sender(event)`。同目录其他 IPC 模块（config-ipc.ts, connector-ipc.ts, auth-ipc.ts, grok_auth_ipc.ts, session-ipc.ts, log-ipc.ts）均正确调用。
- **影响**: 如果 preload 白名单存在边界漏洞（如 route 能力策略配置错误），恶意 renderer 可直接查询 token 统计数据。
- **建议**: 每个 handler 开头加 `assert_valid_sender(event)`。
- **置信度**: 确定
- **优先级**: **HIGH**

### [H-03] Grok OAuth billing endpoint 安全硬编码只覆盖 grok 连接器

- **位置**: `src/main/core/scheduler/refresh-service.ts:152-154`
- **现象**:
    ```ts
    if (definition.manifest.provider === "grok") {
        delete endpoint_overrides["grok_billing"];
    }
    ```
    硬编码删除 grok 的 billing endpoint override，防止 OAuth token 泄露到自定义主机。但其他使用 bearer auth 的连接器（如未来新增的 OAuth 连接器）没有类似保护。
- **影响**: `architecture.md` 第 6 节已指出 "endpointOverrides 可被导入的恶意配置改指公网攻击主机，apply_auth 会把 vault secret 发过去"。当前仅 grok 有缓解。
- **建议**: 提取为通用机制——对所有 bearer 类型 auth 的连接器，当 endpoint override 与 manifest 声明不同时，弹出用户确认或拒绝连接。
- **置信度**: 确定（architecture.md 已记录为已知限制）
- **优先级**: **HIGH**

---

## 中低优先级问题（MEDIUM / LOW）

### [M-01] collector.ts 使用 console.error/console.warn，违反编码约定

- **位置**: `src/main/core/token-stats/collector.ts:197, 231, 248`
- **现象**: utilityProcess 子进程内使用 `console.error` 和 `console.warn`。`conventions.md` §3 明确 "禁止 print/console.log 调试输出，一律走 logger"。
- **影响**: 子进程日志不走主进程日志系统，无法被日志文件捕获、不享受 scrubber 脱敏、不参与 7 天滚动清理。
- **建议**: 子进程内创建本地 logger 实例，或通过 parentPort 将日志转发主进程。
- **置信度**: 确定
- **优先级**: **MEDIUM**

### [M-02] 子进程 30 秒自动重启 timer 未在 shutdown 时清理

- **位置**: `src/main/core/token-stats/manager.ts:86-93`
- **现象**: collector 子进程退出后设置 30 秒重启 timer。`stop()` 函数只 kill 子进程并将 `current_config = null`，但不 clearTimeout。如果用户在 30 秒内 quit，timer 回调检查 `if (current_config)` 会跳过重启（因为已被置 null），但仍会执行 setTimeout 回调。
- **影响**: 影响极小——回调检查 current_config 后会跳过。但 timer 本身不会被 GC 回收直到触发。shutdown 时的 `log.warn` 会多打一次。
- **建议**: `stop()` 中清除 timer 引用。
- **置信度**: 确定
- **优先级**: **MEDIUM**

### [M-03] auto_seed_connectors 连接器匹配使用 substring/includes

- **位置**: `src/main/core/config/auto-seed.ts:32-37`
- **现象**:
    ```ts
    base_name.includes(def.manifest.id) || connector.name.toLowerCase() === def.manifest.id;
    ```
    如果一个连接器 manifest id 为 `"claude"`，另一个为 `"claude-code"`，`base_name.includes("claude")` 会误匹配 `"claude-code"` 目录。
- **影响**: 升级新增连接器时可能将旧连接器的 config 条目映射到错误的新连接器定义。当前 13 个内置连接器 id 均无前缀包含关系，但用户连接器目录名可能触发。
- **建议**: 使用精确匹配（目录名 === manifest.id 或 name === manifest.id.toUpperCase()），去掉 includes。
- **置信度**: 中等（当前连接器 id 无冲突，但设计脆弱）
- **优先级**: **MEDIUM**

### [M-04] 配置导入非原子——config 与 secrets 分开持久化

- **位置**: `src/main/ipc/config-ipc.ts:354-356`
- **现象**: `handleConfigImport` 先 `configStore.save(parsed.data)` 再 `secretsStore.importAll(secrets)`。如果 secrets 导入失败（如 vault 文件权限问题），config 已写入但 secrets 未更新，应用处于不一致状态。
- **影响**: 导入失败时连接器可能引用不存在的 secret，导致下次刷新全部 401。
- **建议**: 先验证 secrets 可写入（dry-run 或先写入临时区域），成功后再写 config；或至少在 secrets 失败时回滚 config。
- **置信度**: 确定
- **优先级**: **MEDIUM**

### [M-05] token-stats-store 和 observation-store 共享同一数据库文件路径

- **位置**: `src/main/index.ts:249` (`create_token_stats_store(get_observations_db_path())`)
- **现象**: 两个 store 都使用 `get_observations_db_path()` 返回的 `observations.sqlite`。better-sqlite3 同进程多实例共享文件无损，但命名易混淆。
- **影响**: 无功能影响，但增加维护困惑。未来若将 observation store 和 token stats store 迁移到不同文件（如独立备份策略），需同时修改两处。
- **建议**: 添加 `get_token_stats_db_path()` 路径函数，或在 paths.ts 中注释说明共享关系。
- **置信度**: 确定
- **优先级**: **LOW**

### [M-06] 日志文件大小限制后 silent drop

- **位置**: `src/main/core/logging.ts:70-79`
- **现象**: 当日志文件超过 50MB 时，后续写入被静默跳过（只 warn 一次）。不会创建新日志文件，也不会轮转。
- **影响**: 长时间运行且日志量大时，最后的诊断信息丢失。debug 模式下 50MB 可能在数小时内达到。
- **建议**: 超限后轮转到 `app-{date}.1.log`，或截断旧日志保留尾部。
- **置信度**: 确定
- **优先级**: **LOW**

### [M-07] claude-reader 和 kimi-reader 大量重复代码

- **位置**: `src/main/core/token-stats/claude-reader.ts`, `src/main/core/token-stats/kimi-reader.ts`
- **现象**: 两个 reader 各 ~460-640 行，存在大量结构重复：
    - `extract_user_text()` — 完全相同
    - `calendar_date_of()` — 完全相同
    - `num()` — 完全相同
    - `message_id_from_line()` — 完全相同
    - `truncate_title()` — 完全相同
    - `SessionFileFacts` / `KimiFileFacts` 结构几乎相同
    - `merge_session_files` / `merge_kimi_session` 逻辑类似
    - mtime 增量扫描框架（`collect_*_files` + dirty set + by_session map + merge）完全同构
- **影响**: 改一处忘改另一处的风险高。两个 reader 都有相同的 edge case 处理需求。
- **建议**: 抽取 `shared/token-stats/reader-utils.ts` 放公共函数；扫描框架可泛化为 `incremental_jsonl_scanner<T>`。
- **置信度**: 确定
- **优先级**: **MEDIUM**

### [M-08] clamp 函数在 3 个文件中重复定义

- **位置**: `src/main/core/main-panel/main-panel-controller.ts:23`, `src/main/core/main-panel/floating-bounds.ts:13`, `src/main/core/popup/popup-height-controller.ts:170`
- **现象**: 三个文件各自定义了完全相同的 `clamp(value, lo, hi)` 函数。
- **建议**: 提取到一个共享 math 工具模块。
- **置信度**: 确定
- **优先级**: **LOW**

### [M-09] opencode-reader 日历日期注释与 claude-reader 实现不一致

- **位置**: `src/main/core/token-stats/opencode-reader.ts:119` 注释 "UTC calendar date"，`src/main/core/token-stats/claude-reader.ts:247` 注释 "Local calendar date"
- **现象**: 两个 reader 的 `calendar_date_of` 实现完全相同（均使用 `new Date(ts)` + `getMonth()`/`getDate()` 等本地时间方法），但注释声称 opencode 用 UTC、claude 用本地时间。
- **影响**: 如果用户在 UTC+N 时区，跨日的 token 可能被分到错误的 bucket。注释与实现不符增加维护困惑。
- **建议**: 统一注释，确认哪个行为是正确的，然后对齐。
- **置信度**: 中等（需确认实际期望行为）
- **优先级**: **MEDIUM**

### [M-10] endpoint-resolver.ts 导出但未被使用

- **位置**: `src/main/core/scheduler/endpoint-resolver.ts`（33 行）
- **现象**: `resolveRuntimeEnv` 函数只在 `src/main/core/scheduler/endpoint-resolver.ts` 中定义并导出，但搜索 src/main/ 下无任何文件导入它。可能是旧子进程执行路径的遗留代码。
- **影响**: 无功能影响，但增加 dead code。
- **建议**: 确认是否为遗留代码，若是则删除。
- **置信度**: 中等（可能在 tests 或 connectors 中引用）
- **优先级**: **LOW**

### [M-11] config-store load() 每次执行 prune_invalid_plugins 异步 I/O

- **位置**: `src/main/core/config/config-store.ts:47-72`
- **现象**: `load()` 内调用 `prune_invalid_plugins()` 对每个 plugin 并行读取 manifest.json 并 Zod 校验。每次 config 变更后 `onConfigSaved` → 各处 `configStore.load()` 都会触发此逻辑。
- **影响**: 频繁 load 时（如 config save → onConfigSaved → 多个 listener 各自 load），每次都会读磁盘校验 manifest。当前 plugin 数量少（<20），性能影响可忽略，但设计上不应在热路径做。
- **建议**: 将 prune 逻辑从 load() 移到首次 load 或 auto_seed 后一次性执行。
- **置信度**: 中等
- **优先级**: **LOW**

### [M-12] connector-ipc 中 assert_valid_sender 在 logged wrapper 内部调用

- **位置**: `src/main/ipc/connector-ipc.ts:199-230`
- **现象**: `assert_valid_sender(e)` 在 `logged()` callback 内部调用，而 `config-ipc.ts` 中 `assert_valid_sender(e)` 在 `logged()` 外部调用。两种模式功能等价（异常都会冒泡），但风格不一致。
- **影响**: 无功能影响，代码风格一致性问题。
- **建议**: 统一为在 logged wrapper 外部调用（更清晰的防御边界）。
- **置信度**: 确定
- **优先级**: **LOW**

### [M-13] isFinitePositiveNumber 允许 0

- **位置**: `src/main/ipc/size-validation.ts:1-3`
- **现象**: `isFinitePositiveNumber` 检查 `value >= 0`（包含 0），但函数名暗示 "positive" 不含 0。
- **影响**: `parseSizeReport` 用于验证 popup/tray 菜单尺寸。宽或高为 0 的窗口虽不合理但不会崩溃（Electron 可能 clamp）。不构成 bug，但语义不精确。
- **建议**: 要么改名为 `isFiniteNonNegativeNumber`，要么改为 `value > 0`。
- **置信度**: 确定
- **优先级**: **LOW**

---

## 改进建议

### [S-01] 统一 IPC handler 注册模式

当前 IPC 注册有三种风格：

1. `assert_valid_sender` 在 `logged()` 外部（config-ipc.ts）
2. `assert_valid_sender` 在 `logged()` callback 内部（connector-ipc.ts）
3. 无 `assert_valid_sender`（token-stats-ipc.ts）

建议提取一个 `createSecureIpcHandler(channel, deps, fn)` 装饰器，统一处理 sender 验证 + 日志 + 错误包装。

### [S-02] vault.importAll 增加 dry-run 模式

`secrets-store.ts:importAll` 先清空再写入。建议增加 `previewImport(decrypted)` 方法，在实际写入前验证所有 key-value 可用，减少回滚概率。

### [S-03] local-api 写入端点加 rate limit

`/v1/config` POST 和 `/v1/secrets` POST 无频率限制。局域网内（如果修复了 0.0.0.0 问题）或本地恶意脚本可反复写入配置。

### [S-04] refresh-service 中 with_concurrency 使用 Promise.race 的 cleanup

`refresh-service.ts:389-405` 的 `with_concurrency` 使用 `executing.delete(p)` 在 then 中清理。若 `fn(item)` 永不 resolve（如连接器脚本超时但 race_with_timeout 未触发），该 Promise 永远占 slot。当前有 15s vm timeout + 5min lock timeout 双重保护，但建议加总超时。

### [S-05] session-manager should_capture_cookie 路径匹配硬编码

`session-manager.ts:182` 硬编码 `/api/v1/` 和 `/_server` 作为 cookie 捕获路径。如果目标网站登录后 cookie 的 API 路径不同，捕获会失败。建议从 manifest 声明 `cookieCapturePaths`，由连接器定义者指定。

---

## 不确定项 / 可能误报

### [U-01] config-store concurrent write detection 使用 JSON.stringify 比较

- **位置**: `src/main/ipc/config-ipc.ts:147`
- **现象**: `JSON.stringify(reloaded) !== JSON.stringify(current)` 检测并发写入。JSON.stringify 的 key 顺序取决于插入顺序，如果 load() 内的 `sortKeys()` 对 key 排序，且两次 load 之间字段顺序稳定，则比较有效。但如果中间有任何非确定性字段（如 Date 对象），stringify 结果可能不稳定。
- **当前风险**: 低。config schema 全部是 string/number/boolean/array/object，无 Date 类型。`sortKeys()` 保证了确定性排序。但建议改为比较 config schema version + hash。

### [U-02] connector runtime vm 沙箱逃逸

- **位置**: `src/main/core/connector/runtime.ts:31-37`
- **现象**: `node:vm` 官方文档明确声明不是安全边界。`deep_freeze(ctx)` 冻结注入对象，但脚本可通过 `(0,eval)("this")` 获取主进程 globalThis。
- **影响**: architecture.md §6 已记录为已知限制。当前 13 个内置连接器均为可信代码。用户连接器（`userDir`）有风险。
- **状态**: 已知限制，非本次审阅发现。待 `isolated-vm` 或子进程隔离替代。

### [U-03] vault 写入非原子——先写 .bak 再写主文件

- **位置**: `src/main/core/vault/file-vault-backend.ts:133-143`
- **现象**: `write_vault` 先写 `.bak` 再写主文件（非 rename-at-once）。如果进程在两者之间崩溃，`.bak` 是新数据而主文件是旧数据。重启时 read_vault 读主文件（旧数据），.bak 保留新数据——数据不丢失但不一致。
- **影响**: 极低概率事件。与 writeJsonAtomic（先 .tmp 再 rename）相比，vault 未使用原子写。
- **建议**: 改为 writeJsonAtomic 模式（写 tmp → rename）。

### [U-04] Grok OAuth await_completion 的 sleep timer 使用 .unref()

- **位置**: `src/main/core/auth/grok_oauth_manager.ts:301`
- **现象**: `timer.unref()` 使 timer 不阻止进程退出。如果应用在 poll 期间 quit，timer 不会延迟退出。这是正确行为，但与 refresh-service 的 `setTimeout`（未 unref）不一致。
- **影响**: 无。Electron 主进程退出由 `app.quit()` 控制，unref 与否影响可忽略。

### [U-05] observation-store 迁移代码可能在已有列上失败

- **位置**: `src/main/core/observation/observation-store.ts:48-53`
- **现象**: `MIGRATE_ADD_LABEL_COLUMNS_SQL` 执行 `ALTER TABLE ADD COLUMN`，如果列已存在会抛异常。代码通过先检查 `column_names` 来避免，但如果多个实例同时启动（理论上被 single-instance lock 阻止），可能有竞态。
- **影响**: 极低。single-instance lock 确保串行。

---

## 总结

整体代码质量较高：架构分层清晰（connector sandbox / scheduler / observation / vault / IPC 各司其职），错误处理覆盖全面（config-store 的 .bak 恢复、vault 的 rollback、refresh-service 的重试 + stale 观测），TypeScript 类型使用严谨（Zod schema 校验 + 类型收窄）。

最需要关注的问题：

1. **local-api 绑定 0.0.0.0 + 多数端点无认证**——违反 architecture.md 安全约束
2. **token-stats-ipc 缺少 sender 验证**——IPC 安全边界遗漏
3. **仅 grok 连接器有 endpoint override 安全保护**——缓解措施未泛化
