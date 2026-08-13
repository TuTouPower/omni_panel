# Bundle Review: robustness | chunk 5

- Perspective: robustness
- Chunk: 5 (bundle index % 6 == 4)
- Bundles reviewed: 18
- Files reviewed: 100
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- Findings: 14 (Medium 4, Low 8, Info 2)

## Findings

- [Medium][70] src/renderer/lib/config-debounce.ts:53 — flush 失败后 pending patch 已清空、改动静默丢失，仅记 on_error 日志 — `flush_pending` 在排队瞬间 `const patch = pending; pending = {}`（52-53 行），随后 `get()` / `save()` 任一 reject 只进 `.catch(() => opts.on_error?.(err))`（60-62 行）：用户的高频 UI 偏好（provider 顺序、折叠状态等）在磁盘满 / IPC 失败时永久丢失且不重试，无任何 UI 提示（PopupView.tsx:212-218 只写日志）。与注释宣称的「t195 AC7 配置不丢」仅覆盖 dispose 场景不符。修复建议：save 失败时将 patch 合并回 `pending`（若期间无新 patch）或保留错误计数并重试一次；至少把失败结果暴露给调用方。
- [Medium][65] src/renderer/components/LabelMapDialog.tsx:168 — handle_save 无 try/catch，IPC 保存失败成 unhandled rejection 且无 UI 反馈 — `handle_save`（90-100 行）`await on_save(instance_id, merged)` 无任何错误处理；保存按钮 `onClick={() => { void handle_save(); }}`（168 行）fire-and-forget。调用链 CpaLabelMapDialog.tsx:37-55 → SettingsView.tsx:150-156 `save_config` → `await save(payload)`（IPC config.save），IPC reject 时：unhandled promise rejection、对话框保持打开、用户零提示，与 AddAccountDialog 已有 `set_error_message` 的路径不一致。修复建议：handle_save 内 try/catch，失败时在对话框内展示错误并保持打开。
- [Medium][60] src/main/core/local-api/server.ts:1194 — /v1/records、/v1/heatmap、/v1/hourBuckets、/v1/rollup、/v1/sessions 查询参数无数值校验，畸形输入返回 500 — 这五个分支 `...(start ? { start: Number(start) } : {})` / `filters.start_at = Number(params.get("start_at"))` 对 `?start=abc` 直接产生 NaN，传入 token-stats-store 的 SQL bind（better-sqlite3 对 NaN 抛 TypeError）→ 外层 handle_request catch（1082-1085 行）回 500 "Internal server error"；而同文件的 /v1/dashboard 与 /v1/dashboard/sessions 分支（1112-1133、1155-1167）有 zod schema 校验返回 400。同一 API 面错误分类不一致，非法输入应当 400 而非 500。修复建议：统一数值参数校验（`Number.isFinite` 或 zod），非法即 400。
- [Medium][55] src/main/core/local-api/server.ts:254 — session_history_query_all_sessions 全量分页无总量上限、无中止，searchContent 每请求枚举 1-2 次全表 — `session_history_query_all_sessions` 逐页（PAGE_SIZE=100）拉取全部会话行直到耗尽（262-266 行），无行数上限；`handle_session_history_search_content` 对非 legacy 请求同时枚举 `candidate_rows`（288 行）与 `metadata_rows`（419-432 行，当 filters.search 存在时）两次全表。abort_controller 只传给 `searchContentWithAbort`（磁盘内容扫描），不覆盖此分页枚举。会话库达几十万行时单请求数千次 SQL 查询 + 全量内存累积，且发生在请求处理线程内不可取消。修复建议：为分页枚举加总量上限（如 100k）或复用同一 abort 信号，必要时降级为只扫最近 N 天。
- [Low][45] connectors/deepseek/connector.ts:28 — 空 API_KEY 静默返回空数组，与 kimi 缺凭据时 throw 的行为不一致 — `const api_key = (ctx.params["API_KEY"] ?? "").trim(); if (!api_key) return [];`：用户保存了空字符串密钥时（refresh-service 的 required 校验只拦截"vault 无值/无默认"（refresh-service.ts:142-144），空串值可通过），脚本静默返回空 → runtime 记为成功空结果（runtime.ts:194 error=null）→ 该 deepseek 账号无任何观测、无错误提示、不标记 stale/failed，用户看到账号「正常」但永远无数据；对照 kimi connector.ts:65-67 缺凭据时明确 throw。修复建议：与 kimi 对齐，无 key 时 `throw new Error("Missing required secret: API_KEY")`。
- [Low][40] src/main/core/local-api/server.ts:348 — /v1/sessionHistory 的 limit 参数无下限校验，0/负值静默返回空 — `if (limit_raw !== null && Number.isFinite(Number(limit_raw)))` 只校验有限性不校验 `> 0`；limit=0 或负数传入 subscription-service.query 后（subscription-service.ts:583 `Math.max(0, end - limit)`）返回空 messages 且 next_cursor=null，客户端无法区分「确实无消息」与「参数非法」。修复建议：要求 `Number(limit_raw) > 0`，非法回 400。
- [Low][35] src/main/core/local-api/server.ts:657 — serve_static 对畸形百分号编码路径抛 URIError 回 500 — `decodeURIComponent(url.pathname)` 对 `/%zz` 之类非法编码抛 URIError，冒泡到 handle_request 的 catch（1082-1085 行）返回 500；浏览器地址栏可构造，属输入校验错误应 400。修复建议：decode 包 try/catch，失败回 400（或直接服务 index.html 兜底）。
- [Low][35] src/renderer/components/add_account/LocalScanForm.tsx:21 — 本地授权扫描是纯 mock：setTimeout 800ms 后恒显示「未发现有效凭证」，UI 承诺与实际能力不符 — 注释明示 "Mock scan — in production this would use IPC to read the filesystem"；「重新扫描」按钮（67-73 行）只是再跑一遍假 timer，永远无结果。用户会据此误判本机未登录 CLI（静默功能缺失）；对勾选该流程的添加账号路径构成假阴性引导。修复建议：要么接入真实 IPC 扫描（manifest local.paths 已在 net-client 支持），要么移除「重新扫描/手动选择」入口并标注不可用。
- [Low][35] scripts/repo_template/repo_task/git_ops.py:11 — 所有 git 调用无超时，git 挂起时 CLI 永久卡死 — `_git`/`_git_bytes` 的 `subprocess.run` 未传 timeout；`rev-list --all`（store.py:85）、`worktree list`、`merge-base` 等调用在 NFS 挂载、远端锁或大仓回放下可能无限阻塞，task.py 全命令族（start/integrate/ps/view）均无恢复路径。修复建议：`subprocess.run(..., timeout=30)` 捕获 TimeoutExpired 转 TaskDataError。
- [Low][35] scripts/repo_template/repo_task/view_static/board.js:905 — renderSheetDoc 的 fetch 无请求序号守卫，快速切换 tab 时旧响应覆盖新内容 — 用户先点 spec 再快速点 task（或反之），两个 fetch 并发，慢的旧请求后到会覆盖新 tab 内容（无 abort / 序号比较），展示错位且无任何提示。修复建议：记录每次请求的 doc/序号，响应到达时校验仍是当前选中项再渲染。
- [Low][30] scripts/repo_template/repo_task/view_server.py:244 — ThreadingHTTPServer 构造失败（含 \_find_free_port 与 bind 间 TOCTOU 端口抢占）无捕获，裸 traceback 退出 — `_find_free_port`（37-40 行）探测后释放端口，`ThreadingHTTPServer((host, port), ...)` 再绑定期间端口可能被其他进程占用 → OSError 未捕获直接抛 traceback；serve() 无重试。修复建议：try/except OSError 后回退 port=0 重试，并输出友好错误。
- [Low][30] src/main/core/local-api/server.ts:1082 — handle_request 全局 catch 无 headers-sent 防护，未来新增的「写头后再抛错」路径会二次 writeHead 崩溃 — 目前所有分支在写响应前完成（handle_sse 的 store.subscribe 等不抛错），但 catch 中无条件 `json_response(res, 500, ...)`，一旦某分支（如 SSE 订阅注册）在 flushHeaders 后抛错，会抛 ERR_HTTP_HEADERS_SENT 且该异常发生在 catch 内部 → 未处理 rejection。修复建议：catch 内先判 `res.headersSent`，已发送则仅 `res.destroy()`。
- [Info][15] src/renderer/lib/theme.ts:8 — 每次主题切换 palette revision 双倍递增 — `apply_theme` 先 `setAttribute("data-theme", ...)` 触发 echarts_token_resolver.ts MutationObserver 回调（177-186 行 revision += 1），随后又显式 `notify_chart_palette_change()`（revision 再 +1）：revision 仅作变更信号（useSyncExternalStore 订阅），双增无功能影响，但语义噪音（两次全量图表重绘信号叠加为一次订阅通知）。修复建议：apply_theme 去掉显式 notify（observer 已覆盖 data-theme 属性变更），保留 notify 仅用于 setProperty 场景（apply_accent 同理）。
- [Info][15] src/main/core/storage/write-json.ts:68 — cleanup_temp_files 只清理传入目录一层，不递归 — `readdir(dir)` 后仅删该目录下的 `*.tmp`（当前调用方 index.ts:213 只传 dataRoot 一层，而 writeJsonAtomic 的全部调用方 config/vault/snapshot-cache/scan-state/cli-json 恰好都在 dataRoot 直接子文件，故现状无残留风险）；若未来任一代码把原子写移到子目录（如 states/、logs/），中断残留将无启动清理。修复建议：注释标注该单层前提，或改为按调用方目录显式清理。

