# Contract Review — bundle_contract_1

- perspective: `contract`
- chunk: `1`（index 0..110 中满足 `index % 6 == 0` 的 19 个 bundles）
- reviewed: 19 bundles / 83 files
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

审查方法：以 `src/shared/types/*` 为契约基准，对照 `src/preload/index.ts` 桥、`src/main/ipc/*` handler、`src/main/index.ts` 组装层与 renderer 消费方，交叉核对类型 optionality、载荷形状、错误码、分权路由与 spec/注释声称。以下 finding 按严重度排序。

## Findings

- [High][92] src/preload/index.ts:272-275 — 桌面 `sessionHistory.summaries` 把 `{summaries}` 包装对象当键值 map 返回，会话库首条消息摘要恒为空 — main handler（src/main/ipc/session-history-ipc.ts:336-338）返回 `ok({ summaries })`，即 IPC data 为 `SessionHistorySummariesResponse = { summaries: Record<locKey, text> }`；preload `summaries()` 却用 `invoke<Readonly<Record<string, string>>>` 把整个 data 断言成 map；消费方（src/renderer/components/session-library/SessionLibrary.tsx:304-305）读 `result[key_of(s)] ?? ""` → 对包装对象取键恒 `undefined` → 恒 `""`。web 桥（src/web/usageboard-web.ts:750-756）先解包 `data.summaries` 再返回，web 正常、桌面静默全空。两侧 key 格式一致（`source|env|session_id`，session-library-utils.ts:24-26 / subscription-service.ts:170-172），错位仅在 preload 解包层；`tests/unit/preload/` 无 summaries 形状测试，故未被拦截。
    - 修复：preload 改为 `const data = await invoke<SessionHistorySummariesResponse>(IPC_CHANNELS.SESSION_HISTORY_SUMMARIES, { locs }); return data.summaries;`（或 main 直接返回 map 并同步改 web 端点）；补 preload 级单测钉住返回形状。

- [Medium][80] src/shared/types/config.ts:95-100 — `AppConfiguration.tokenStats` 是「类型声明但持久化 schema 剥离、全仓无写入方」的假字段 — 持久化 schema `appConfigurationSchema`（src/main/core/config/types.ts）未含 `tokenStats`，zod object 默认 strip 未知键：每次 load（src/main/core/config/config-store.ts:133 `safeParse`）、每次 save（config-ipc.ts:112）、每次 import（config-ipc.ts:485）都静默丢弃该块。唯一读取方 `build_token_stats_config`（src/main/index.ts:417-424）恒取默认值（`wsl_enabled: true`、`poll_interval_ms: 600000`、`wsl_distro: "Ubuntu-22.04"`）；全仓 grep 无任何 `tokenStats:` / `wslEnabled:` 写入方。后果：① token-stats WSL/轮询配置无法持久化（恒默认）；② 导入含 `tokenStats` 的配置文件静默丢失该块，无任何报错。
    - 修复：二选一——在 `appConfigurationSchema` 补 `tokenStats` 子 schema（对齐 shared 类型），或从 shared `AppConfiguration` 删除该字段并移除 index.ts 读取代码，消除类型与持久化契约漂移。

- [Low][65] src/preload/index.ts:355-360 — `config.export(options?)` 在桌面端静默丢弃 options，`includeSecrets` 契约仅 web 路径生效 — `UsageboardApi.config.export(options?: ConfigExportOptions)`（src/shared/types/ipc.ts:560）承诺可选脱敏开关；preload `void options` 后无参 invoke；main `CONFIG_EXPORT` handler（config-ipc.ts:712-715）与 `handleConfigExport`（config-ipc.ts:547-579）不接受 options 且无条件导出全部密钥（源码注释「待澄清-1：明文导出密钥」）。当前 renderer 只在 web 模式传 `{ includeSecrets }`（SettingsView.tsx:263-264），无即时故障，但桌面侧类型契约与实现错配：未来调用方传 `{ includeSecrets: false }` 期望脱敏会静默导出全量密钥。
    - 修复：桌面 handler 支持并遵循 `includeSecrets`（复用 `handleConfigExportData` 的 strip/inject 逻辑），或从桌面 API 类型移除该参数并加注释说明桌面恒导出。

- [Low][55] src/main/ipc/token-stats-ipc.ts:154-163 — `tokenStats:status` 恒缺 `sources_status`，与共享 `TokenStatsStatus` 契约及 dashboard 状态不一致 — 共享类型 `TokenStatsStatus.sources_status?`（src/shared/types/ipc.ts:25-35）与 dashboard DTO（src/shared/types/token-stats.ts:469-478）均声明 per-source 采集状态；专有 status 通道只回 `{ running, last_updated }`，而同文件 dashboard 路径（token-stats-ipc.ts:129-138）会并入 `sources_status`。当前面板从 `dashboard.status` 取 `sourceIssues`（TokenStatsView.tsx:273），故无用户可见故障，但 status 通道的契约字段从不填充，任何依赖 `tokenStats:status` 的消费方都拿不到源级状态。
    - 修复：status handler 与 dashboard 路径一致并入 `deps.store.sources_status()`（空数组时省略字段保持兼容）。

