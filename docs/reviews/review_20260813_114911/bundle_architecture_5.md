# Code Review Bundle — architecture / chunk 5

- perspective: architecture
- chunk: 5（bundle index % 6 == 4，index 从 0 起）
- 审过 bundle 数：18（connectors_deepseek, connectors_kimi, root_config_01, scripts_repo_template_repo_task, src_main_core_local_api, src_main_core_paths_ts, src_main_core_storage, src_main_security, src_preload_token_stats_events_ts, src_renderer_components_AliasEditor_tsx, src_renderer_components_CpaCard_tsx, src_renderer_components_LabelMapDialog_tsx, src_renderer_components_RenameAccountDialog_tsx, src_renderer_components_UpcomingResetCard_tsx, src_renderer_components_add_account, src_renderer_components_settings, src_renderer_lib_01, src_shared_lib）
- 审过文件数：80（含 25 个 JSON/yml 存档与 CI 配置；23 个存档 JSON 已逐文件验证可解析）
- HEAD SHA：51ea3972efefea568cc2fba3e530ea5f69296182

## Findings

- [Medium][60] src/renderer/lib/token-stats/chart-data.ts:42 — 同一聚合逻辑按 records/buckets/rollup/dashboard 三到四套并行镜像复制，agent 显示名映射 4 份、Top5+其他 segment 构建 4 份、composition segment 3 份，同步仅靠注释"mirrors"约束 — 新增 agent 或指标需在多处同步修改，漏改即图表间不一致；证据：AGENT_LABELS(:42) / BUCKET_AGENT_LABELS(:592) / ROLLUP_AGENT_LABELS(:820) 三份映射；modelSegments(:98) / modelSegmentsFromBuckets(:648) / modelSegmentsFromRollup(:873) 三份几乎相同的 Top5+其他 组装；compositionSegments(:73) / (:623) / (:851)。修复建议：抽公共生成器（如 `top_segments(entries, valueFn, labelFn, colorFn)`），四份入口只做数据源适配。

- [Medium][55] src/renderer/lib/echarts_token_resolver.ts:392 — 每次取色都重算整份 CSS palette：top_category_color/agent_color 内部调用 resolve_chart_palette，约 30 次 getComputedStyle + var() 递归解析；chart-data.ts 单张图（modelSegments+agentSegments+projectSegments+prepareBarData+modelColorMap）累计 20+ 次完整重算，主题切换/数据刷新后逐帧重复 — 图表渲染路径的重复计算。证据：top_category_color(:392) `resolve_chart_palette(theme).series[index] ?? resolve_chart_palette(theme).other`（后一分支因 series fallback 恒非空而短路，实际每次仍全量重算）；agent_color(:396) 同。修复建议：模块级按 `theme|palette_revision` 缓存 palette（MutationObserver 已维护 revision，缓存失效点明确），各取色函数只查缓存。

- [Medium][50] scripts/repo_template/repo_task/plan.py:229 — 链规划展示逻辑三份实现，漂移风险无机制防护 — chain_stop_info/chain_name/chain_letter/chain_of_map/is_unfinished 在 plan.py(:229,:43,:49,:53,:39) 与 view_static/chain_plan.js(:17-95) 双写；chain_plan.js 头注释自称「避免与 Python 双实现漂移」却仍完整复制 chainStopInfo；board.js 另含 isUnfinished 内联 fallback(:74-77)。三处行为已出现细微分歧（如 plan.py is_unfinished 对 None 返回 False，chain_plan.js blocksDownstream 需 cat!==undefined 才判）。修复建议：只保留 Python 权威实现，server 注入 stop_reason/chainOf 数据，JS 删除 chainStopInfo 与内联 fallback，仅消费注入值。

- [Medium][45] src/renderer/components/add_account/LocalScanForm.tsx:21 — mock 扫描占位挂在产线路径且无「未实现」标识，用户会被误导 — useEffect 内 800ms setTimeout 假扫描后恒显示「未发现有效凭证」（:56-85），「手动选择文件…」按钮 disabled title="尚未实现"（:86-95）；AddAccountDialog.tsx:367 在 auth_method==="local_cli" 时真实渲染该表单。antigravity/claude/codex 等本地授权来源用户看到的是虚假扫描结果。修复建议：要么接入真实 IPC 扫描，要么将该路径标记为实验性并在 UI 明示「本地扫描尚未实现，请使用 API Key/Cookie 方式」。

- [Medium][40] .github/workflows/nightly.yml:60 — `test -d out` 在 windows-2022 默认 pwsh shell 下无对应语义，package job windows 分支恒失败 — package job matrix 含 windows-2022（:43-44），run 未指定 shell；pwsh 中 `test`（Test-Path 别名，若存在）也无 `-d` 参数，命令必然报错。证据：同 job linux 分支靠 /bin/sh 的 test 内置通过，windows 分支无等效路径。修复建议：改为 `shell: bash`，或 PowerShell 写法 `Test-Path out`。

