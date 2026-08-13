# Review Bundle — architecture | chunk 1

- perspective: architecture
- chunk: 1（index % 6 == 0，index 从 0 起）
- bundles: 19 / 111
- files: 83
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`
- bundles: connectors_antigravity, connectors_firecrawl, connectors_minimax, root_config_03, src_main_config_callbacks_ts, src_main_core_main_panel, src_main_core_scheduler, src_main_core_vault, src_preload_index_ts, src_renderer_App_tsx, src_renderer_components_Card_tsx, src_renderer_components_CpaLabelMapDialog_tsx, src_renderer_components_ProviderAccountRow_tsx, src_renderer_components_SessionSection_tsx, src_renderer_components_UsageBarList_tsx, src_renderer_components_provider_card_content_tsx, src_renderer_components_ui, src_renderer_styles, src_shared_types

## Findings

- [Medium][85] src/preload/index.ts:355 — config.export 的 includeSecrets 选项在桌面 IPC 路径被静默丢弃，公开契约跨端不一致 — 证据：`UsageboardApi.config.export(options?: ConfigExportOptions)`（shared/types/ipc.ts:560）与 `ConfigExportOptions.includeSecrets`（shared/types/ipc.ts:246-248）声明该能力；preload `config_full.export` 中 `void options;` 后 `invoke(IPC_CHANNELS.CONFIG_EXPORT)` 不带任何参数；主进程 handler（config-ipc.ts:712-715）`handleConfigExport(deps)` 不接收 options，`includeSecrets` 恒为 false。对比：web 端 usageboard-web.ts 的 export 走 `/v1/config/export?includeSecrets=`（local-api/server.ts:1343-1348 支持）、CLI `get_config_export` 同样支持 includeSecrets，均有单测覆盖（usageboard-web.test.ts:391-418）；SettingsView.handleExport（SettingsView.tsx:263-265）在 web_mode 下传 `{ includeSecrets }`、桌面传 undefined——桌面端用户永远拿到无 secrets 导出且无任何提示，调用方无法感知选项被忽略 — 修复建议：IPC handler 透传 options（`handleConfigExport(deps, options)`，config-ipc.ts 已有 `handleConfigExportData` 支持），preload 把 options 序列化进 invoke；或若桌面有意排除 secrets，从 `UsageboardApi` 类型与 `ConfigExportOptions` 移除该选项并在文档注明桌面行为，避免"类型承诺、实现失效"的死参数。

- [Medium][75] src/renderer/components/CpaLabelMapDialog.tsx:68 — fire-and-forget 保存产生 unhandled rejection 且乐观更新不回滚，错误归位缺失 — 证据：`void on_save_config({ ...config, accountOverrides: next })` 丢弃 promise；`on_save_config` 链为 SettingsView.save_config（SettingsView.tsx:150-158）→ use-config.save（use-config.ts:80-94），save 返回原始 promise `p`（`save_queue_ref.current = p.catch(...)` 只消化队列尾，返回的 `p` 失败仍会 reject），且 save 在调用 IPC 前已 `setConfig(newConfig)` 乐观更新——IPC 失败时内存态与磁盘不一致且无 UI 反馈、无回滚。SettingsView 内还有多处同类 `void save_config(...)`（183/197/541/681/713/740 行）共享同一缺陷 — 修复建议：统一包装一个返回已消化 rejection 的保存函数（如 `save_config = async (p) => { try { await save(p) } catch (e) { setDataMsg("保存失败"); throw e } }`）供所有 `void` 调用点使用，或至少在 fire-and-forget 处 `.catch` 记录并回滚乐观更新。

- [Low][85] src/renderer/components/Card.tsx:6 — 死组件：顶层 Card 无任何引用，与 ui/Card 重复 — 证据：全仓 grep 无 `components/Card` import（`ui/Card` 被 SessionCard.tsx:9、SessionTable.tsx:4、ui/index.ts:3 引用）；knip 未报（tsx 组件导出判定），但 `export function Card` 仅此一处且零消费；git 历史来自 t274 "clean legacy css" 提交，属迁移残留。且其样式 `rounded-[var(--radius-sm)]` 与 ui/Card 的 `rounded-lg` token 用法不同，两套并存造成选择困惑 — 修复建议：删除顶层 `src/renderer/components/Card.tsx`，统一使用 `ui/Card`。

- [Low][80] connectors/firecrawl/manifest.json:18 — manifest 的 poll.request 段是死配置：与 script 并存时永不被消费 — 证据：refresh-service.execute_connector（refresh-service.ts:179-192）分支顺序 `script` → `poll` → `probe`，firecrawl/minimax 均声明 `script: "connector.ts"`，故 poll 段（firecrawl/manifest.json:18-25、minimax/manifest.json:18-25）仅在删掉 script 后才生效，当前改 poll 配置（path/method/map）对行为零影响，维护者易被误导 — 修复建议：移除这两个 manifest 的 poll 段，或加注释说明"脚本缺失时的回退请求定义"。

- [Low][75] connectors/antigravity/connector.ts:8 — 未实现占位连接器：恒返回空观测，manifest 却声明 local 能力与扫描路径 — 证据：`main()` 恒 `return []`；manifest.json:4-9 声明 `capabilities: ["local"]` + `local.paths: ["~/.antigravity/session.json"]`，脚本却不读任何路径（无 ctx 文件访问）。用户添加该账号后 execute_connector 走 script 分支得空观测，refresh-service.ts:373-395 在无历史时标 failed（"connector returned no observations"），有历史时保留旧数据——即该连接器永远不会产生数据。git 历史显示来自批量提交 "feat: add connector manifests for all UI-exposed providers"，无后续实现 — 修复建议：实现 local 读取逻辑或从 UI 暴露的 provider 列表中移除；若为计划占位，应在 manifest 或添加对话框标注"暂不支持"。

- [Low][75] src/preload/index.ts:285 — session_history 的 disabled 与 open_only 两个 stub 对象 8 个方法逐字重复 — 证据：`session_history_open_only_methods`（305-322）与 `session_history_disabled_methods`（285-301）除 open 外（subscribe/unsubscribe/query/recent/searchContent/summaries/onMessagesUpdated/onFocus）8 个方法完全相同；新增通道时需同步改两处，易遗漏 — 修复建议：提取工厂 `create_session_history_disabled(open: ...)`，open_only 传入真实 open、disabled 传入 no-op open。

- [Low][70] src/renderer/components/ui/SecretInput.tsx:47 — t269 统一组件库内图标风格漂移：显隐切换用 emoji（🙈/👁）而非 lucide — 证据：同库 Select.tsx 用 lucide ChevronDown、Button 等均走 lucide/Icon 体系；emoji 渲染跨平台字体不一致且与 DESIGN.md 图标规范不符 — 修复建议：改用 lucide 的 Eye/EyeOff 图标（项目已依赖 lucide-react）。

- [Low][60] src/preload/index.ts:405 — main_panel.get_mode 绕过统一 IPC 结果约定 — 证据：`get_mode` 直接 `ipcRenderer.invoke(...) as Promise<"popup"|"floating">`，是 preload 中唯一不走 `invoke()`（is_ipc_result 校验 + `[code] message` 错误解包）的返回型通道（其余返回型通道全部经 invoke，如 71-81 行）；主进程 handler（index.ts:918-919）返回裸字符串。当前 handler 不会抛错故无行为风险，但通道约定不一致——未来若 handler 失败，renderer 收到裸 rejection 而非规范化 IpcError，且绕过校验的返回值不可信 — 修复建议：改用统一 `invoke<"popup"|"floating">(IPC_CHANNELS.MAIN_PANEL_GET_MODE)`。

- [Info][85] src/renderer/styles/globals.css:221 — `--color-chip-active` 仅暗色翻转块定义、light 无定义且全仓零消费 — 证据：@theme 导出 `--color-chip-active-dark: #363c48`（82 行），`.dark` 块赋值 `--color-chip-active`（221 行），但 :root light 块无对应定义，且 grep 全仓无组件引用 `--color-chip-active` — 修复建议：删除该暗色 token 或补上 light 定义；若为 designmd-export 生成块，在导出模板侧移除。

