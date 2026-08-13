# Contract Review — chunk 3

- perspective: `contract`
- chunk: `3`（bundle index % 6 == 2，index 从 0 起）
- 审过 bundles: 19，files: 60
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][85] scripts/package-and-run.ts:13 — Linux 分支 pkill/pgrep 进程名大小写不匹配，`pnpm package:run` 无法杀掉已运行实例 — 打包产物名为 `omni_panel`（小写，见 `run_packaged` line 82 `artifacts/linux-unpacked/omni_panel` 与 `artifacts/` 实产物），而 `kill_omni` 用 `pkill -f OmniPanel`（line 13）、`wait_for_exit` 用 `pgrep -f OmniPanel`（line 41）、兜底用 `pkill -9 -f OmniPanel`（line 58）。`pkill/pgrep -f` 匹配区分大小写，均匹配不到 `omni_panel`：旧实例不被杀、`wait_for_exit` 误判"已全部退出"直接返回，随后 `run_packaged` spawn 新实例，新实例因 single-instance lock（src/main/index.ts:149）立即 `app.quit()`，控制台却打印 "packaged app started"；旧实例继续运行，用户以为重启成功实为失败。Windows 分支用 `OmniPanel.exe` 与产物一致，仅 Linux 分支错。修复：Linux 分支改用 `pkill -f -i omni_panel`（或显式列 `omni_panel`，与 `run_packaged` 的 exe 名同源）。

- [Medium][90] src/main/index.ts:186 — CLI `--cli help` 输出声称 `omni_panel --help` 可用，但裸 `--help` 不会触发帮助 — `parse_cli_args`（src/main/cli/args.ts:77）只认 `argv.indexOf("--cli")`，`--help` 不含 `--cli` 时返回 `{cli:false}`，应用正常启动（弹窗/托盘），而非打印帮助后退出。帮助文本第二行"帮助：omni_panel --help 或 omni_panel --cli help"与实现契约不符，误导用户。修复：删除 `--help` 表述，仅留 `omni_panel --cli help`；或在 parse_cli_args 把裸 `--help`/`-h` 归一为 help 命令并补单测。

- [Medium][85] src/web/usageboard-web.ts:714 — web shim `sessionHistory.recent` 签名与共享契约不符，按契约调用会静默返回错误数据 — 共享类型 `SessionHistoryApi.recent(source: string, env: string, limit: number)`（src/shared/types/ipc.ts:408，desktop preload src/preload/index.ts:229 按此三参 invoke），web 实现 `recent: async () => { const sessions = await get_json("/v1/sessions"); return sessions.slice(0, 20) }`：无视 source/env 过滤、无视 limit（硬编码 20）、返回全来源混合列表。任何遵循共享类型的调用方（当前 renderer 无调用，属潜伏漂移）在 web 端会拿到错误来源/错误条数。修复：透传 source/env/limit 到 `/v1/sessions`（该端点已支持 source/env/limit 参数，local-api server.ts:1244-1269）。

- [Low][90] scripts/designmd.ts:2 — 脚本头注释与实现/package.json 的 CLI 参数形式不一致 — 头注释写 `designmd export --format css-tailwind`（空格分隔，line 2/6），`main()` 只接受 `format === "--format=css-tailwind"`（line 182），package.json:32 `designmd:export` 也用 `=` 形式。按注释手敲空格形式会落入 usage 分支 exit 1。修复：统一注释为 `--format=css-tailwind`（与 usage 错误信息 line 198 一致）。

- [Low][75] connectors/glm/manifest.json:18 — script + poll 并存时 poll 声明是死契约，与 runtime 分发行为不一致 — manifest 声明 `capabilities: ["poll"]` + 完整 `poll.request`/`map`，同时声明 `script`；refresh-service.ts:179 判断 `manifest.script` 优先，`execute_poll` 对该连接器永不执行。`poll.map: {}` 又是空映射（schema 要求 used/limit 必须为 `$` JSON path），任何按 manifest poll 段理解采集方式的人都读到误导性契约。tavily/manifest.json:18 同构。修复：脚本型连接器删除 poll 段（capability 改 `local` 或仅保留 script），或 runtime 对 script+poll 并存时报配置错误。

- [Low][70] connectors/codex/connector.ts:118 — `window: "day"` 配 `cycleDurationMs: null`，违反观察类型契约注释 — src/shared/types/observation.ts:33-37 规定"固定周期用常量（如 7d），rolling/未知用 null"；codex 固定日窗口却给 null，下游按 `cycleDurationMs` 推导周期/进度的消费者拿不到周期信息。修复：`cycleDurationMs: 24 * 3_600_000`。

- [Low][65] src/renderer/components/TokenPanel.tsx:39 — 分段选择器（今天/最近一周/最近一月）切换无任何数据效果，UI 契约与实现错位 — `range` state 仅驱动 Segmented 显示，`display_value` 只依赖 `total_tokens`/`has_real_data` 且无按 range 取数逻辑；唯一调用方 PopupView.tsx:893 固定传 `has_real_data={false}`，切换 range 数字恒为"暂无历史数据"。修复：要么按 range 取数并传入，要么移除该分段控件（避免用户以为可切换时间范围）。

