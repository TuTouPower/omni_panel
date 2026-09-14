# Bundle Review — performance | chunk 1

- **Perspective**: performance
- **Chunk**: 1（bundle index % 6 == 0，共 19 个 bundle / 83 个文件）
- **HEAD SHA**: `51ea3972efefea568cc2fba3e530ea5f69296182`（clean tree，`git status --porcelain` 为空）
- **审查方式**: 只读审查各 bundle `files` 的 HEAD 内容，并主动追踪上下游（observation-store / trend-ipc / config-store / index.ts / provider-usage / net-client / script-cache 等调用方）与全仓 grep 交叉验证。

## Findings

- [High][80] src/main/core/observation/observation-store.ts:340 — `prune()` 无任何生产调用方，`cacheMaxMb` 配置无消费者，observations 表无界增长 — 全仓 grep `\.prune\(` / `prune(` 仅命中该文件定义与 tests/integration/observation/observation-store.test.ts；`cacheMaxMb` 只在 src/renderer/views/settings-view/sections/data_section.tsx:28-43 被写入 config（UI 设置项），无任何代码读取它来裁剪数据。而每次成功刷新都会为每个 metric 插入新行（refresh-service.ts:319-332 → insert_stmt observation-store.ts:150-162，非 stale 不查重），stale 副本仅在同 observed_at 下去重（observation-store.ts:236-245）。结果：长期运行下 observations 行数单调增长（典型安装 15 连接器 × 每实例 2-10 metric × 每刷新周期一行），`query_trend_series`（290-338）、`list_latest_by_provider`（183-193）与 `list_by_source_instance_id`（199-209）的窗口函数/范围扫描成本随行数线性劣化，磁盘占用同步增长。修复建议：在 config-store 或 scheduler 中接入留存策略——启动与每日定时调用 `prune(now - 90d)`（或按 cacheMaxMb 折算行数预算），并将 data_section 的 cacheMaxMb 设置真正接到该逻辑。

- [Medium][70] src/main/core/observation/observation-store.ts:290 — `query_trend_series` 无 LIMIT 全窗口物化，且 TREND_GET_BULK 逐 period 串行整窗扫描 — SQL（228-232）取窗口内全部行（`observed_at >= start` 无 LIMIT），再在 JS 侧分桶降采样到 cap=120（318-337）；`build_trend_series`（trend-ipc.ts:46-62）对每个 period 单独执行一次完整窗口查询，一个账号展开 10 个 period 即 10 次全窗扫描。窗口越长（30 天）、刷新越密，读取行数越大，而输出恒 ≤120 点——大量 IO/内存被浪费。修复建议：把分桶下推到 SQL（按 `(observed_at - start)/bucket_width` GROUP BY 取每桶 `MAX(observed_at)` 行，或 `GROUP BY date` + LIMIT），使单查询返回行数 ≤ cap；批量接口可将同窗口 periods 合并为一次查询。

- [Medium][55] src/main/core/scheduler/refresh-service.ts:319 — 每次刷新逐观测单条 INSERT，无事务包裹，主进程同步 WAL 提交每行一次 — `deps.observationStore.insert(obs)` 在 for 循环内逐条调用（319-332），observation-store 未设 `PRAGMA synchronous`（默认 FULL）且 insert 为 better-sqlite3 同步调用（observation-store.ts:235-268），每条即一次 autocommit 写事务（含 fsync）。`refreshAll` 并发 5（533-537）时，多实例同时刷新会在主进程事件循环上累积成批同步磁盘提交（每轮 ~实例数×metric 数 次）。修复建议：在 observation-store 增加 `insert_batch(obs[])`，用 `db.transaction` 包裹（注意当前"逐条失败逐条记录"的语义会变为批量回滚或按批提交，需保留 per-obs 错误日志）。

- [Low][70] src/main/core/scheduler/runtime-store.ts:30 — 任一实例状态变更触发全量快照序列化 + 整文件原子写盘 — `schedulePersist()` 500ms 防抖（32-38）在每次 `updateState`（46-52）时重置，`cache.save(states)` 把全部实例的 ready/failed 状态整体序列化并 `writeJsonAtomic`（snapshot-cache.ts:165-178）。refreshAll 期间多实例连续更新时，单实例的一次状态变更会重复序列化其余所有实例的数据（每实例 items 数组含全量 MetricRecord），重复计算/IO 随实例数放大。修复建议：按实例粒度增量持久化（变更实例单独写条目），或合并多次更新为一次批量落盘。

- [Low][60] src/renderer/components/ProviderAccountRow.tsx:74 — trend 缓存 Map 无上限、无逐出策略 — `trend_cache_ref` 以 `provider||accountId||period.id||days` 为键缓存 sparkline 序列（74，98-107），切换 1/7/30 天窗口（80-85）各保留一份，同一账号周期数越多缓存条目越多；仅组件卸载时整体释放。展开期缓存命中可避免 IPC（设计合理），但常驻账号行的缓存随窗口切换与数据刷新无界累积。修复建议：限制缓存条目数（如按最近使用逐出），或在窗口切换时裁剪旧 days 条目。

