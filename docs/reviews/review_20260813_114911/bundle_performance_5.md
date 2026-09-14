# Code Review Report

- **Perspective**: performance
- **Chunk**: 5（`index % 6 == 4`，index 从 0 起）
- **Bundles reviewed**: 18 / 111
- **Files reviewed**: 99
- **HEAD**: `51ea3972efefea568cc2fba3e530ea5f69296182`（2026-08-13 11:23:05 +0800）

## Findings

- [Medium][65] src/renderer/lib/echarts_token_resolver.ts:396 — `agent_color()`/`top_category_color()` 每次调用都完整重建整个 ChartPalette（约 30 次 `resolved_token` → `getComputedStyle(root)`，强制样式重算），渲染路径逐行/逐 segment 反复触发 — SessionTable.tsx:260 对每行调用 `agent_color(r.agent, theme)`，chart-data.ts 的 `agentSegments`/`modelSegments`/`projectSegments`/`modelColorMap` 在循环里逐个调用 `top_category_color(i, theme)`：一次图表渲染产生几十次 palette 重建 × 每次约 30 次 getComputedStyle。表格行多或窗口内 records 大时（如 7d 窗口 ~137k rows 的派生路径），整帧渲染被样式计算拖慢。修复：给 `resolve_chart_palette` 加按 `(theme, revision)` 的模块级缓存（`revision_listeners` 已能感知主题变化，`use_chart_palette` 正是此模式），`agent_color`/`top_category_color` 改为复用缓存 palette；或改调用方一次性 `palette_for(theme)` 后取值传入。

- [Medium][60] src/main/core/local-api/server.ts:449 — web searchContent 响应合并循环对全量 `metadata_rows` 数组做 `includes(row)`（O(n·m)），且候选/元数据两次全量分页枚举 — `metadata_rows` 与 `candidate_rows` 均由 `session_history_query_all_sessions`（server.ts:254-268）逐页（100 行/页 SQL）全量拉取；合并循环（server.ts:449-456）对 n+m 行逐行 `metadata_rows.includes(row)`（数组线性扫描）+ `session_history_key_of` 字符串拼接。会话数千行时单次搜索请求产生 2N/100 次 `tokenStatsStore.query_sessions` SQL + O(n·m) 比较 + N 次 `resolve_session_file` 文件定位。桌面 IPC 层 `session-history-ipc.ts:295` 存在同模式（非本 chunk 文件，未单独计）。修复：预构建 `const metadata_set = new Set(metadata_rows)` 替代 `includes`；合并循环只遍历一次并查 Set。

- [Medium][55] src/main/core/local-api/server.ts:419-432 — searchContent 每次请求对候选行和 metadata 行做两次独立全量会话枚举（各含逐页 SQL + 逐行 resolve_session_file），无任何缓存 — `content_search_candidates`（filters 无 search）与 `session_history_query_all_sessions`（filters 带 search）在同一请求内各拉一遍全量会话，会话历史增长后每次 web 搜索请求都是双倍全量枚举；同 filters 的连续搜索也无法复用。修复：候选与 metadata 合并为单次枚举（search 命中集在内存再过滤），或对 `(sources,start,end)` 键加短 TTL 的结果缓存；至少让无 search 的候选路径直接复用 `/v1/sessions` 已有查询。

- [Medium][55] scripts/repo_template/repo_task/view_static/board.js:1072 — 看板拖拽 `pointermove` 每帧全量 `renderDag()`（重建全部 SVG 节点/边 + `layoutDag` 重算），hover（441-454）与搜索输入（1022-1033）同样全量重建 — 每次 `renderDag` 为每个节点/边重新创建 DOM 元素并重新执行 `layoutDag` 分层（其中 `l.indexOf(id)` 反复线性扫描，O(n²)）；鼠标在图上拖动或扫过节点时高频触发，task 数上百即明显卡顿。修复：`requestAnimationFrame` 节流 pointermove/hover 重渲染；hover/拖拽只更新 `opacity`/`transform` 属性而非重建整棵 SVG；`layoutDag` 的 `posInLayer` 改为一次构建后复用。

- [Low][40] src/renderer/lib/token-stats/chart-data.ts:228-237 — `prepareBarData` 的 session 轴对每个 record 执行 `rows.findIndex(...)`（O(records×20)）、project 轴执行 `dirs.indexOf(...)`（O(records×dirs)） — records 短窗口（\<7d）可为数万行，每行线性扫描前 20 会话/全量目录列表，累计数百万次比较；`prepareBarDataFromDashboardRollup`（chart-data.ts:1106-1110）的 labels 构建对每个 category 做 `rows.find` 同理（O(20×rows)）。修复：预构建 `session_id → index`、`dir → index` 的 Map（`prepareBarDataFromDashboardRollup` 中 category 已用 Set 判存在，`ranked_categories.indexOf` 同样可换 Map）。

