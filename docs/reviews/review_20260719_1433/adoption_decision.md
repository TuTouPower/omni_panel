# 审阅结果决策

## 目录

docs/reviews/review_20260719_1433

## 报告来源

- 已读：current.md / haiku.md / sonnet.md / opus.md
- 缺失：无

## 统计

- 采纳：21 项
- 不采纳：24 项
- 待决定：18 项

合并去重规则：位置相同（同文件+行号）视为同一问题；优先级不一致取最高（保守）。来源标注：current / haiku / sonnet / opus。

---

## 待决定项（请先决策）

### D1. LocalAPI 监听 0.0.0.0（违反 architecture.md §3）

C

- 来源：current, haiku, sonnet, opus
- 位置：`src/main/core/local-api/server.ts:395`
- 优先级：CRITICAL（4 路一致）
- 详细判断理由：代码 `listen(target_port, "0.0.0.0")` 监听所有网卡，与 architecture.md §3 "LocalAPI 仅 127.0.0.1" 直接矛盾。但代码注释 "intranet use per project decision" 暗示内网共享可能是有意决策。涉及产品定位（本机 only vs 内网共享），不宜单方面定，需用户裁决。
- 选项：
    - A 改为 `listen(port, "127.0.0.1")`，本机 only，符合架构契约
    - B 保留 0.0.0.0，所有端点加 Bearer 鉴权 + CSRF 防护（明确内网共享定位，需同步改 architecture.md）
    - C 保留 0.0.0.0，仅静态资源 + `/v1/health` 无鉴权，其余加 token（混合）

- 推荐：A
- 推荐理由：桌面应用默认本机 only 最安全，与 architecture.md §3 一致；内网共享非核心需求，且 LAN 暴露面大（公共 Wi-Fi、VPN、Docker bridge 均可触及）。

### D2. LocalAPI 写/敏感端点位于 check_auth 之前（含 `/v1/secrets` 明文返回 vault）

继续无鉴权

- 来源：current, sonnet, opus
- 位置：`src/main/core/local-api/server.ts:208-373`（handle_request 顺序）
- 优先级：CRITICAL
- 详细判断理由：`/v1/secrets` GET 在 `check_auth` 之前执行，返回 vault 内全部 secret 明文；`/v1/config` POST、`/v1/secrets` POST、`/v1/connectors/:id/refresh` POST 等写端点也无鉴权。注释称"web read endpoints ... without auth"，但实际含写操作。即使 D1 选 127.0.0.1，本机其他用户/进程仍可访问。修复范围有取舍。
- 选项：
    - A `/v1/secrets*`、`/v1/config*`、`/v1/connectors*` 全部挪到 `check_auth` 之后；`/v1/secrets` GET 直接从 HTTP API 移除
    - B 仅移除 `/v1/secrets` GET，其余保留无鉴权（最小改动）
    - C 所有 `/v1/*` 非静态端点统一加 Bearer token
- 推荐：A
- 推荐理由：明文 secret 外泄是 P0，写端点无鉴权等同可被篡改（改 endpointOverrides 即可外发 secret），A 覆盖最完整。

### D3. ProxyAgent 泄漏（create_connector_context + grok_oauth_manager）

- 来源：current, haiku, opus
- 位置：`src/main/core/connector/net-client.ts:212-223`、`src/main/core/auth/grok_oauth_manager.ts:122-150`
- 优先级：HIGH
- 详细判断理由：两处每次请求/刷新都新建 ProxyAgent，net-client 路径从不 close（socket/TLS 句柄泄漏），grok 路径每次 close（连接复用失效）。修复方案有取舍，需选生命周期管理策略。
- 选项：
    - A 进程级缓存 ProxyAgent by proxy_url，shutdown 时统一 close
    - B ConnectorContext 持有 close()，execute_connector finally 调用
    - C 全局单例 dispatcher + per-request override
- 推荐：A
- 推荐理由：复用率最高，grok_oauth 与 connector 可共用同一缓存，shutdown 清理路径简单。

### D4. app.whenReady 回调内 async 流程无 try/catch

