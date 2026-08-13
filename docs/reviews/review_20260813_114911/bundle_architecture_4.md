# bundle_architecture_4

- perspective: architecture
- chunk: 4
- bundles 审过: 18 / 111（index % 6 == 3：connectors_cpa、connectors_grok、connectors_tikhub、scripts_repo_template、src_main_core_connector、src_main_core_open_connectors_dir_ts、src_main_core_settings_close_action_ts、src_main_ipc、src_preload_route_api_ts、src_renderer_components_AddAccountDialog_tsx、src_renderer_components_CpaAddDialog_tsx、src_renderer_components_Icon_tsx、src_renderer_components_ProviderOverview_tsx、src_renderer_components_TrendSparkline_tsx、src_renderer_components_WebLoginSection_tsx、src_renderer_components_session_shell、src_renderer_index_tsx、src_shared_constants_ts）
- files 审过: 50
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][80] src/renderer/components/Icon.tsx:174 — `alert_circle` 图标名未注册，3 处调用静默渲染空白 SVG — UI_ICONS 注册表（Icon.tsx:71-121）无 `alert_circle` 键，而 WebLoginSection.tsx:107、DeviceLoginSection.tsx:214、SessionSection.tsx:53 均以 `<Icon name="alert_circle">` 渲染登录错误提示；`Icon` 的未知 name 分支（Icon.tsx:175-191）返回空 SVG 且无 console 告警，tsc 也拦不住（name 为宽泛 string）。git 历史确认 `alert_circle` 自 t157（609ba411）引入后从未注册。用户看到的错误提示旁是空白图标。修复建议：把 name 收窄为 `keyof typeof UI_ICONS` 字面量联合（`chat_square` 等特例并入），未知 name 在 dev 下 `console.warn` 或抛错，并在注册表补 `alert_circle`（lucide `CircleAlert`）。
- [Medium][75] src/renderer/components/CpaAddDialog.tsx:59 — footer 三个按钮全部无 onClick，保存/取消交互失效 — 「测试连接」(59)、「取消」(63)、「保存并同步」(66-68) 均无 onClick；取消不触发 `onClose`，保存无任何保存逻辑，用户只能点右上角关闭图标退出。组件被 SettingsView.tsx:686 实际渲染（showCpaAdd 分支），自 t122（172b880c）提取后至今未接线。修复建议：取消/关闭接 `onClose`，保存接现有 `CONFIG_CREATE_INSTANCE`/secrets 保存路径（对齐 CpaMgmtForm），或若为占位组件则从 SettingsView 入口摘除，避免 dead affordance 误导。
- [Medium][70] src/main/ipc/grok*auth_ipc.ts:111 — grok/kimi OAuth IPC 两文件 152 行近乎逐字重复 — grok_auth_ipc.ts 与 kimi_auth_ipc.ts 仅 logger 名（ipc:grok-auth vs ipc:kimi-auth）、类型（GrokOAuthManager vs KimiOAuthManager）、channel（GROK*_ vs KIMI\__）不同，6 个 handler（login_start/login_poll/login_cancel/login_status/logout/refresh）的 try/catch/错误码映射逐行相同。任何一处修复（如错误码调整）需同步两文件。修复建议：抽参数化注册器 `register_oauth_device_ipc(manager, { logName, channels, resultTypes })`，两文件收敛为一个实现 + 两行参数。
- [Medium][65] src/main/core/connector/net-client.ts:245 — do_request 与 get_raw 重复约 80 行请求前奏/错误处理 — `build_request_context` 装配（246-259 vs 367-379）、request_options 构造（270-279 vs 390-398）、statusCode>=400 的 read_body_with_limit + 抛错（286-294 vs 402-413）在 `do_request` 与 `get_raw` 两个闭包中重复；后续调整超时/头处理需两处同步。修复建议：提取共享 `perform_request(method, url, headers, ac, effective_timeout, { dispatcher, reset })` 返回原始 response，两个入口各自做 body 解析/封装。
- [Low][60] src/main/ipc/session-history-ipc.ts:295 — `metadata_rows.includes(row)` 用对象引用比较做成员判定，且为 O(n·m) 线性查找 — `candidate_rows` 与 `metadata_rows` 分别来自两次独立 `query_all_sessions` 分页查询（256-262 vs 240-254），每次 `sessions_provider` 调用都返回新对象，引用比较大概率恒 false，search 命中 session 元数据但 content 未命中的行可能被丢弃；即使引用偶然相同，n、m 为全量会话行数时每次搜索是 O(n·m)。修复建议：先构建 `new Set(metadata_rows.map(key_of))`，改用 key 比较 `metadata_keys.has(key_of(row))`，一次 O(n+m)。
- [Low][60] src/main/core/connector/probe-executor.ts:98 — probe 与 poll 执行器构造的 ScriptObservation 同构重复 — execute_probe（98-118）与 execute_poll（tier1-poll-executor.ts:70-90）20 行 observation 字面量字段完全一致（provider/account_id/account_label/metric_id/raw_label/normalized_label/window/cycleDurationMs/used/limit/display_style/reset_at/status/observed_at/source/stale/last_error），仅 source 值与字段来源不同。修复建议：在 connector/ 下提取 `build_single_observation(manifest, { used, limit, window, source })` 共享构造。
- [Low][55] src/renderer/components/WebLoginSection.tsx:14 — AUTO_CLOSE_MS 跨进程魔法常量双份手工同步 — renderer 侧 `SESSION_LOGIN_AUTO_CLOSE_MS = 1500` 与 main 侧 `auth-ipc.ts:14 AUTO_CLOSE_MS = 1500` 语义耦合（同一登录窗口自动关闭延迟），注释要求手工保持数值一致，无单一来源；一处改另一处漏改即行为分叉。修复建议：移到 `src/shared/constants.ts` 单一导出，两处引用。
- [Low][55] src/main/ipc/config-ipc.ts:656 — registerConfigIpc 内重复 createLogger("ipc:config") — 模块级 line 24 已有同名 `log`，registerConfigIpc 内部（656）又建一个；同一通道两个 logger 实例，后续若给 logger 加配置（如级别覆盖）会只作用于其一。修复建议：复用模块级 log，删内部创建。
- [Low][50] src/main/ipc/config-ipc.ts:80 — 单文件 720 行承担配置全部职责 — get/save/secrets/duplicate/createInstance/export/import 六个 handler 与 merge（129-177）、mask/strip（45-78）、inject_secrets（405-423）纯逻辑全部内联，测试需逐个 handler 构造 deps。修复建议：把 mask/strip/merge 纯函数抽到 `core/config/`（config-store 旁），handler 只留编排；风险为可维护性而非行为。
- [Low][50] src/main/core/scheduler/refresh-service.ts:166 — 核心执行路径硬编码 provider 特判 — `if (definition.manifest.provider === "grok") delete endpoint_overrides["grok_billing"]` 把「OAuth 凭据 endpoint 不允许 override」的业务规则以 provider 名散落在宿主代码；同类特判还有 connector-ipc.ts:27 `is_cpa_connector`（manifest.id 字面量）、route_api.ts 的 grok/kimi 分权矩阵。修复建议：manifest schema 增加 `protectedEndpoints?: string[]`（或 auth.secret 关联 endpoint 自动保护），把特判移回连接器声明，宿主层循环读取。
- [Low][45] scripts/repo_template/check_review_status.py:84 — front matter 解析三处独立副本 — check_review_status.py:84-104、render_review_prompts.py:39-57、repo_task/documents.py 各有一份简化 YAML front matter 解析器，注释明确「改规则需三处同步」；解析规则（引号剥离、注释截断、冒号分割）任一处漂移都会让 task.md 校验结果不一致。修复建议：抽 `repo_task/front_matter.py` 单一实现，三个脚本 import。
- [Low][45] connectors/cpa/connector.ts:4 — 注释「All 5 provider parsers」与实际 4 个不符 — 文件头注释宣称 5 个 provider parser，实际只有 parse_claude/parse_codex/parse_antigravity/parse_kimi 四个（另有 parse_provider 分发、parse_api_body 工具，不算 parser）。新读者会按 5 个找第 5 个。修复建议：注释改为「4 个 provider parser」，或如实描述（claude/codex/antigravity/kimi）。
- [Low][40] src/main/ipc/trend-ipc.ts:46 — TREND_GET_BULK 串行执行多次 SQLite 查询 — `payload.periods.map` 内逐 period `await query_trend_series`（同一 observation-store 连接，读查询相互独立），periods 较多时总延迟为各查询之和。修复建议：`Promise.all(payload.periods.map(...))`（store 内部同一 better-sqlite3 连接读查询可并发执行）。
- [Low][40] src/renderer/components/AddAccountDialog.tsx:26 — 临时 instance_id 生成约定与主进程不一致 — `generate_instance_id` 用 `Date.now()+Math.random().toString(36)` 生成带 vendor 前缀的 id，而主进程所有持久 instanceId 均用 `randomUUID()`（config-ipc.ts:300/352）；该 id 仅作 OAuth 流程临时身份，但两套格式并存易被误当持久 id 使用（未来若持久化即撞格式）。修复建议：renderer 同样用 `crypto.randomUUID()`，或注释明确临时身份语义并在保存路径剥离。
- [Info][40] src/main/ipc/connector-ipc.ts:79 — identity 冗余映射 — `Object.fromEntries(Object.entries(definition.manifest.endpoints ?? {}).map(([key, value]) => [key, value]))` 是恒等浅拷贝，无任何变换，等价于 `{ ...definition.manifest.endpoints }`。修复建议：直接展开或去掉该层拷贝（manifest 只读，无防御价值）。
- [Info][35] src/main/ipc/helpers.ts:81 — state_to_snapshot_dto 的 loading/failed 分支重复展开 lastSuccess 字段 — loading（82-96）与 failed（105-119）两个 case 中 `updatedAt/items/badge/chart` 的 spread 条件逐字相同，仅顶层 status/error 不同。修复建议：提取 `last_success_dto(lastSuccess)` 共享（refresh-service.ts:61 已有同构 helper，可对比统一）。
- [Info][35] scripts/repo_template/pending.py:234 — pending.py 与 findings.py 的 rename 命令逻辑重复 — cmd_rename（pending.py:234-263）与 findings.py:60-93 的「slug 校验 → git mv/普通改名 → dry-run/--write」流程几乎相同，仅前缀（pNNN/dNNN）与入口校验不同。修复建议：把 rename 下沉到 `_id_scan.py` 的通用 `rename_entry(...)`。
- [Info][30] src/main/ipc/auth-ipc.ts:28 — cookie_login_states 条目不随生命周期清理 — `WeakMap<AuthIpcDeps, Map<instanceId, CookieLoginState>>` 内层 Map 的 entry 在登录结束后仅置 `in_progress=false`，永不删除；同 instanceId 每次登录覆盖，条目数上界为历史 instance 数（含已删除实例），长时间运行只增不减。修复建议：登录结束回调里 `states.delete(instanceId)`（error 需留存供状态查询时再查一次即可，或保留最近一条即可）。

