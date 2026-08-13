# bundle_performance_4.md

- perspective: performance
- chunk: 4
- bundles reviewed: 18（index % 6 == 3：index 3, 9, 15, 21, 27, 33, 39, 45, 51, 57, 63, 69, 75, 81, 87, 93, 99, 105）
- files reviewed: 50
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][75] connectors/cpa/connector.ts:510 — CPA 连接器对全部 auth files 串行拉取，整体受 15s 超时预算约束，账号多/上游慢时整轮采集失败 — main() 对 `files` 逐个 `await fetch_provider(...)`（无并发）；每 auth file 至少 1 次 HTTP 往返（antigravity 最坏 `load_code_assist_project` 1 次 + 3 个 URL 串行 fallback，connector.ts:443-466），且 refresh-service.ts:182 以 `run_connector(..., undefined, ...)` 调用（undefined → `DEFAULT_TIMEOUT_MS` = 15s，runtime.ts:136 + shared/constants.ts:1），runtime.ts:174 `race_with_timeout` 到点 reject 整脚本。单账号延迟假设 300-500ms，30 个账号即逼近/超过 15s；超过后整 connector 报 error，全部账号（含已成功拉取的）observations 丢弃，refresh-service 走失败分支。复现场景：CPA 网关挂 10+ 账号且上游响应 >500ms。修复建议：auth files 按并发上限（如 3-5）并行 `fetch_provider`，或拆分 per-provider 串行为并行组；同时把脚本超时与账号数解耦（按账号数放大 timeout 或分批执行）。
- [Medium][70] src/main/ipc/session-history-ipc.ts:87 — 内容搜索无上限全量分页枚举全部 sessions，二次全表遍历 + 逐行文件系统操作 — `query_all_sessions` 以 `while (page.length === CONTENT_SEARCH_PAGE_SIZE)` 用 `offset` 翻页直到空页（无 limit 上限），`content_search_candidates` 每次 SEARCH_CONTENT 都调用一次（带 `filters.search` 时 `metadata_rows` 再全量查一次，session-history-ipc.ts:243-254）；随后对每个 row `resolve_session_file`（fs stat，:258）并在 `searchContent` 中读文件全文（并发 3，subscription-service.ts:633-650）。OFFSET 分页每次查询线性扫表，总成本 O(N²/100) + N 次 fs 操作；会话库上千条时每次搜索都是全量扫描，主进程内同步 `query_sessions`/`resolve_session_file` 阻塞事件循环。修复建议：candidates 服务端 limit（如 500）+ keyset/游标分页替代 OFFSET；搜索场景跳过每行 stat（直接信任 store 返回路径或批量 resolve）；对 `request.locs` 数量做上限。
- [Low][60] src/main/core/connector/net-client.ts:286 — 4xx/5xx 错误响应仍读满 50MB body 仅为取长度后丢弃 — `response.statusCode >= 400` 分支调用 `read_body_with_limit(response.body, MAX_RESPONSE_BYTES)`（50MB）完整读完错误响应（只用于 `body_text.length` 拼日志），随后 throw。上游返回大错误页/拦截页（HTML 网关错误页可达数百 KB-MB）时白下载全文，浪费带宽与内存；每 poll 周期每失败账号都会重复。修复建议：错误路径改用小上限（如 1MB）读取或直接 `response.body.destroy()` 丢弃，长度仅从 content-length 头取。
- [Low][60] src/main/core/connector/runtime.ts:114 — race 超时只 reject 调用方，不取消脚本内已发出的网络请求，超时请求继续占用连接池 — `race_with_timeout` 到点 reject 后，脚本里 pending 的 `ctx.http` 请求没有 abort 信号联动（net-client.ts:217-220 的 AbortController 只由 net-client 自身 15s timer 控制，与 run_connector 的超时互相独立）；与 CPA 串行场景叠加时（见上），整脚本 15s 被杀后其内部 HTTP 请求继续跑满各自 15s 才释放，多个失败 connector 并发时连接池/事件循环上堆积悬挂请求。修复建议：为 ConnectorContext 注入全局 AbortSignal（run_connector 超时触发 abort），`build_request_context` 同时监听该信号。
- [Low][65] scripts/repo_template/track_worktree.py:44 — 每次 Bash 命令 hook 线性读整个 ledger 与 statusline 文件并逐行 JSON 解析，成本随运行时长线性增长 — `resolve_worktree`（:38-74）每次打开 `docs/runtime/dispatch_ledger.jsonl` 全文逐行 `json.loads`；`append_record`（:77-97）每次先读 `statusline_workdir.jsonl` 全文找最后一行做 de-dup 再追加。PostToolUse hook（matcher=Bash）在每次 Bash 命令后触发，两文件均 append-only 线性增长（attempt 记录 + 每命令一条 statusline）。修复建议：只读文件尾部（`seek` 到末尾前向找最后一行）；ledger 解析倒序扫描或按 tid 建索引；statusline de-dup 改为记录上次 ts。
- [Low][60] src/renderer/components/Icon.tsx:236 — VendorMark 每次渲染重建完整 SVG 字符串并通过 dangerouslySetInnerHTML 注入 — `VENDOR_MARKS` 的 `render(size)` 每次调用都字符串拼接整段 SVG（claude/codex/mimo 等每段 500+ 字节），vendor mark 在 ProviderCard/账号行/会话卡片等多处列表渲染，父级每刷新周期/时钟 tick 重渲染时全部重建；`dangerouslySetInnerHTML` 使 React 只能整体字符串比较，`size` 变化时全量重写 DOM。修复建议：SVG 字符串模块级预编译为常量（viewBox 固定、尺寸用 CSS width/height 控制），或对 VendorMark 组件 `memo`。
- [Info][55] src/renderer/components/ProviderOverview.tsx:81 — 每次渲染重建 Map/Set 且组件无 memo，父级状态变化时整个卡片网格重渲染 — 每次 render 执行 `new Map(groups.map(...))` 与 `new Set(visibleProviders)`，并逐 provider 重建 ProviderCard 的 ~20 个 props 对象；ProviderOverview 未 memo，刷新周期内父组件每次状态推送都会触发整树 diff。当前 provider 数（~20）下开销小，属结构性的无谓重建。修复建议：按 `groups`/`visibleProviders`/`card_order` 引用 memo 派生值，或对 ProviderCard 做浅比较 memo。
- [Info][50] src/main/ipc/config-ipc.ts:89 — handleConfigGet 对每个插件的每个 secret key 串行 await vault 读 — 双层循环内逐个 `await deps.secretsStore.get(keyFor(...))`，而 file-vault-backend.ts:169-171 的 `get` 每次都 `with_lock`（文件锁）+ 读整个 vault.json + 解密，N 插件 × M 密钥全串行磁盘 IO。保存/读取配置为低频用户操作，但多插件多密钥（CPA 管理端 + 多账号）时可见延迟。修复建议：同插件密钥并行读取或按 instanceId 批量导出。
- [Info][50] src/main/ipc/trend-ipc.ts:46 — TREND_GET_BULK 对 periods 串行执行 SQL 查询 — `payload.periods.map` 内同步 `query_trend_series`（observation-store.ts:290 每次独立 SQL），periods 为账号展开区的全部 metric（多账号 × 2 窗口时数十个），串行累计 ~几十 ms 阻塞 IPC handler 线程。一次性展开成本，属可接受但可并行（`Promise.all` 无共享写）的扩展性观察。修复建议：periods 查询 `Promise.all` 并行。