- 来源：current
- 位置：`src/main/index.ts:106-844`
- 优先级：HIGH
- 详细判断理由：vault/observation/connector/configStore.load/local_api.start 任一抛错走 unhandledRejection（仅 log），应用进入半启动僵死（无窗口/托盘/IPC）。启动失败处理策略影响面大，需用户选。
- 选项：
    - A 外层 try/catch + `dialog.showErrorBox` + `app.quit(1)`
    - B 关键步骤独立 catch + 优雅降级（vault 失败禁用 secret、SQLite 失败禁用存储）
    - C 维持现状，仅完善 unhandledRejection 日志
- 推荐：A
- 推荐理由：启动失败应明确告知用户并退出，避免半启动僵死无反馈；B 更理想但改动大，可作为后续。

### D5. should_capture_cookie 路径白名单硬编码

- 来源：current, sonnet, opus
- 位置：`src/main/core/session/session-manager.ts:177-185`
- 优先级：HIGH（合并 current HIGH、opus/sonnet MEDIUM）
- 详细判断理由：硬编码 `/api/v1/` + `/_server`，其他 session 连接器（Cursor/Windsurf 等）登录回调若用不同路径，cookie 永远捕不到，登录静默失败。current 不确定项 2 提出现有 13 内置连接器实际路径未全部确认。修复需先核验现有 provider。
- 选项：
    - A 去掉路径白名单，捕获所有同 origin 请求 Cookie，按 manifest cookie_names 过滤
    - B 挪到 manifest（新增 session.capture_path_prefixes 字段）
    - C 维持现状，文档记录限制
- 推荐：B（执行前需先 grep 现有 connector manifest 确认 cookie 路径分布）
- 推荐理由：符合 conventions.md "manifest 声明一切" 原则，扩展性强。

### D6. calendar_date_of 时区跨 reader 不一致

- 来源：haiku, sonnet
- 位置：`src/main/core/token-stats/claude-reader.ts:247`、`kimi-reader.ts:90`、`opencode-reader.ts:119`
- 优先级：HIGH（合并 haiku HIGH、sonnet MEDIUM）
- 详细判断理由：haiku 指出 claude/kimi 用本地时区、opencode 用 UTC（实现不一致）；sonnet 指出两者实现相同但注释矛盾。token-stats-store migration v2 注释明确"日桶已从 collector-local 迁 UTC"。两份报告对实现判断不同，需先读代码确认实际行为。
- 选项：
    - A 三个 reader 统一 UTC（与 migration v2 一致）
    - B 统一本地时区
    - C 维持现状，仅修正注释一致
- 推荐：A（执行前需先读三处实现 + token-stats-store migration v2 注释确认目标）
- 推荐理由：migration v2 已确立 UTC 基准，claude/kimi 未同步是遗留；跨来源日桶柱状图才能正确对齐。

### D7. collector 子进程 console.error 违反日志约定

- 来源：haiku, sonnet
- 位置：`src/main/core/token-stats/collector.ts:196, 231, 247`
- 优先级：HIGH（合并 haiku HIGH、sonnet MEDIUM）
- 详细判断理由：违反 conventions.md §3"禁止 console.log，一律走 logger"。但 collector 是 utilityProcess 子进程，能否初始化主进程 logger 需架构确认，修复方案有取舍。
- 选项：
    - A collector postMessage 日志到主进程，主进程 logger 落盘
    - B 子进程内初始化独立 logger 实例（共享 logging 模块）
    - C 维持 console.error，由 manager stderr 捕获（现状）
- 推荐：A
- 推荐理由：结构化日志，享受 scrubber 脱敏 + 7 天轮转；B 需验证 utilityProcess logger 初始化可行性。

### D8. 连接器沙箱逃逸（node:vm 非安全边界）

- 来源：opus, sonnet（已知限制）
- 位置：`src/main/core/connector/runtime.ts:31-55`
- 优先级：HIGH
- 详细判断理由：architecture.md §6 已记录为已知限制。当前缓解（禁 import/export + 超时 + deep_freeze）对 `(0,eval)("this")` 等标准逃逸无效。若只跑官方连接器降级 MEDIUM；用户连接器目录（getUserConnectorsDir）已开放则需升级。需用户选路线。
- 选项：
    - A 短期加 AST 拦 (0,eval)/Function/Promise.constructor，中期迁 isolated-vm
    - B 维持 node:vm，文档强化"仅运行官方连接器"约束
    - C 直接迁子进程隔离
- 推荐：A
- 推荐理由：用户连接器目录已开放，AST 检查是低成本短期缓解；isolated-vm 是中期正解。