## Reviewed files（本 chunk 50 个）

- connectors/cpa/connector.ts、connectors/cpa/manifest.json
- connectors/grok/connector.ts、connectors/grok/manifest.json
- connectors/tikhub/connector.ts、connectors/tikhub/manifest.json
- scripts/repo_template/\_id_scan.py、check_review_status.py、findings.py、pending.py、render_review_prompts.py、repo_state.py、spikes.py、task.py、track_worktree.py
- src/main/core/connector/host-io.ts、manifest-loader.ts、net-client.ts、probe-executor.ts、runtime.ts、script-cache.ts、tier1-poll-executor.ts
- src/main/core/open-connectors-dir.ts、src/main/core/settings-close-action.ts
- src/main/ipc/auth-ipc.ts、build-info-ipc.ts、config-ipc.ts、connector-ipc.ts、event-ipc.ts、grok_auth_ipc.ts、helpers.ts、kimi_auth_ipc.ts、log-ipc.ts、logged.ts、popup-ipc.ts、session-history-ipc.ts、session-ipc.ts、size-validation.ts、token-stats-ipc.ts、trend-ipc.ts
- src/preload/route_api.ts
- src/renderer/components/AddAccountDialog.tsx、CpaAddDialog.tsx、Icon.tsx、ProviderOverview.tsx、TrendSparkline.tsx、WebLoginSection.tsx、session-shell/SessionShell.tsx
- src/renderer/index.tsx
- src/shared/constants.ts

## 执行过的只读检查

- 用 python 从 bundle.json 按 id 排序重算 index % 6 == 3 的 18 个 bundle（避免人工计数错位），确认文件集合。
- 追踪调用链：refresh-service.ts（script > poll > probe 路径选择，确认 cpa/grok/tikhub 走 script，空 `poll.map` 不触发 tier1-poll 空结果）、connector-scheduler.ts（jitter/stopAll 清理）、observation-mapping.ts / observation-store.ts（source_instance_id 注入位点）。
- Grep 全 src 统计 `Icon name=` 用法并对照 UI_ICONS 注册表（确认 alert_circle 唯一未注册项）；Grep 确认 CpaAddDialog 唯一渲染点 SettingsView.tsx:686。
- git log / -S 溯源：alert_circle（t157 609ba411 引入从未注册）、CpaAddDialog 无 onClick（t122 172b880c 引入）、metadata_rows.includes（t248 20399d7c 引入）。
- 只读，未修改任何文件。