## Reviewed files

Bundles（18）与文件（50）：

- connectors_cpa：connectors/cpa/connector.ts、connectors/cpa/manifest.json
- connectors_grok：connectors/grok/connector.ts、connectors/grok/manifest.json
- connectors_tikhub：connectors/tikhub/connector.ts、connectors/tikhub/manifest.json
- scripts_repo_template：scripts/repo_template/\_id_scan.py、check_review_status.py、findings.py、pending.py、render_review_prompts.py、repo_state.py、spikes.py、task.py、track_worktree.py
- src_main_core_connector：src/main/core/connector/host-io.ts、manifest-loader.ts、net-client.ts、probe-executor.ts、runtime.ts、script-cache.ts、tier1-poll-executor.ts
- src_main_core_open_connectors_dir_ts：src/main/core/open-connectors-dir.ts
- src_main_core_settings_close_action_ts：src/main/core/settings-close-action.ts
- src_main_ipc：src/main/ipc/auth-ipc.ts、build-info-ipc.ts、config-ipc.ts、connector-ipc.ts、event-ipc.ts、grok_auth_ipc.ts、helpers.ts、kimi_auth_ipc.ts、log-ipc.ts、logged.ts、popup-ipc.ts、session-history-ipc.ts、session-ipc.ts、size-validation.ts、token-stats-ipc.ts、trend-ipc.ts
- src_preload_route_api_ts：src/preload/route_api.ts
- src_renderer_components_AddAccountDialog_tsx：src/renderer/components/AddAccountDialog.tsx
- src_renderer_components_CpaAddDialog_tsx：src/renderer/components/CpaAddDialog.tsx
- src_renderer_components_Icon_tsx：src/renderer/components/Icon.tsx
- src_renderer_components_ProviderOverview_tsx：src/renderer/components/ProviderOverview.tsx
- src_renderer_components_TrendSparkline_tsx：src/renderer/components/TrendSparkline.tsx
- src_renderer_components_WebLoginSection_tsx：src/renderer/components/WebLoginSection.tsx
- src_renderer_components_session_shell：src/renderer/components/session-shell/SessionShell.tsx
- src_renderer_index_tsx：src/renderer/index.tsx
- src_shared_constants_ts：src/shared/constants.ts

## Read-only checks performed

- 读取 `docs/reviews/review_20260813_114911/_meta/bundle.json` 全量，按 id 序计算 index，筛出 index % 6 == 3 的 18 个 bundle
- `git rev-parse HEAD` + `git log -1`（HEAD SHA 51ea3972）
- 追踪上游调用：src/main/core/scheduler/refresh-service.ts（run_connector 超时与 script-cache 用法）、scheduler-orchestrator.ts（并发模型）、session-history/subscription-service.ts（searchContent/extract 成本）、observation/observation-store.ts（query_trend_series 实现）、vault/file-vault-backend.ts（vault.get 持锁读盘）
- 关联文件核对：src/shared/lib/logger.ts（debug gate 位置）、src/shared/constants.ts（DEFAULT_TIMEOUT_MS=15s）
- `git log --oneline` 追踪 connectors/cpa/connector.ts、runtime.ts、session-history-ipc.ts 变更历史
- 只读，未修改任何文件