### D9. endpointOverrides 导入无 SSRF 校验（secret 外发链）

- 来源：current, sonnet, opus（含 sonnet H-03 grok 硬编码只覆盖 grok）
- 位置：`src/main/ipc/config-ipc.ts:314-362`、`src/main/core/connector/net-client.ts:106-115`
- 优先级：HIGH
- 详细判断理由：导入配置时 endpointOverrides 指向攻击者主机，触发 refresh 即把 vault secret 外发。assert_safe_connector_host 仅拦 3 个云元数据主机。grok 删除 grok_billing override 是仅有的缓解，未泛化。architecture.md §6 已记为待办。涉及产品流程（导入确认 + 重录 secret）。
- 选项：
    - A 导入配置时若 endpointOverrides 含非 manifest 默认主机，弹窗确认 + 强制重录 secret
    - B 扩展 assert_safe_connector_host 覆盖 RFC1918 外公网主机，用户白名单
    - C 维持现状（architecture.md 已记为待办）
- 推荐：A
- 推荐理由：用户显式确认优于静默黑名单，重录 secret 切断外发链。

### D10. ingest 信任客户端 source_instance_id

- 来源：opus
- 位置：`src/main/core/local-api/server.ts:169-196`
- 优先级：HIGH
- 详细判断理由：外部 producer 可写入任意 source_instance_id，污染目标实例观测。但 architecture.md §4 暗示"信任已认证 producer 自报"，§5 又说 source_instance_id 归宿主。契约矛盾，需架构澄清。
- 选项：
    - A server 覆盖 source_instance_id 为 `external:<token-hash>` 前缀
    - B 维持信任已认证 producer 自报（确认架构契约后）
    - C schema 拒绝与 host 实例 id 重复的值
- 推荐：B（先向产品/架构负责人澄清 ingest 契约，确认后再决定是否改 A）
- 推荐理由：architecture.md §4 暗示信任 producer，贸然改可能破坏既有 producer 集成。

### D11. handleConfigSave 数组字段（plugins）整体替换

- 来源：current, opus
- 位置：`src/main/ipc/config-ipc.ts:120-150`
- 优先级：MEDIUM
- 详细判断理由：两窗口并发编辑不同 plugin 时后写者覆盖前写者。涉及 UI 协调策略。
- 选项：
    - A 按 instanceId 深合并 plugins
    - B UI 层强制串行编辑，config 写入串行单源
    - C 维持现状（并发罕见）
- 推荐：C
- 推荐理由：单用户桌面应用并发竞争概率低，改动成本高于收益。

### D12. detected_system_proxy 启动时只探测一次

B

- 来源：current, opus
- 位置：`src/main/index.ts:170-180`
- 优先级：MEDIUM
- 详细判断理由：用户运行中切换系统代理（开关 Clash）不会被重探。但用户可在设置手动配 proxy.url。opus 不确定项 8 提示可能有意。
- 选项：
    - A 定时（5min）重探
    - B onConfigSaved 时重探
    - C 维持现状，文档说明需重启或手动配 proxy.url
- 推荐：C
- 推荐理由：用户可手动配 proxy.url，自动重探收益有限且增加复杂度。

### D13. config-store schema 校验失败后无条件覆盖 .bak

- 来源：haiku
- 位置：`src/main/core/config/config-store.ts:188-190`
- 优先级：MEDIUM
- 详细判断理由：主文件损坏而 .bak 有效时，第一次启动恢复成功，但损坏主文件内容会覆盖有效 .bak，下次再损坏则无备份。损坏恢复能力从两次降为一次。
- 选项：
    - A 恢复成功后不将损坏数据写入 .bak
    - B 轮转备份（.bak.1/.bak.2）
    - C 维持现状
- 推荐：A
- 推荐理由：低成本，避免有效 .bak 被损坏数据覆盖。

### D14. handleConfigImport config + secrets 非原子

- 来源：sonnet
- 位置：`src/main/ipc/config-ipc.ts:354-356`
- 优先级：MEDIUM
- 详细判断理由：先 configStore.save 再 secretsStore.importAll，secrets 失败时 config 已写，应用不一致（连接器引用不存在 secret → 下次刷新全 401）。
- 选项：
    - A 先 dry-run 验证 secrets 可写，再写 config
    - B secrets 失败时回滚 config
    - C 维持现状