## Reviewed files (100)

- connectors/deepseek/connector.ts, connectors/deepseek/manifest.json
- connectors/kimi/connector.ts, connectors/kimi/manifest.json
- root_config_01：.agents/skills/repo-template-sync/sync_state.json、.claude/settings.json、.github/workflows/{ci,nightly,release}.yml、docs/archive/\_pre/omni_powers_sunset/op_execution/tasks_list.json、docs/archive/reviews/review_20260726_054747/\_meta/{\_fire_meta,\_wait_status}.json、docs/archive/tasks/t281/…/t301 共 17 个 handoff.json、docs/archive/tasks_index.json（26 个，全部 JSON 校验通过）
- scripts/repo_template/repo_task/：**init**.py、attempts.py、cli.py、context.py、control.py、documents.py、git_ops.py、goal.py、integration.py、ledger.py、lifecycle.py、monitoring.py、plan.py、scheduling.py、store.py、view_server.py、view_static/{board.css,board.js,chain_plan.js}、worktrees.py（20 个）
- src/main/core/local-api/server.ts
- src/main/core/paths.ts
- src/main/core/storage/write-json.ts
- src/main/security/csp.ts
- src/preload/token-stats-events.ts
- src/renderer/components/{AliasEditor,CpaCard,LabelMapDialog,RenameAccountDialog,UpcomingResetCard}.tsx
- src/renderer/components/add_account/{ApiKeyForm,LocalScanForm,SessionForm,VendorPicker,add_account_params}.ts
- src/renderer/components/settings/{BarSchemeField,Select,SetRow,Toggle}.tsx
- src/renderer/lib/：account-overrides.ts、auth-flow-registry.ts、common-services.ts、config-debounce.ts、config-sync.ts、cookie_login_poll.ts、device-login-url.ts、display_label.ts、drag-reorder.ts、echarts_token_resolver.ts、is-web.ts、label-map-util.ts、logger-transport.ts、panel-navigation.ts、provider-usage.ts、refresh-intervals.ts、session-history/{layout,markdown}.ts、session-library/filter.ts、session-resume.ts、session_meta.ts、theme.ts、token-stats/{aggregate,chart-data,filter}.ts（25 个）
- src/shared/lib/{auth-error,config_redaction,connector-thresholds,cookie_parser,logger,trend}.ts（trend.ts 未在本 chunk bundle 内，未读）

