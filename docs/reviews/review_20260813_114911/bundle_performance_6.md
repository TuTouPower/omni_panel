# Code Review Bundle — performance | chunk 6

- perspective: performance
- chunk: 6（`index % 6 == 5`，共 18 个 bundle）
- 审查 bundle 数: 18
- 审查文件数: 79（含 root_config_02 的 25 个 handoff.json，全部 JSON 校验 + 结构扫描 + 3 个精读样本）
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][95] src/main/core/token-stats/token-stats-store.ts:977 — 每批 upsert 全量重建 buckets 表（批数 × 全表聚合的冗余 CPU） — `upsert_sessions` 每批末尾执行 `delete_buckets_stmt.run()` + `insert_buckets_stmt.run()`（INSERT ... SELECT ... FROM token_stats_daily GROUP BY source, env, date, model 全表聚合，见 255-276 行）。manager.ts `apply_batches`（manager.ts:69-99）把 collector 单轮 update（records 上限 200k，collector.ts:518 `MAX_RECORDS * 20`）切成 2000 条/批，最多 100 批，每批都触发一次全量 buckets 重建；daily 行数随 session×天数×模型增长（活跃安装可达数万行），中间批次的聚合结果立刻被下一批覆盖，属明确重复计算。且 `apply_batches` 运行在主进程（manager.ts:81），每批内同步事务阻塞事件循环数十 ms。修复：把 buckets 重建推迟到整轮最后一批（如 manager 在 apply_batches 收尾时单次重建，或 store 累积「本批是否最后一批」标志），或改为按受影响 (source, env, date) 增量重算。

- [Medium][85] src/main/core/token-stats/collector.ts:121 — `emitted_record_keys` 内存集合单调增长无淘汰 — `record_key` 对每条已发射记录入 Set，注释承认 "grows monotonically but is bounded by the total distinct message count"；数据总量无界（每 session 的 assistant 消息持续追加，多年使用可达数百万条），每条 key（`source|env|message_id`，message_id 为 32 位 hex + 前缀）约 60-100 字节，常驻进程内存随历史消息总量线性增长数十至数百 MB，且每轮 collect 都要对新记录做集合查询（collector.ts:513）。重启后集合清空属缓解而非根治。修复：按时间窗裁剪（只保留近 N 天的 message_id 去重需要——增量扫描下旧记录不会重发），或把去重状态纳入 scan-state 持久化并限制条数。

- [Low][80] src/main/core/logging.ts:98 — 文件 transport 每条日志一次 `stat` + 一次 `appendFile`（open/write/close） — transport 回调中先 `stat(logFile)` 判断轮转、再 `appendFile(logFile, line + "\n")`（119 行）；fs/promises 的 appendFile 每次打开/关闭 fd，加上 stat 共 3 次系统调用/条，且全部经 `pending_write` 串行链（96 行），日志量大时（NODE_ENV≠production 默认 debug，session-history subscription poll 2s/次、connector 轮询均打日志）写放大明显、串行链成为日志吞吐瓶颈。修复：复用持久 fd 或批量缓冲（如每 100ms 合并写），size 检查改为缓存值周期 stat；至少将 stat 结果缓存到写入后。

- [Low][75] src/main/core/token-stats/collector.ts:550 — 每轮 poll 无条件全量序列化并 fsync 写 scan-state — `void save_state(state_path)` 在每次 collect 后 fire-and-forget：`serialize_state` 全量序列化全部 sources 的 mtimes/files/facts（scan-state.ts:116-128 走 writeJsonAtomic → 含 fsync，write-json.ts:32-46），即使本轮所有 mtime 未变、无任何新数据也完整重写；state 文件随历史 jsonl 文件数增长（数千文件 × facts 对象，数百 KB 级）。默认 poll 10 分钟一次尚可（index.ts:423 `pollIntervalMinutes ?? 10`），但配置允许任意正数。修复：collect 时跟踪 dirty 标志，无新数据跳过保存；或节流（如至多每 10 分钟一次）。

- [Low][70] src/main/core/token-stats/token-stats-store.ts:598 — rollup ready 后 dashboard 查询仍按窗口全量扫 raw records 构建 session_meta / window_models — `materialize_session_meta`（598-614 行）与 `window_models`（1388-1393 行）始终从 `token_stats_records` 按 `[start, end)` 窗口做全窗口窗口函数（MIN/MAX/SUM/ROW_NUMBER OVER PARTITION）与 `SELECT DISTINCT model`，未走已就绪的 hour_rollup/window_rows（window_rows 缺 timestamp 列无法派生）；30 天高密度窗口（数十万条 records）每次查询 O(窗口消息数)，query-worker 有 10s 超时（query-dispatcher.ts:37），大窗口下查询耗时随消息量线性增长。修复：rollup 路径从 window_rows 派生 session 级元数据（rollup 分组含 session_id/hour_start，可推窗口内 min/max 与最新 title），或把 session_meta 建成持久化增量表。

- [Low][85] src/renderer/components/token-stats/SessionTable.tsx:93 — `maxTokens` 每渲染全数组扫描且未 memo — `Math.max(...rows.map((r) => r.tokens), 1)` 在组件体直接计算，任何 state 变化（勾选 checkbox、翻页、排序）都触发 O(rows) 全扫描；`display_models`（73-83 行）同样每行每渲染重建 dedup 数组（models 每行最多 50 个）。rows 达数百条时重复计算可观察。修复：`maxTokens` 用 useMemo（依赖 rows），`display_models` 结果按行 memo 或把模型标签解析上提为 useMemo。