- [Low][60] src/main/index.ts:349 — `createRefreshService` 的 `sessionLogin` 闭包在 `const sessionManager`（声明于 line 594）初始化前引用，存在 TDZ 竞态窗口 — `registerConfigIpc`（line 584）早于 `sessionManager` 创建注册；若在此窗口收到 config save IPC，`onConfigSaved` → `orchestrator.reconcile` 可能对 session 能力连接器立即刷新，auth 错误路径进入 `sessionLogin` → 访问未初始化 binding 抛 ReferenceError（被 refresh-service catch 吞掉，re-login 失败）。当前启动顺序下窗口为毫秒级且 renderer 尚未就绪，实际不可达，但属声明顺序脆弱点。修复：把 `sessionManager` 创建挪到 `registerConfigIpc` 之前，或 `sessionLogin` 内部惰性取用。

- [Info][80] src/web/usageboard-web.ts:267 — `connector.snapshot: () => Promise.resolve({})` 与共享契约 `snapshot(): Promise<Record<string, ConnectorSnapshotDTO>>`（src/shared/types/ipc.ts:539）语义不符 — web shim 恒返回空对象，任何按契约读取快照的调用方会静默拿到空数据。renderer 当前无调用方（仅 `connector.list()` 路径），属 API 面 stub 漂移。修复：实现为 `Object.fromEntries((await get_json("/v1/connectors")).map(c => [c.instanceId, c.snapshot]))`，或标记 deprecate 并在类型上去除。

## Reviewed files（本 chunk 全部 60 个）

- connectors/codex/connector.ts, connectors/codex/manifest.json, connectors/glm/connector.ts, connectors/glm/manifest.json, connectors/tavily/connector.ts, connectors/tavily/manifest.json
- scripts/designmd.ts, scripts/export-schemas.ts, scripts/gen-build-info.ts, scripts/package-and-run.ts, scripts/smoke_check.md, scripts/token-stats-baseline.ts, scripts/token-stats-spike.ts
- src/main/core/config/auto-seed.ts, config-store.ts, secret_param_keys.ts, secrets-store.ts, types.ts
- src/main/core/observation/observation-store.ts
- src/main/core/session-history/claude-code-extractor.ts, grok-extractor.ts, head-read.ts, kimi-extractor.ts, opencode-extractor.ts, session-locator.ts, session-path-index.ts, subscription-service.ts, types.ts
- src/main/index.ts
- src/preload/oauth_api.ts
- src/renderer/components/AccountRow.tsx, ConfirmDelete.tsx, DragGrip.tsx, ProviderNav.tsx, TokenPanel.tsx, VendorCard.tsx
- src/renderer/components/session-library/AgentFilterChips.tsx, SelectionDock.tsx, SessionCard.tsx, SessionLibrary.tsx, SessionList.tsx, SessionPreview.tsx, SessionRow.tsx, session-library-utils.ts
- src/renderer/hooks/use-config.ts, use-device-login.ts, use-echarts.ts, use-now-tick.ts, use-plugins.ts, use-popup-height-report.ts, use-popup-ui-config.ts, use-resize-observer.ts, use-route.ts, use_connector_catalog.ts, use_dnd_handlers.ts, use_popup_derived.ts, use_provider_tab_drag.ts, use_tab_navigation.ts
- src/renderer/vite-env.d.ts
- src/web/usageboard-web.ts

## 执行过的只读检查

- `git rev-parse HEAD` / `git log`：HEAD `51ea3972`；对 scripts/package-and-run.ts 查 git log 确认无 `// @review-ok` 豁免、无近期改写掩盖。
- 上游/下游追踪：manifest schema（src/shared/schemas/manifest.ts）与三个 manifest；runtime.ts/refresh-service.ts 的 script>poll>probe 分发优先级；observation schema（src/shared/schemas/observation.ts、types/observation.ts）与 connector 输出字段；token-stats-store 接口与 token-stats-baseline 查询参数（RecordFilters/Heatmap/Hour/RollupFilters）；grok/kimi oauth manager（oauth_helpers.ts）与 preload/ipc 参数序；session-history-ipc.ts 与 subscription-service 的 SessionsProvider/QueryOptions/recent_sessions 接线；preload/index.ts 与 shared/types/ipc.ts 的 SessionHistoryApi/recent 签名；local-api server.ts 的 /v1/sessions（sources/order_by 解析）、/v1/config、/v1/secrets、/v1/connectors 端点形状；main-panel-config.ts 的 resolve_main_panel_mode（确认 get_mode 仅返回 popup|floating）；popup-ipc.ts + size-validation.ts 与 use_popup_height_report 载荷；electron-builder 产物名（artifacts/linux-unpacked/omni_panel）与 package-and-run 的 pkill 模式比对。
- Grep 确认：renderer 无 `sessionHistory.recent` / `connector.snapshot()` 调用方；`--help` 无其它处理路径；TokenPanel 唯一调用点（PopupView.tsx:893）。