## 执行过的只读检查

- 读 bundle.json 确定 18 个目标 bundle（index % 6 == 4），全部文件读 HEAD 当前内容（HEAD `51ea3972`）
- JSON 校验：root_config_01 全部 26 个 JSON 文件 `json.load` 通过；抽查 handoff.json 结构（tid/status/branch 字段一致性）
- 交叉验证调用链：net-client.ts（ctx.http.get_json 契约与超时/清理）、runtime.ts（run_connector 空 observations=成功、schema 拒绝丢条）、refresh-service.ts（required secret 校验、stale/failed 语义）、runtime-store.ts（subscribe 同步不抛错 → handle_sse 无触发路径）、subscription-service.ts（query 的 limit/before_cursor 语义）、token-stats-store.ts（查询参数 → SQL bind）、SettingsView.tsx + CpaLabelMapDialog.tsx（LabelMapDialog on_save → save_config 调用链）、PopupView.tsx（create_debounced_config_patcher 使用与 on_error）、index.ts（cleanup_temp_files 调用时机）、token-stats-events.ts 使用方（preload/index.ts）
- Grep 验证：create_debounced_config_patcher / cleanup_temp_files / create_on_updated_subscriber / onThemeChange 订阅方 / LabelMapDialog 与 RenameAccountDialog 的 import 与 on_save 传递 / writeJsonAtomic 全部调用方目录
- 关联测试阅读：tests/integration/connector/{kimi,deepseek}-connector.test.ts（resetTime ISO 格式、booster 换算、缺 key 行为已测）