- [Low][55] src/main/ipc/auth-ipc.ts:199-213 — 桌面 `AUTH_COOKIE_LOGIN` 永不返回 `started:true`，`poll_cookie_login` 轮询分支桌面不可达 — `CookieLoginResult.started?`（src/shared/types/ipc.ts:279-283）为 web 编辑路径的「立即触发 + status 轮询」契约；`startCookieLogin`（auth-ipc.ts:93-128，返回 `{started:true}`、维护 `cookie_login_states` 状态表并做并发 CONFLICT 前置检查）只在 web local-api 接线（src/main/core/local-api/server.ts:806），桌面 `registerAuthIpc` 直接调用阻塞式 `handleCookieLogin`（捕获完成或超时才返回 `{saved, reason}`）。renderer `poll_cookie_login`（src/renderer/lib/cookie_login_poll.ts:101-120）的 `result.started` 分支在桌面永不进入；桌面双击触发也绕过 auth-ipc 状态表（仅靠 session-manager 内部冲突兜底）。端到端文案仍可用（错误映射覆盖），但 started/poll 契约与桌面实现错配、两套行为并存。
    - 修复：桌面 channel 改走 `startCookieLogin`（同步返回 started，renderer 统一轮询，与 web 对齐），或从桌面契约移除 started 并删除死分支。

- [Info][40] src/preload/index.ts:405-407 — `main_panel.get_mode()` 绕过 `IpcResult` 解包，是全 API 面唯一裸 invoke 通道 — 其余通道均经 `invoke()`（`is_ipc_result` 校验 + 抛 `[code] message`），get_mode 直接 `ipcRenderer.invoke(IPC_CHANNELS.MAIN_PANEL_GET_MODE) as Promise<"popup"|"floating">`；main handler（src/main/index.ts:917-920）返回裸字符串。当前 handler 恒成功故行为正确，但错误契约（结构化解包/错误码）与其他通道不一致，且类型断言绕过运行时校验。
    - 修复：统一走 `invoke<"popup" | "floating">`，main 侧包 `ok(...)` 返回。

## Reviewed files

按 bundle（19 个）：

- connectors_antigravity: `connectors/antigravity/connector.ts`、`manifest.json`
- connectors_firecrawl: `connectors/firecrawl/connector.ts`、`manifest.json`
- connectors_minimax: `connectors/minimax/connector.ts`、`manifest.json`
- root_config_03: `docs/archive/tasks/t328..t337 的 10 个 handoff.json`、`docs/archive/tasks_index.json`、`docs/spikes/s008/...compare_aggregation.ts`、`compare_read_scale.ts`、`docs/spikes/s009/...wal_readonly_concurrency.ts`、`docs/tasks_index.json`、`electron-builder.test.yml`、`electron-builder.yml`、`electron.vite.config.ts`、`eslint.config.ts`、`knip.json`、`package.json`、`playwright.config.ts`、`public/frontend_demo/app/components.json`、`package.json`、`pnpm-workspace.yaml`
- src_main_config_callbacks_ts: `src/main/config-callbacks.ts`
- src_main_core_main_panel: 6 文件（agent-window-controller / floating-bounds / history-window-controller / main-panel-config / main-panel-controller / main-panel-types）
- src_main_core_scheduler: 8 文件（connector-scheduler / hydrate-runtime-store / observation-mapping / refresh-service / runtime-store / scheduler-orchestrator / snapshot-cache / types）
- src_main_core_vault: `file-vault-backend.ts`、`vault-backend.ts`
- src_preload_index_ts: `src/preload/index.ts`
- src_renderer_App_tsx: `src/renderer/App.tsx`
- src_renderer_components_Card_tsx / CpaLabelMapDialog_tsx / ProviderAccountRow_tsx / SessionSection_tsx / UsageBarList_tsx / provider_card_content_tsx: 各 1 文件
- src_renderer_components_ui: 20 文件（Badge/Button/Card/Checkbox/Dialog/Input/Kpi/ListRow/Menu/PanelTitleBar/Progress/SecretInput/Segmented/Select/Skeleton/StatusDot/Switch/Textarea/icon-link/index）
- src_renderer_styles: `src/renderer/styles/globals.css`
- src_shared_types: 6 文件（config / ipc / oauth / observation / plugin / token-stats）

## 执行过的只读检查

- 契约基准对照：preload 全部 89+ 通道（`invoke`/事件订阅/裸 invoke）逐一与 main `ipcMain.handle` 注册、载荷 schema 比对（config-ipc / connector-ipc / auth-ipc / session-ipc / grok/kimi*auth_ipc / trend-ipc / token-stats-ipc / session-history-ipc / popup-ipc / event-ipc / build-info-ipc / log-ipc / main/index.ts TRAY*_/WINDOW\__/SETTINGS*\* / MAIN_PANEL*\*）。
- renderer 消费方追踪：`cookie_login_poll.ts`、`WebLoginSection.tsx`、`SettingsForm.tsx`、`SettingsView.tsx`、`use-config.ts`、`use-popup-ui-config.ts`、`use-route.ts`、`panel-navigation.ts`、`SessionLibrary.tsx`、`TokenStatsView.tsx`、`provider_card_content.tsx`、`UsageBarList.tsx` 等。
- web 桥对照：`src/web/usageboard-web.ts`（summaries/searchContent/export 形状差异即 finding 1/3 依据）。
- 持久化 schema 对照：`appConfigurationSchema` vs shared `AppConfiguration`（finding 2）；`connectorConfigurationSchema` vs `ConnectorConfiguration`（refresh sentinel 0 / clamp [60,172800] 一致）。
- 分权路由：`assert_valid_sender` / `assert_setting_route` 与 preload 四路由（setting/tray/session/default）能力矩阵对照；`select_*_api` 与 main 窗口 route（usage/setting/agent/session/tray，window-manager.ts）一致。
- 数据文件一致性：`docs/tasks_index.json`（空，符合 docs/tasks/ 仅剩 task_template）与 `docs/archive/tasks_index.json`（337 条、tid 有序无重复、目录齐全）。
- git 检查：`git rev-parse HEAD`（51ea3972）；`git log --oneline -3`；t337/t282/t278 归档 review 文档交叉核对 cookie 登录链路语义。

## 统计

- findings: 6（High 1 / Medium 1 / Low 3 / Info 1）
- 最高级别: High