- [Info][70] src/main/core/vault/file-vault-backend.ts:152 — 每次 set/delete 双文件写入，Windows 下额外 spawn 两次 icacls 子进程 — `write_vault` 对主文件 `writeJsonAtomic`（155）后另写 `.bak` 美化 JSON（161），且 `set_file_permissions` 在 win32 分支用 `execFile("icacls", ...)`（44-57），每个文件一次进程 spawn，即每次写盘 spawn ×2。非热路径（用户保存 secret 时触发），量级小。修复建议：.bak 写入改为异步合并/降频，或复用主文件权限结果跳过重复 icacls。

- [Info][60] src/main/core/scheduler/connector-scheduler.ts:58 — fire-and-forget 定时链不感知 refresh 耗时，慢刷新导致后续轮次被锁跳过 — `schedule_next` 到点即触发下一轮定时（58-72），不等待上一轮 `deps.refresh` 完成；当单次 refresh 耗时超过 interval（min 60s，constants MIN_REFRESH_INTERVAL_SECONDS）时，refresh-service 的 per-instance 锁（refresh-service.ts:226-229）使被占用的轮次直接跳过且不补跑，实际刷新率低于名义 interval。属设计权衡（防重入优于严格节奏），观察级提示。修复建议：可选——定时链改为"refresh 完成后调度下一轮"，或跳过时记录日志以便诊断。

## Reviewed files（19 bundles / 83 files）

- connectors_antigravity: `connector.ts`, `manifest.json`
- connectors_firecrawl: `connector.ts`, `manifest.json`
- connectors_minimax: `connector.ts`, `manifest.json`
- root\*config_03: `docs/archive/tasks/t328..t337*_/handoff.json`（10，JSON 元数据）、`docs/archive/tasks*index.json`、`docs/tasks_index.json`、`docs/spikes/s008*_/code/compare*aggregation.ts`、`compare_read_scale.ts`、`docs/spikes/s009*\*/code/wal_readonly_concurrency.ts`、`electron-builder.test.yml`、`electron-builder.yml`、`electron.vite.config.ts`、`eslint.config.ts`、`knip.json`、`package.json`、`playwright.config.ts`、`public/frontend_demo/app/{components.json,package.json,pnpm-workspace.yaml}`
- src_main_config_callbacks_ts: `config-callbacks.ts`
- src_main_core_main_panel: `agent-window-controller.ts`, `floating-bounds.ts`, `history-window-controller.ts`, `main-panel-config.ts`, `main-panel-controller.ts`, `main-panel-types.ts`
- src_main_core_scheduler: `connector-scheduler.ts`, `hydrate-runtime-store.ts`, `observation-mapping.ts`, `refresh-service.ts`, `runtime-store.ts`, `scheduler-orchestrator.ts`, `snapshot-cache.ts`, `types.ts`
- src_main_core_vault: `file-vault-backend.ts`, `vault-backend.ts`
- src_preload_index_ts: `index.ts`
- src_renderer_App_tsx: `App.tsx`
- src_renderer_components_Card_tsx: `Card.tsx`
- src_renderer_components_CpaLabelMapDialog_tsx: `CpaLabelMapDialog.tsx`
- src_renderer_components_ProviderAccountRow_tsx: `ProviderAccountRow.tsx`
- src_renderer_components_SessionSection_tsx: `SessionSection.tsx`
- src_renderer_components_UsageBarList_tsx: `UsageBarList.tsx`
- src_renderer_components_provider_card_content_tsx: `provider_card_content.tsx`
- src_renderer_components_ui: `Badge.tsx`, `Button.tsx`, `Card.tsx`, `Checkbox.tsx`, `Dialog.tsx`, `Input.tsx`, `Kpi.tsx`, `ListRow.tsx`, `Menu.tsx`, `PanelTitleBar.tsx`, `Progress.tsx`, `SecretInput.tsx`, `Segmented.tsx`, `Select.tsx`, `Skeleton.tsx`, `StatusDot.tsx`, `Switch.tsx`, `Textarea.tsx`, `icon-link.ts`, `index.ts`
- src_renderer_styles: `globals.css`
- src_shared_types: `config.ts`, `ipc.ts`, `oauth.ts`, `observation.ts`, `plugin.ts`, `token-stats.ts`

## 执行过的只读检查

- `git rev-parse HEAD` / `git status --porcelain`（确认干净树与 HEAD）
- 全仓 Grep：`prune(|\.prune|cacheMaxMb`（确认无生产调用方）、`build_provider_usage_groups|apply_account_overrides|buildAccountErrors`（确认 memo 边界）、`useMemo|useSelector` 于 PopupView
- 追踪阅读（bundle 外上下游）：`observation-store.ts`、`trend-ipc.ts`、`config-store.ts`、`index.ts`（1344 行全文）、`popup-height-controller.ts`、`net-client.ts`、`script-cache.ts`、`provider-usage.ts`、`shared/lib/trend.ts`
- handoff / tasks_index JSON 抽查（大小与内容类型确认）