- [Low][35] src/main/core/local-api/server.ts:656-690 — `serve_static` 每次请求 `fs.stat` + `fs.readFile` 全量读盘，非 `.html` 资产不设缓存头，服务器端零缓存 — SPA hashed 资产（JS/CSS/字体，文件名含内容哈希）每次页面刷新都重新整文件读入内存再响应，本地 loopback 下延迟小但 IO 重复；`index.html` 已正确 no-cache，但资产未获 immutable 缓存。修复：对非 `.html` 资产加 `Cache-Control: public, max-age=31536000, immutable`，并按 `web_root` 启动时一次性加载 hashed 资产到内存（或 LRU 缓存）。

- [Low][35] scripts/repo_template/repo_task/view_server.py:177-187 — 每次看板页面请求都全量重算 `compute_schedule()`（`discover_effective_tasks` 对每个未合并 task 分支各跑一次 `scan_tasks_at_ref`，每 task 一次 `git show` 子进程）再 `compute_batch_plan`，无缓存 — 页面刷新/多标签并发请求时重复执行数十字进程；`scan_tasks_at_ref`（store.py:101-144）对每个 task 单独 `git show ref:path`。修复：对 `compute_schedule` 结果加秒级 TTL 缓存（仓库状态未变时复用），`scan_tasks_at_ref` 改用 `git cat-file --batch` 一次性取全部文件。

- [Low][30] scripts/repo_template/repo_task/attempts.py:79-86 — `attempts_for_tid` 对每个 tid 调用 `project_attempts(events)` 全量投影所有 tid 的事件后再过滤；`in_flight_attempts`（382-395）对每个 tid 重复该全量投影 + `overlapping_attempts` 再次全量扫描 — ledger 事件数 E、tid 数 T 时开销 O(T×E)，事件累积后 `task.py ps`/`goal-check` 变慢（每次还要从磁盘全量读 JSONL）。修复：`project_attempts` 结果投影一次后按 tid 分组复用（`in_flight_attempts` 中 tids 循环改为基于单次投影）。

- [Info][20] src/shared/lib/logger.ts:170-180 — `scrub_meta` 每次 emit 对 meta 做 `JSON.stringify` + `JSON.parse` 双重序列化（`emit` 已先 `serialize_meta`，`createFileTransport` 还会再 `stringify` 一次），高频轮询/渲染日志路径成本累积 — 每次日志 2-3 次全量序列化；debug 级别在高频路径（如轮询）开启时明显。修复：scrub 改为单趟字符串替换或基于 `serialize_meta` 结果的对象树单次序列化。

- [Info][15] src/renderer/lib/token-stats/chart-data.ts:493-523 — `prepareHeatmapData` 对每个 record `new Date(r.timestamp)` 构造日期对象，窗口内 records 数万时重复分配 — 规模受查询 LIMIT 约束，通常可接受；如需优化可批量解析或复用日期缓存。

- [Info][15] src/renderer/lib/label-map-util.ts:47 — `existing.account_keys.includes(key)` 线性查重（O(k²)），`collect_upcoming_resets`（provider-usage.ts:615）内层对每个 account 重建 `new Set(watched_labels)` — 数据规模小（标签数个位数），当前无实际影响，仅记录观察。

No Critical/High findings. 本 chunk 未发现崩溃级或确定显著的性能 bug；主要问题集中在 web searchContent 全量枚举与 O(n²) 合并、echarts 调色板每次调用重建、看板全量重渲染三类。

## Reviewed files