- [Low][45] src/renderer/lib/theme.ts:59 — useTheme 与 useGlobalTheme 重复实现同一套「事件订阅 + generation 守卫 + 初始快照」逻辑 — :59-93 与 :98-133 两段几乎逐行相同的 useEffect：onConfigChange/onThemeChange 订阅、event_generation 计数、config.get().then 里 `event_generation !== initial_generation` 守卫、catch 兜底。修复建议：抽共享 hook `useThemeEvents(applyConfig, applyTheme, fallback)`，两入口只传应用函数。

- [Low][40] scripts/repo_template/repo_task/documents.py:54 — front matter 解析器三份副本，改动需三处同步 — parse_front_matter 注释（:57-58）自认 render_review_prompts.py / check_review_status.py 各有简化副本；grep 确认两脚本确实各自实现 parse_front_matter 逻辑（scripts/repo_template/render_review_prompts.py、check_review_status.py）。修复建议：若两脚本可导入 repo_task，直接复用 documents.parse_front_matter；否则抽公共 util 单点维护。

- [Low][35] src/renderer/lib/token-stats/chart-data.ts:285 — colorOf 三元两分支完全相同，colorDim 条件为死分支 — `k === "其他" ? palette.other : colorDim === "model" ? top_category_color(index, theme) : top_category_color(index, theme)`，两分支都调 top_category_color；:1033-1038 prepareBarDataFromRollup 内同型冗余。修复建议：删去 colorDim 条件，直接 `k === "其他" ? palette.other : top_category_color(index, theme)`。

- [Low][35] scripts/repo_template/repo_task/attempts.py:146 — invalid_overlapping_attempts 无调用者，且是 overlapping_attempts 的恒等包装 — grep 全仓仅 scripts/repo_template/task.py:92 import 引入、从未调用；函数体 `return overlapping_attempts(tid, events)` 无任何附加语义。修复建议：删除函数并移除 task.py 中对应 import；若需保留 CLI façade 语义可注释说明。

- [Low][30] scripts/repo_template/repo_task/plan.py:338 — head_set 重复赋值（同值重算）— :338 `head_set = set(heads)` 供 :375 while 循环使用；:402 在循环后再次 `head_set = set(heads)`（值不变）供 :407 deferred 计算。修复建议：删去 :402 重复赋值。

- [Low][30] scripts/repo_template/repo_task/lifecycle.py:533 — cmd_rewind 重复调用 worktree_paths()（每次触发一次 `git worktree list` 子进程）— :533 `str(worktree) in worktree_paths()` 与 :559-560 `worktree_paths().get(str(worktree))` + 再判 `str(worktree) in worktree_paths()` 共两次全量 worktree 枚举。修复建议：缓存一次结果复用。

- [Low][30] scripts/repo_template/repo_task/view_static/board.js:844 — sheetDocCache 无上限，会话/任务文档随查看无限累积 — renderSheetDoc 每打开一个 `{tid}/{doc}` 就永久缓存整份文本（:910-912），无容量上限、无卸载清理；长会话看板内存持续增长。修复建议：改为按选中任务重置的单一缓存或 LRU 上限（如 50 条）。

- [Low][25] scripts/repo_template/repo_task/monitoring.py:24 — tid 排序键双实现，行为不一致 — \_ledger_tid_sort_key 对非法 tid 降级排后，documents.py:76 tid_sort_key 对非法 tid raise；两处排序语义不同且均被各自模块使用。修复建议：统一为 documents.tid_sort_key（或导出共享降级键），消除两套口径。

- [Low][25] src/main/core/local-api/server.ts:1088 — 单文件 1632 行承载 8 域 HTTP 路由 + 静态服务 + SSE + auth，且 handle_web_read 内 records/heatmap/hourBuckets/rollup 四 case 参数解析逐字重复 — :1185-1243 四处相同的 `{...(agent?...),...(env?...),...(start?...),...(end?...)}` 组装与 agent/env 强转；create_local_api_server 闭包内含全部 handler（:762-1556）。修复建议：抽公共 query 参数解析 helper 与各域 handler 文件（如 routes/config-routes.ts），server.ts 只做路由分发。

- [Low][20] src/shared/lib/config_redaction.ts:2 — 密钥键名识别正则两处维护（shared/lib/config_redaction.ts:2-17 与 shared/lib/logger.ts:23 SECRET_KEY_PATTERN），模式集合不同步会漏红/误红 — 两文件各自枚举 api key/token/secret/password/cookie 等词。修复建议：抽公共 `is_secret_key_name()` 单点复用。

- [Info][30] src/renderer/components/add_account/VendorPicker.tsx:6 — 死 prop 与恒真抽象 — VendorPickerProps 声明 plugin_infos 但组件签名与解构均未使用；can_add() 恒返回 true（:14）且 :23 `const available = can_add()` 每次渲染调用。修复建议：删除 plugin_infos prop，can_add 内联为常量或直接移除禁用逻辑。