- [Info][65] src/shared/types/ipc.ts:541 — deprecated 别名 `plugin` 的类型与 preload 注入面不精确对齐 — 证据：`UsageboardApi.plugin` 类型仅声明 list/getState/refresh/refreshAll 4 方法（541-547 行），preload `plugin: connector_methods`（index.ts:554）注入含 catalog/snapshot 共 6 方法——结构类型下编译通过，但类型欠约束、多余能力静默暴露在 deprecated 别名上 — 修复建议：preload 改用 `Pick<typeof connector_methods, "list"|"getState"|"refresh"|"refreshAll">` 对齐类型，或直接删除 plugin 别名（renderer 已无消费者时）。

- [Info][65] src/main/config-callbacks.ts:25 — 回调签名声明接收 config 参数但实现不接收 — 证据：`createOnConfigImported` 返回类型为 `(config: AppConfiguration) => void`，实现为无参箭头函数 `return () => {...}`；调用方 config-ipc.ts:539 `deps.onConfigImported?.(saved_config)` 传入的 config 被静默丢弃。TS 少参函数可赋给多参签名故编译通过，但接口契约暗示依赖 config 而实现不消费，未来调用方会误以为回调可读 config — 修复建议：将返回类型改为 `() => void`，或在实现中接收 config 并记录（若未来需要）。