- 推荐：B
- 推荐理由：回滚逻辑清晰，保证 config 与 secrets 一致。

### D15. claude-reader / kimi-reader 大量重复代码

- 来源：sonnet
- 位置：`src/main/core/token-stats/claude-reader.ts`、`kimi-reader.ts`
- 优先级：MEDIUM
- 详细判断理由：extract_user_text/calendar_date_of/num/message_id_from_line/truncate_title 完全相同，扫描框架同构。改一处忘改另一处风险高。属重构，范围有取舍。
- 选项：
    - A 抽取 `shared/token-stats/reader-utils.ts` 公共函数
    - B 额外泛化 `incremental_jsonl_scanner<T>` 扫描框架
    - C 维持现状
- 推荐：A（可与 D6 一并做，统一时区时同步抽取）
- 推荐理由：完全相同函数抽取风险低、收益明确；B 可后续。

### D16. Windows 下 popup 首开位置不可预测（tray.getBounds 返回 0）

- 来源：opus
- 位置：`src/main/core/main-panel/main-panel-controller.ts:102-116`
- 优先级：MEDIUM
- 详细判断理由：Windows 下 Tray.getBounds() 返回 0（index.ts:759 注释已承认），position_popup 直接 return，首开位置停默认。opus 不确定项 4 指出需 Windows 实机验证是否真有问题。
- 选项：
    - A tray bounds 为 0 时回退 `screen.getCursorScreenPoint()`
    - B 回退主屏右下角
    - C 维持现状（需 Windows 实机验证）
- 推荐：C
- 推荐理由：未实机验证前不改，避免引入新问题；验证确认有问题再选 A。

### D17. scheduler-orchestrator shutdown 与 schedule_next 回调竞态

- 来源：haiku（改进建议 9）
- 位置：`src/main/core/scheduler/scheduler-orchestrator.ts:167`、`connector-scheduler.ts:50-63`
- 优先级：MEDIUM
- 详细判断理由：stopAll 遍历 timers Map 时，若 schedule_next 回调恰好新增条目，新条目不被清理。shutdownStarted 标志仅拦新 start/rebuild，已排队 setTimeout 回调不受控。
- 选项：
    - A stopAll 改 while 循环 + 重新检查 Map 大小
    - B clearTimeout 前快照所有 key
    - C 维持现状（shutdownStarted 已拦新 start/rebuild）
- 推荐：B
- 推荐理由：快照简单，避免遍历中 Map 变化。

### D18. endpoint-resolver.ts 疑似死代码

- 来源：haiku, sonnet
- 位置：`src/main/core/scheduler/endpoint-resolver.ts`
- 优先级：LOW
- 详细判断理由：当前架构用 node:vm 同进程沙箱，endpoint 通过 ConnectorContext 传入，resolveRuntimeEnv 无任何 import。可能在 tests/connectors 引用，需 grep 确认。
- 选项：
    - A grep 确认全仓无引用后删除
    - B 加 @deprecated 注释保留
    - C 维持现状
- 推荐：A（执行前 grep 确认）
- 推荐理由：无引用即删，减少维护负担。

---

## 采纳项

### A1. token-stats-ipc 4 handler 补 assert_valid_sender

- 来源：current, haiku, sonnet, opus
- 位置：`src/main/ipc/token-stats-ipc.ts:14-62`
- 优先级：CRITICAL（haiku 标 CRITICAL，其他 HIGH，合并取最高）
- 详细判断理由：4 路 unanimous。4 个 handler（TOKEN_STATS_BUCKETS/SESSIONS/RECORDS/STATUS）缺 sender 校验，违反 architecture.md §3 契约，与其他 7 个 IPC 模块不一致。records/sessions 含目录路径、会话标题等敏感画像。
- 修复说明：4 个 handler 起始处加 `assert_valid_sender(event)`；将 `_event: unknown` 改为 `event: IpcMainInvokeEvent`。

### A2. popup-ipc 补 assert_valid_sender + 收紧尺寸上限

- 来源：current
- 位置：`src/main/ipc/popup-ipc.ts:14-31`
- 优先级：HIGH
- 详细判断理由：POPUP_REPORT_CONTENT_HEIGHT 缺 sender 校验，任意 IPC 来源可把窗口拉到 10000×10000 px。与 A1 同性质边界缺口。
- 修复说明：handler 起始加 `assert_valid_sender(event)`；`size-validation.ts` 上限从 10000 收紧到 4096（现实分辨率上限）。