Bundle `connectors_deepseek`: `connectors/deepseek/connector.ts`, `connectors/deepseek/manifest.json`
Bundle `connectors_kimi`: `connectors/kimi/connector.ts`, `connectors/kimi/manifest.json`
Bundle `root_config_01` (25): `.agents/skills/repo-template-sync/sync_state.json`, `.claude/settings.json`, `.github/workflows/ci.yml`, `.github/workflows/nightly.yml`, `.github/workflows/release.yml`, `docs/archive/_pre/omni_powers_sunset/op_execution/tasks_list.json`, `docs/archive/reviews/review_20260726_054747/_meta/_fire_meta.json`, `docs/archive/reviews/review_20260726_054747/_meta/_wait_status.json`, `docs/archive/tasks/t281_e2e_synthetic_fixture_connector_rebuild/handoff.json`, `docs/archive/tasks/t282_web_cookie_login_anon_poll_parity/handoff.json`, `docs/archive/tasks/t283_ui_component_theme_blackbox_check/handoff.json`, `docs/archive/tasks/t284_session_typography_test_robustness/handoff.json`, `docs/archive/tasks/t285_cli_import_rollback_guard/handoff.json`, `docs/archive/tasks/t288_cli_control_restart_relaunch_reap/handoff.json`, `docs/archive/tasks/t290_popup_view_height_act_wrap/handoff.json`, `docs/archive/tasks/t292_e2e_webserver_isolation/handoff.json`, `docs/archive/tasks/t293_config_save_conflict_cache_stale/handoff.json`, `docs/archive/tasks/t294_net_client_absolute_url_auth_exfil/handoff.json`, `docs/archive/tasks/t295_net_client_response_body_log/handoff.json`, `docs/archive/tasks/t296_vault_bak_file_permissions/handoff.json`, `docs/archive/tasks/t297_markdown_link_scheme_allowlist/handoff.json`, `docs/archive/tasks/t298_button_font_merge_and_danger_contrast/handoff.json`, `docs/archive/tasks/t299_lint_repo_template_js_tsconfig/handoff.json`, `docs/archive/tasks/t300_renderer_act_warnings_cleanup/handoff.json`, `docs/archive/tasks/t301_ui_token_alignment_pack/handoff.json`
Bundle `scripts_repo_template_repo_task` (20): `scripts/repo_template/repo_task/__init__.py`, `attempts.py`, `cli.py`, `context.py`, `control.py`, `documents.py`, `git_ops.py`, `goal.py`, `integration.py`, `ledger.py`, `lifecycle.py`, `monitoring.py`, `plan.py`, `scheduling.py`, `store.py`, `view_server.py`, `view_static/board.css`, `view_static/board.js`, `view_static/chain_plan.js`, `worktrees.py`
Bundle `src_main_core_local_api`: `src/main/core/local-api/server.ts`
Bundle `src_main_core_paths_ts`: `src/main/core/paths.ts`
Bundle `src_main_core_storage`: `src/main/core/storage/write-json.ts`
Bundle `src_main_security`: `src/main/security/csp.ts`
Bundle `src_preload_token_stats_events_ts`: `src/preload/token-stats-events.ts`
Bundle `src_renderer_components_AliasEditor_tsx`: `src/renderer/components/AliasEditor.tsx`
Bundle `src_renderer_components_CpaCard_tsx`: `src/renderer/components/CpaCard.tsx`
Bundle `src_renderer_components_LabelMapDialog_tsx`: `src/renderer/components/LabelMapDialog.tsx`
Bundle `src_renderer_components_RenameAccountDialog_tsx`: `src/renderer/components/RenameAccountDialog.tsx`
Bundle `src_renderer_components_UpcomingResetCard_tsx`: `src/renderer/components/UpcomingResetCard.tsx`
Bundle `src_renderer_components_add_account` (5): `ApiKeyForm.tsx`, `LocalScanForm.tsx`, `SessionForm.tsx`, `VendorPicker.tsx`, `add_account_params.ts`
Bundle `src_renderer_components_settings` (4): `BarSchemeField.tsx`, `Select.tsx`, `SetRow.tsx`, `Toggle.tsx`
Bundle `src_renderer_lib_01` (25): `account-overrides.ts`, `auth-flow-registry.ts`, `common-services.ts`, `config-debounce.ts`, `config-sync.ts`, `cookie_login_poll.ts`, `device-login-url.ts`, `display_label.ts`, `drag-reorder.ts`, `echarts_token_resolver.ts`, `is-web.ts`, `label-map-util.ts`, `logger-transport.ts`, `panel-navigation.ts`, `provider-usage.ts`, `refresh-intervals.ts`, `session-history/layout.ts`, `session-history/markdown.ts`, `session-library/filter.ts`, `session-resume.ts`, `session_meta.ts`, `theme.ts`, `token-stats/aggregate.ts`, `token-stats/chart-data.ts`, `token-stats/filter.ts`
Bundle `src_shared_lib` (6): `auth-error.ts`, `config_redaction.ts`, `connector-thresholds.ts`, `cookie_parser.ts`, `logger.ts`, `trend.ts`

## Read-only checks performed

- `git rev-parse HEAD` / `git log -1`：确认 HEAD `51ea3972`（chunk 基准）。
- 上游追踪：`session-history-ipc.ts` searchContent 路径（确认 local-api 与 IPC 层同模式全量枚举 + `metadata_rows.includes`）；`sessions_provider` 注入链（`index.ts:490` → `tokenStatsStore.query_sessions` 分页 SQL）；`use_popup_derived.ts` 中 `build_provider_usage_groups` 的 memo 边界；`TokenStatsView.tsx` / `BarChart.tsx` / `Heatmap.tsx` / `SessionTable.tsx` 中 `use_chart_palette` 与 `agent_color`/`top_category_color` 调用点与 memo 边界；`view_server.py` 请求→`compute_schedule` 调用链。
- 全部 99 个文件当前 HEAD 内容通读；root_config_01 内全部 JSON（含 17 个 handoff.json 与 3 个 workflow yml）用 `python3 -c json.load` 验证有效性并核对其调度/CI 缓存配置；未发现文件损坏或配置级性能问题。
- 性能语义核对：`config-debounce`（500ms 合并写盘）、`writeFileAtomic`（fsync+rename，正确性权衡）、`echarts_token_resolver` 的 revision 监听机制（确认 palette 缓存可安全按 revision 失效）。