- [Info][60] src/main/core/scheduler/scheduler-orchestrator.ts:24 — plugins→connectors 兼容映射层与局部接口字段重复 — 证据：`to_connector_list_config` 将 `{ plugins }` 映射为 `{ connectors }`，`ConnectorListEntry`（10-15 行）手工声明 enabled/instanceId/refreshIntervalSeconds/manualRefreshOnly 四个字段，与 `ConnectorConfiguration`（shared/types/config.ts:107-118）逐字段重复且未复用类型；注释自述为"持久化 schema 仍用兼容字段 plugins"的过渡层 — 修复建议：待 schema 迁移完成后删除映射层；过渡期可 `type ConnectorListEntry = Pick<ConnectorConfiguration, ...>` 复用字段声明，避免两处漂移。

## Reviewed files

全部 19 个 bundle 的 83 个文件（HEAD 内容）：

- connectors_antigravity/: connector.ts, manifest.json
- connectors_firecrawl/: connector.ts, manifest.json
- connectors_minimax/: connector.ts, manifest.json
- root_config_03: docs/archive/tasks/t328..t337/handoff.json ×10, docs/archive/tasks_index.json, docs/spikes/s008_tokenstats_incremental_rollup_aggregation/code/compare_aggregation.ts, compare_read_scale.ts, docs/spikes/s009_tokenstats_query_process_isolation/code/wal_readonly_concurrency.ts, docs/tasks_index.json, electron-builder.test.yml, electron-builder.yml, electron.vite.config.ts, eslint.config.ts, knip.json, package.json, playwright.config.ts, public/frontend_demo/app/{components.json, package.json, pnpm-workspace.yaml}
- src/main/config-callbacks.ts
- src/main/core/main-panel/: agent-window-controller.ts, floating-bounds.ts, history-window-controller.ts, main-panel-config.ts, main-panel-controller.ts, main-panel-types.ts
- src/main/core/scheduler/: connector-scheduler.ts, hydrate-runtime-store.ts, observation-mapping.ts, refresh-service.ts, runtime-store.ts, scheduler-orchestrator.ts, snapshot-cache.ts, types.ts
- src/main/core/vault/: file-vault-backend.ts, vault-backend.ts
- src/preload/index.ts
- src/renderer/App.tsx
- src/renderer/components/Card.tsx
- src/renderer/components/CpaLabelMapDialog.tsx
- src/renderer/components/ProviderAccountRow.tsx
- src/renderer/components/SessionSection.tsx
- src/renderer/components/UsageBarList.tsx
- src/renderer/components/provider_card_content.tsx
- src/renderer/components/ui/: Badge.tsx, Button.tsx, Card.tsx, Checkbox.tsx, Dialog.tsx, Input.tsx, Kpi.tsx, ListRow.tsx, Menu.tsx, PanelTitleBar.tsx, Progress.tsx, SecretInput.tsx, Segmented.tsx, Select.tsx, Skeleton.tsx, StatusDot.tsx, Switch.tsx, Textarea.tsx, icon-link.ts, index.ts
- src/renderer/styles/globals.css
- src/shared/types/: config.ts, ipc.ts, oauth.ts, observation.ts, plugin.ts, token-stats.ts

## 执行的只读检查

- git rev-parse HEAD（51ea3972）、git status（干净）、git log --oneline（最近 5 提交 + 3 个 connector 目录历史）
- git log/blame 验证 antigravity/firecrawl/minimax connector 与顶层 Card.tsx 的引入提交
- 跨模块追踪：preload export → config-ipc.ts handler（handleConfigExport 无 options）→ local-api/server.ts（支持 includeSecrets）→ usageboard-web.ts（web 端透传）→ SettingsView.handleExport 传参；use-config.save 返回 promise 行为与 SettingsView/CpaLabelMapDialog 的 void 调用点；MAIN_PANEL_GET_MODE handler 与 preload invoke 路径；observation-store stale 副本去重（t174 delete_stale_dup_stmt）；config-store.scheduleSave debounce（main-panel save_floating_bounds 高频写盘无碍）；execute_connector script/poll/probe 分支；runtime.ts 脚本执行；connector-ipc capabilities→source 映射；use-config.ts 全文；SettingsView.tsx 关键段
- 静态工具：npx knip（默认 + json reporter，未发现未使用文件/新死组件，顶层 Card 为导出级死代码 knip 未覆盖）
- 关联测试：usageboard-web.test.ts config.export 双形态（web 支持 includeSecrets）、config-ipc.test.ts handleConfigExportData({includeSecrets:true})、cli/client.test.ts includeSecrets 路径——均只覆盖 web/local-api/CLI，桌面 IPC 的 options 丢弃无测试覆盖（佐证契约缺口）