### A3. file-vault-backend 改用 writeJsonAtomic

- 来源：current, haiku, sonnet
- 位置：`src/main/core/vault/file-vault-backend.ts:133-144`
- 优先级：HIGH（合并 current HIGH、haiku MEDIUM）
- 详细判断理由：直接 writeFile 非原子，写一半中断 → vault 损坏 → 全部 secret 丢失不可恢复。storage/write-json.ts 已提供 writeJsonAtomic（tmp + rename），config-store/snapshot-cache 都在用，唯 vault 例外。
- 修复说明：`write_vault` 改用 `writeJsonAtomic(vault_path, data, { chmod: 0o600 })`；Windows 下验证 chmod 是否被忽略（writeJsonAtomic options.chmod 才传 mode，rename 后 set_file_permissions 补）；.bak 回退逻辑保留。

### A4. loadURL 失败时关闭登录窗口

- 来源：current, opus
- 位置：`src/main/core/session/session-manager.ts:165-167`
- 优先级：HIGH（合并 current HIGH、opus MEDIUM）
- 详细判断理由：loadURL catch 走 finish_with_error，只 reject + 清 timer + 释放锁，不关窗。窗口残留 + 锁已释放 → 用户再次触发叠开新窗。timeout 路径有关窗，loadURL 失败路径漏。
- 修复说明：finish_with_error 内统一加 `if (!window.isDestroyed()) window.close()`。

### A5. will-quit 等待 flush 覆盖进行中 save + runtimeStore await

- 来源：current
- 位置：`src/main/core/config/config-store.ts:254-256`、`src/main/index.ts:814, 821-841`
- 优先级：HIGH
- 详细判断理由：hasPendingSave 只看 pendingTimer，save 进行中（timer 已清但 save 未完成）返回 false → will-quit 跳过等待 → writeJsonAtomic 被打断。runtimeStore.flushPendingCache 在 before-quit 用 `void`（line 814）未 await，同样丢。
- 修复说明：AppConfigStore 暴露 `pendingSavePromise` 或在 hasPendingSave 检查 saveTail 是否 settle；`before-quit` 改 `await runtimeStore.flushPendingCache()`；will-quit 检查项加 runtimeStore pending cache。

### A6. serve_static 路径穿越收紧

- 来源：current, opus
- 位置：`src/main/core/local-api/server.ts:101-127`
- 优先级：HIGH（合并 current HIGH、opus MEDIUM）
- 详细判断理由：`resolved.startsWith(web_root)` 是字符串前缀比较，可被同前缀目录（web vs web-secret）绕过；Windows 大小写不敏感而 startsWith 敏感。
- 修复说明：改为 `const rel = path.relative(web_root, resolved); if (rel.startsWith("..") || path.isAbsolute(rel)) return 403;` 或 `resolved === web_root || resolved.startsWith(web_root + path.sep)`。

### A7. opencode-reader copy_db_to_temp 失败时清理临时目录

- 来源：current
- 位置：`src/main/core/token-stats/opencode-reader.ts:128-182`
- 优先级：MEDIUM
- 详细判断理由：query_sessions 返回 null 时直接 return，未调 fs.rmSync 清理 copy_path，tmpdir 堆积 omni-usage-opencode-\* 目录（含 db/wal/shm，数 MB）。
- 修复说明：把 `fs.rmSync(path.dirname(copy_path), { recursive: true, force: true })` 放 finally，或 early return 前统一清理。

### A8. effective_wsl_user 缓存随 wslDistro 变化失效

- 来源：current, opus
- 位置：`src/main/core/token-stats/collector.ts:96-108`
- 优先级：MEDIUM（合并 current MEDIUM、opus LOW）
- 详细判断理由：wsl_user_cache 首次赋值后不随 configure 失效，用户改 wslDistro 后读错 home 路径，统计数据消失或错位。
- 修复说明：configure 时若 cfg.wsl_distro 变化则 `wsl_user_cache = null`；或缓存 key 包含 distro。

### A9. observation-store migration 三列分别检查