- [Info][25] connectors/kimi/connector.ts:98 — window 语义与周期错位（跨 chunk 契约观察，留档）— 周用量 metrics 用 window:"day"（:98）而 5 小时限额用 window:"second"（:128）、加油包用 "month"（:153）；ObservationWindow 定义于 src/shared/types/observation.ts:1（second|day|week|month|total）。weekly 标 day 与 cycleDurationMs=7d 不一致，下游按 window 归类展示时会失真。

- [Info][20] scripts/repo_template/repo_task/view_server.py:34 — `_classify = classify_node` 兼容别名仅测试引用（tests/repo_template/test_view_server.py:29），生产代码无使用 — 别名无注释说明其存在理由，读者易误以为死代码。修复建议：补注释或让测试直接引用 classify_node。

- [Info][20] src/renderer/components/AliasEditor.tsx:30 — 每次 keystroke 全量拷贝 entries 并冒泡 onChange，emit 的 useCallback 无 memo 收益 — to_mutable 在 set_alias/set_values/remove/add 四处重复调用（:37-52），每条输入都重建整个数组。数据量小可接受，但 emit useCallback 可删。修复建议：直接调用 onChange，或抽出 `map_entries(fn)` helper。

## Reviewed files

- connectors/deepseek/connector.ts, connectors/deepseek/manifest.json
- connectors/kimi/connector.ts, connectors/kimi/manifest.json
- .agents/skills/repo-template-sync/sync_state.json（JSON 校验）
- .claude/settings.json, .github/workflows/ci.yml, .github/workflows/nightly.yml, .github/workflows/release.yml
- docs/archive/\_pre/omni_powers_sunset/op_execution/tasks_list.json（JSON 校验）
- docs/archive/reviews/review_20260726_054747/\_meta/\_fire_meta.json, \_wait_status.json（JSON 校验）
- docs/archive/tasks/t281/t282/t283/t284/t285/t288/t290/t292/t293/t294/t295/t296/t297/t298/t299/t300/t301 handoff.json（JSON 校验）
- scripts/repo_template/repo_task/**init**.py, attempts.py, cli.py, context.py, control.py, documents.py, git_ops.py, goal.py, integration.py, ledger.py, lifecycle.py, monitoring.py, plan.py, scheduling.py, store.py, view_server.py, worktrees.py
- scripts/repo_template/repo_task/view_static/board.css, board.js, chain_plan.js
- src/main/core/local-api/server.ts
- src/main/core/paths.ts, src/main/core/storage/write-json.ts, src/main/security/csp.ts
- src/preload/token-stats-events.ts
- src/renderer/components/AliasEditor.tsx, CpaCard.tsx, LabelMapDialog.tsx, RenameAccountDialog.tsx, UpcomingResetCard.tsx
- src/renderer/components/add_account/ApiKeyForm.tsx, LocalScanForm.tsx, SessionForm.tsx, VendorPicker.tsx, add_account_params.ts
- src/renderer/components/settings/BarSchemeField.tsx, Select.tsx, SetRow.tsx, Toggle.tsx
- src/renderer/lib/account-overrides.ts, auth-flow-registry.ts, common-services.ts, config-debounce.ts, config-sync.ts, cookie_login_poll.ts, device-login-url.ts, display_label.ts, drag-reorder.ts, echarts_token_resolver.ts, is-web.ts, label-map-util.ts, logger-transport.ts, panel-navigation.ts, provider-usage.ts, refresh-intervals.ts, session-history/layout.ts, session-history/markdown.ts, session-library/filter.ts, session-resume.ts, session_meta.ts, theme.ts, token-stats/aggregate.ts, token-stats/chart-data.ts, token-stats/filter.ts
- src/shared/lib/auth-error.ts, config_redaction.ts, connector-thresholds.ts, cookie_parser.ts, logger.ts, trend.ts

## 执行的只读检查

- `git rev-parse HEAD`：51ea3972（HEAD SHA 校验）
- bundle.json 解析：按 id 排序后取 index%6==4 的 18 个 bundle
- grep 验证死代码/重复：invalid_overlapping_attempts 仅 task.py:92 import 未调用；view_server.\_classify 仅测试引用；plan.py head_set 两次赋值；worktree_paths 双调用
- grep 追踪上下游：ObservationWindow 类型定义（src/shared/types/observation.ts:1）；csp.ts 使用处（src/main/index.ts:273）；LocalScanForm 产线调用链（AddAccountDialog.tsx:367）；manifest 无 source 字段（source 由 main 侧派生）；front matter 解析副本（render_review_prompts.py / check_review_status.py）
- python 逐一 JSON 校验 23 个存档 JSON（全部可解析）
- `pnpm check` 脚本含 deadcode 检查（package.json:34），Python 侧无对等检查