- [Low][70] src/renderer/lib/workspace/pane.ts:104 — `compute_visible_window` 每次调用全量重算 offsets（O(n) 数组分配） — VirtualMessageList 在 scroll 事件每帧 `set_scroll_top`（VirtualMessageList.tsx:114-119），useMemo 依赖 scroll_top 每帧变化 → 每帧对全部 messages 重建 offsets 数组（pane.ts:112 `compute_message_offsets` 全量循环 + 新建数组）；messages 数千条时滚动期间每帧 O(n) 分配与遍历，长会话滚动可能掉帧；prepend 补偿路径（VirtualMessageList.tsx:146/163/178）也重复全量计算。修复：offsets 与 heights 解耦为独立 useMemo（heights/estimate 变化才重算），scroll_top 变化仅做二分定位而不重建 offsets；或按需增量计算。

- [Info][60] src/renderer/components/ProviderAccountList.tsx:76 — 每个 account 每次渲染重建合并 label map 对象 — `{ ...labelMap, ...per_account_map, ...per_provider_map }` 在 map 回调内对每个 account 每渲染新建对象；group.accounts 多且父组件高频重渲染（如拖动/实时刷新）时产生重复对象分配与 spread 成本。修复：per_provider_map/per_account_map 按 group/connector 引用 memo 后仅在其变化时合并。

- [Info][60] src/renderer/views/settings-view/sections/accounts_section.tsx:110 — `hasSecrets` 回退 `?? {}` 使 CpaConnectorSettings 的 effect 每渲染触发 getSecrets IPC — `has_secrets[editing_cpa_id] ?? {}` 在条目缺失时每次渲染新建 `{}` 对象；CpaConnectorSettings.tsx:122-151 的 useEffect 依赖 `hasSecrets`（对象引用），引用变化导致 effect 每次渲染重跑 `window.usageboard.config.getSecrets` + `setSecret`（CpaConnectorSettings.tsx:134-146），编辑表单每次按键都发一次 IPC 并写回 state。修复：`?? {}` 改为模块级常量或 useMemo 稳定引用，或将 hasSecrets 依赖改为 `hasSecrets?.cpa_mgmt_key` 布尔值。

## 已审 bundle 与无 finding 说明

- connectors_exa / connectors_mimo：单 poll 各 1-3 次 HTTP + Map 聚合，无性能问题。
- root_config_02：25 个 task handoff.json 交接元数据（20-40 行/个），无执行逻辑。
- src_main_cli：瘦客户端单次调用即退，`wait_quit_confirmed` 500ms×20 次轮询有界，无问题。
- src_main_core_popup / src_main_window：纯逻辑 / move-resize 事件经 `last_saved` 签名去重 + config scheduleSave 500ms debounce（config-store.ts:445），无问题。
- src_preload_usageboard_api_ts、Button/SecretInput/UpcomingResetRow、components_forms、src_shared_schemas：无性能敏感路径。

## Reviewed files

- connectors/exa/connector.ts, connectors/exa/manifest.json
- connectors/mimo/connector.ts, connectors/mimo/manifest.json
- docs/archive/tasks/t302..t327 共 25 个 handoff.json（t302/t303/t305/t306/t307/t308/t309/t310/t311/t312/t313/t314/t315/t316/t317/t318/t319/t320/t321/t322/t323/t324/t325/t326/t327）
- src/main/cli/args.ts, cli-json.ts, client.ts, import-config.ts
- src/main/core/logging.ts
- src/main/core/popup/popup-height-controller.ts
- src/main/core/token-stats/claude-reader.ts, collector.ts, grok-reader.ts, kimi-reader.ts, manager.ts, opencode-reader.ts, paths.ts, query-dispatcher.ts, query-worker.ts, reader-utils.ts, scan-state.ts, token-stats-store.ts
- src/main/window/window-bounds.ts, window-manager.ts
- src/preload/usageboard-api.ts
- src/renderer/components/Button.tsx, CpaConnectorSettings.tsx, ProviderAccountList.tsx, SecretInput.tsx, UpcomingResetRow.tsx
- src/renderer/components/forms/CpaMgmtForm.tsx, ExaServiceKeyForm.tsx, OAuthDeviceForm.tsx, WebLoginForm.tsx
- src/renderer/components/token-stats/BarChart.tsx, Heatmap.tsx, MetricDonut.tsx, RangePicker.tsx, SessionTable.tsx
- src/renderer/lib/token-stats/format.ts, query-cache.ts, types.ts
- src/renderer/lib/usage-colors.ts, utils.ts
- src/renderer/lib/workspace/copy-format.ts, pane.ts, selection-store.ts, slots.ts, workspace-storage.ts
- src/shared/schemas/auth.ts, manifest.ts, observation.ts, plugin-metadata.ts, plugin-output.ts

## 执行的只读检查

- `git rev-parse HEAD`（51ea3972）、`git log --oneline -5`
- bundle.json 全量读取与 chunk 归属计算（index % 6 == 5 → 18 bundles）
- 关联追踪：manager.ts apply_batches ↔ store.upsert_sessions/buckets 重建链路；collector `emitted_record_keys`/`save_state` ↔ scan-state.ts/write-json.ts（fsync）；index.ts:423 tokenStats.pollIntervalMinutes 默认 10 分钟；VirtualMessageList.tsx scroll 每帧 setState ↔ pane.ts compute_visible_window；TokenStatsView currentSessionRows useMemo 稳定性；SettingsView/accounts_section/use-config hasSecrets 引用来源与 CpaConnectorSettings useEffect 依赖；window-bounds saver ↔ config-store.scheduleSave（500ms debounce）
- root_config_02 25 个 handoff.json：python json.load 全部解析成功、status=done、结构一致，3 个精读样本
- 未修改任何文件