- 来源：current, haiku, sonnet
- 位置：`src/main/core/observation/observation-store.ts:101-108`
- 优先级：MEDIUM
- 详细判断理由：MIGRATE_ADD_LABEL_COLUMNS_SQL 一次加三列但只在 raw_label 缺失时执行，部分迁移中断（已有 raw_label 缺 normalized_label）不会补，insert 时 bind 失败。
- 修复说明：三列（raw_label/normalized_label/display_label）分别 PRAGMA table_info 检查，分别 ALTER。

### A10. auto-seed 精确匹配（去 includes）

- 来源：haiku, sonnet, opus
- 位置：`src/main/core/config/auto-seed.ts:28-37`
- 优先级：MEDIUM
- 详细判断理由：base_name.includes(def.manifest.id) 会误匹配（cpa 匹配 cpadapter、claude 匹配 claude-code）。用户删过的连接器可能因目录名包含 id 而"复活"。
- 修复说明：改为精确匹配 `base_name === def.manifest.id` 或平台感知的 endsWith(`/` + id) / endsWith(`\\` + id)。

### A11. refresh-service 错误分类关键词收窄

- 来源：haiku, opus
- 位置：`src/main/core/scheduler/refresh-service.ts:54-76`
- 优先级：MEDIUM
- 详细判断理由：is_auth_error 的 `lower.includes("auth")` 过宽（误判 "batch auth rate limited" 等）；is_connection_error 的 "tls"/"ssl" 过宽。误判触发不必要 re-login 或连接重建。
- 修复说明：is_auth_error 精确匹配 HTTP 401 + manifest 定义的 auth error 关键词，去掉泛 "auth"；is_connection_error 去掉 "tls"/"ssl" 泛匹配，改为匹配 undici 错误码 UND_ERR_SOCKET/UND_ERR_CONNECT + errno ECONNRESET/ENOTFOUND 等。

### A12. connector-scheduler jitter timer 纳入 timers Map

- 来源：opus
- 位置：`src/main/core/scheduler/connector-scheduler.ts:43-47`
- 优先级：MEDIUM
- 详细判断理由：jitter > 0 时 setTimeout(do_refresh, jitter) 未存入 timers Map，stop/stopAll 只清 interval timer，shutdown 时 jitter timer 仍可能触发 refresh。
- 修复说明：jitter timer 存入 timers Map（或单独 pending-immediate 集合），shutdown 一并 clearTimeout。

### A13. manager 子进程重启 timer 清理 + unref

- 来源：current, haiku, sonnet
- 位置：`src/main/core/token-stats/manager.ts:83-95`
- 优先级：MEDIUM
- 详细判断理由：child.on exit 内 setTimeout 重启未 unref、未在 stop 清，before-quit 调 stop 但不清此 timer，拖延退出。
- 修复说明：保存 timer 引用到实例变量，stop() clearTimeout，加 unref()。

### A14. collector 崩溃无退避重启 → 加熔断

- 来源：opus
- 位置：`src/main/core/token-stats/manager.ts:83-95`
- 优先级：HIGH
- 详细判断理由：固定 30s 无限重启，启动即崩（native binding 缺失/WSL 路径异常）会无限循环 + 日志爆炸。与 A13 同位置不同维度。
- 修复说明：记录连续退出间隔，若 start_time - exit_time < 5min 计入失败次数，达阈值（如 5 次）后停止重启 + log.error。

### A15. CSP dev 模式 ws: 通配收紧

- 来源：opus
- 位置：`src/main/index.ts:122`
- 优先级：MEDIUM
- 详细判断理由：dev `connect-src 'self' ${devOrigin} ws:` 允许任意 ws:// 主机，Vite HMR 实际只需 devOrigin。
- 修复说明：改为 `ws://${devHost}:` 精确匹配 dev origin。

### A16. grok_oauth_manager schedule_retry 加最大重试次数

- 来源：opus
- 位置：`src/main/core/auth/grok_oauth_manager.ts:437-449`
- 优先级：MEDIUM
- 详细判断理由：refresh 失败（非 terminal_grant）递归 schedule 60s 重试无上限，token 永久失效但非 terminal 类错误（5xx）会无限轮询。
- 修复说明：加连续失败计数器，达阈值后停止 auto_refresh + log。

### A17. token-stats-store 与 observation-store 共享 DB 路径加注释

- 来源：sonnet
- 位置：`src/main/index.ts:249`、`src/main/core/paths.ts`
- 优先级：LOW
- 详细判断理由：两 store 都用 get_observations_db_path()，命名易混淆，未来迁移需同改两处。
- 修复说明：paths.ts 加注释说明共享关系，或新增 get_token_stats_db_path() 暂返回同一路径。

### A18. isFinitePositiveNumber 改名（语义对齐）

- 来源：current, sonnet, opus
- 位置：`src/main/ipc/size-validation.ts:1-3`
- 优先级：LOW
- 详细判断理由：函数名说 positive，实际 `value >= 0`（含 0），命名误导。
- 修复说明：改名为 `isFiniteNonNegativeNumber`，更新所有调用方。

### A19. tray.getBounds() 不修改返回对象

- 来源：current
- 位置：`src/main/index.ts:757-765`
- 优先级：LOW
- 详细判断理由：直接赋值到 trayBounds 返回对象，Electron 不保证返回新对象，可能影响内部状态。
- 修复说明：构造新对象 `{ ...trayBounds, x: ..., y: ... }`。

### A20. is_within_allowed Windows 大小写规范化

- 来源：opus
- 位置：`src/main/core/connector/net-client.ts:71-79`
- 优先级：LOW
- 详细判断理由：resolved.startsWith(resolved_root + sep) 在 Windows 下大小写不一致（C:\Users vs c:\users）误判。
- 修复说明：Windows 下 toLowerCase() 后比较（process.platform === "win32"）。

### A21. popup-height-controller 注释 85% → 75%

- 来源：haiku
- 位置：`src/main/core/popup/popup-height-controller.ts:66`
- 优先级：LOW
- 详细判断理由：注释写 "85% screen rule"，实际 MAX_HEIGHT_RATIO = 0.75。
- 修复说明：注释 "85%" 改 "75%"。

---

## 不采纳项

### N1. net-client setGlobalDispatcher 影响其他 undici 使用者

- 来源：haiku
- 位置：`src/main/core/connector/net-client.ts:21-31`
- 优先级：LOW
- 详细判断理由：Grok OAuth 用独立 dispatcher 不受影响，理论问题无实际触发路径。

### N2. hydrate_runtime_store 把 stale 标 ready

- 来源：current
- 位置：`src/main/core/scheduler/hydrate-runtime-store.ts:30-43`
- 优先级：MEDIUM
- 详细判断理由：current 不确定项 3 指出可能 UI 已根据 item.stale 单独处理显示。本次范围只 main，未读 renderer 无法定论。留待 renderer 块审阅时确认。

### N3. prune_invalid_plugins 每次 load 跑

- 来源：current, sonnet, opus
- 位置：`src/main/core/config/config-store.ts:113-218`
- 优先级：MEDIUM
- 详细判断理由：当前 plugin < 20，性能影响可忽略。缓存/mtime 失效机制改动成本高于收益。

### N4. observation-store prune SQL 性能

- 来源：current, opus
- 位置：`src/main/core/observation/observation-store.ts:155-162`
- 优先级：MEDIUM
- 详细判断理由：典型规模 < 10K 行，idx_lookup 覆盖索引已存在，性能影响可忽略。需实测验证后再议。

### N5. enqueue_token_mutation then 链可能跑两次

- 来源：current
- 位置：`src/main/core/auth/grok_oauth_manager.ts:228-245`
- 优先级：MEDIUM
- 详细判断理由：current 自标置信度低，需具体失败场景触发，理论问题。

### N6. config-store load 写 prune 未进 saveTail

- 来源：opus
- 位置：`src/main/core/config/config-store.ts:141-160`
- 优先级：MEDIUM
- 详细判断理由：atomic rename 保证不损坏，最坏 prune 未持久化、下次启动再 prune。

### N7. config-store concurrent write JSON.stringify 比较

- 来源：sonnet
- 位置：`src/main/ipc/config-ipc.ts:147`
- 优先级：MEDIUM
- 详细判断理由：config schema 全 string/number/boolean/array/object，sortKeys 保证确定性排序，sonnet 自评当前风险低。

### N8. logging 50MB 后 silent drop

- 来源：sonnet
- 位置：`src/main/core/logging.ts:70-79`
- 优先级：LOW
- 详细判断理由：静默 drop 只 warn 一次，轮转机制改动涉及日志系统重构。

### N9. clamp 函数 3 文件重复

- 来源：sonnet
- 位置：`main-panel-controller.ts:23`、`floating-bounds.ts:13`、`popup-height-controller.ts:170`
- 优先级：LOW
- 详细判断理由：风格偏好，无 bug，三处各自独立使用。

### N10. connector-ipc vs config-ipc assert_valid_sender 位置不一致

- 来源：sonnet
- 位置：`src/main/ipc/connector-ipc.ts:199-230`
- 优先级：LOW
- 详细判断理由：功能等价，纯风格一致性。

### N11. uncaughtException 仅 log 不退出

- 来源：current, opus
- 位置：`src/main/index.ts:72-82`
- 优先级：LOW
- 详细判断理由：EPIPE 直接 return 合理，其他情况退出策略难定（易误杀）。

### N12. set_file_permissions USERNAME 未校验

- 来源：current
- 位置：`src/main/core/vault/file-vault-backend.ts:41-58`
- 优先级：LOW
- 详细判断理由：execFile 不走 shell 无 shell 注入，icacls 参数解析风险极低，current 自标置信度低。

### N13. compile_script 正则不匹配多行 import type

- 来源：current
- 位置：`src/main/core/connector/runtime.ts:39-55`
- 优先级：LOW
- 详细判断理由：失败而非绕过（安全方向 OK），仅限制连接器作者写法。

### N14. event-ipc 广播所有窗口

- 来源：current, opus
- 位置：`src/main/ipc/event-ipc.ts:18-49`
- 优先级：LOW
- 详细判断理由：多窗口一次 IPC 序列化开销极小。

### N15. runtime-store getSnapshot idle 字面量

- 来源：current
- 位置：`src/main/core/scheduler/runtime-store.ts:42-44`
- 优先级：LOW
- 详细判断理由：current 自评"OK"，每次新建字面量无共享问题。

### N16. connector-scheduler 第一只 connector 无 jitter

- 来源：current
- 位置：`src/main/core/scheduler/connector-scheduler.ts:32-47`
- 优先级：LOW
- 详细判断理由：轻微，仅首只立即触发，orchestrator 顺序启动影响可忽略。

### N17. parse_body reject 后未 req.destroy

- 来源：current
- 位置：`src/main/core/local-api/server.ts:56-77`
- 优先级：LOW
- 详细判断理由：req.pause 在大多数场景足够，未压测出问题。

### N18. read_body_with_limit Buffer.concat 契约

- 来源：current
- 位置：`src/main/core/connector/net-client.ts:33-53`
- 优先级：LOW
- 详细判断理由：Electron 内置 Node 版本接受 Uint8Array，旧版 Node 风险不适用。

### N19. local-api get_token 返回明文

- 来源：opus
- 位置：`src/main/core/local-api/server.ts:432-437`
- 优先级：LOW
- 详细判断理由：当前调用方守约脱敏，无实际泄漏路径，预防性改动。

### N20. snapshot-cache 无 schema 版本

- 来源：opus
- 位置：`src/main/core/scheduler/snapshot-cache.ts:43-88`
- 优先级：LOW
- 详细判断理由：try/catch 兜底为空 Map，字段变更已有可选字段兼容。

### N21. message_id_from_line sha256 32 字符

- 来源：opus
- 位置：`src/main/core/token-stats/claude-reader.ts:269-272`
- 优先级：LOW
- 详细判断理由：128 bit 碰撞概率可忽略，且 seen_lines 已去重，opus 自评无实际风险。

### N22. connector.runtime deep_freeze 数组自循环

- 来源：opus
- 位置：`src/main/core/connector/runtime.ts:19-29`
- 优先级：LOW
- 详细判断理由：primitive 数组 freeze 无害，opus 自评无实际问题。

### N23. config-store stripRemovedConfigFields 手维护

- 来源：opus
- 位置：`src/main/core/config/config-store.ts:35-39`
- 优先级：LOW
- 详细判断理由：技术债无 bug，schemaVersion 迁移引擎是独立重构。

### N24. connector-scheduler Math.random 无种子

- 来源：opus
- 位置：`src/main/core/scheduler/connector-scheduler.ts:34-35`
- 优先级：LOW
- 详细判断理由：测试可复现性，当前测试未因 jitter 失败。
