# Review bundle: architecture | chunk 6

- Perspective: `architecture`
- Chunk: 6（bundle index % 6 == 5）
- Bundles reviewed: 18（connectors_exa, connectors_mimo, root_config_02, src_main_cli, src_main_core_logging_ts, src_main_core_popup, src_main_core_token_stats, src_main_window, src_preload_usageboard_api_ts, src_renderer_components_Button_tsx, src_renderer_components_CpaConnectorSettings_tsx, src_renderer_components_ProviderAccountList_tsx, src_renderer_components_SecretInput_tsx, src_renderer_components_UpcomingResetRow_tsx, src_renderer_components_forms, src_renderer_components_token_stats, src_renderer_lib_02, src_shared_schemas）
- Files reviewed: 79（另有 8 个上下游文件用于交叉验证）
- HEAD: `51ea3972efefea568cc2fba3e530ea5f69296182`

## Findings

- [Medium][90] src/renderer/components/Button.tsx:9 — 生产死代码，仅被单测引用 — 全仓 grep：`components/Button` 只在 `tests/unit/renderer/components/button.test.tsx:4` 出现，`src/` 下所有 Button 生产使用均走 `components/ui/Button`（ui/index.ts、PanelTitleBar、各 settings/popup-view）。即 `components/Button.tsx`（variant: default/ghost/outline）是生产不可达的死组件，其 7 个单测断言的是一个从不上屏的组件，构成假覆盖（button.test.tsx 全部断言对应用无意义）。修复建议：删除 `components/Button.tsx` 与 `button.test.tsx`（或把测试迁移到 `components/ui/Button` 并按真实语义重写）。同目录 `components/Card.tsx` 仅被 `card.test.tsx` 引用，疑似同类死代码，可一并核查。

- [Low][95] src/main/core/popup/popup-height-controller.ts:10 — MAX_HEIGHT_RATIO 由 75% 改 100% 后注释与 spec 未同步 — git log 显示 commit `60fa5f06 feat(t081): popup 高度上限 75% -> 100%` 把 `MAX_HEIGHT_RATIO` 改为 1.0，但本文件 docstring 仍写 "Clamped to [collapsed_min, floor(workArea.height * 0.75)]"（:55）、"never exceeds the 75% constraint"（:58）、"we must not exceed the 75% screen rule"（:66），且 `docs/specs/window-management.md:33` 仍约束「不超过 75% 工作区高度」。实现（100%）与注释/spec（75%）三处错位，后续维护会按错文档调参。修复建议：把 :55/:58/:66 注释改为 100% 语义，并同步更新 `docs/specs/window-management.md`。

- [Medium][60] src/main/core/token-stats/collector.ts:121 — emitted_record_keys 无界增长，长驻进程内存随累计记录数单调膨胀 — `emitted_record_keys` 是 utilityProcess 长驻进程内的 Set，每条首次发射的记录 key（source|env|message_id）加入后永不淘汰；注释声称「bounded by total distinct message count」，但该总量随会话历史持续增长（文件内自述活跃安装曾观测 ~200k 记录/轮），数月运行后可达数十万~百万级 key，常驻内存数十 MB 且不可回收（进程只在崩溃重启时重建）。修复建议：持久化后按窗口/时间裁剪（如只保留最近 N 天记录的 key），或改为依赖 DB 幂等（INSERT OR REPLACE）去掉内存去重、用 state 文件记录已发射上限。

- [Low][80] src/main/window/window-bounds.ts:16 — 面板最小尺寸常量与 window-manager WINDOW_CONFIGS 重复定义 — `PANEL_MIN_WIDTH=480 / PANEL_MIN_HEIGHT=360`（window-bounds.ts:16-17）与 `WINDOW_CONFIGS` 中 setting/agent/session 的 `minWidth: 480 / minHeight: 360`（window-manager.ts:52-53, 72-73, 85-86）值重复、语义同源，改一处不会联动另一处（如只改 clamp 常量会导致保存的 bounds 与窗口最小尺寸不一致）。修复建议：window-manager 从 window-bounds 导入常量，或统一收敛到单一导出。

- [Low][70] src/main/cli/import-config.ts:73 — secret 转存循环中途失败不回滚已写入的 vault key — 第 73-92 行逐 key `secretsStore.set` 前记录 `rollback_entries`，但 rollback 只在后续 `configStore.save` 失败时执行（:116-130）；若循环内某次 `set` 抛错（vault 写入失败），函数直接 reject，之前已写入的 vault key 留在 vault 且无任何回滚，形成「vault 有、config 无」的半导入状态（config 未覆盖、.bak 已写）。修复建议：把 secret 循环包进 try/catch，失败时执行已累积的 `rollback_entries` 再抛；或把 vault 写入整体纳入与 config save 相同的回滚事务。

- [Low][85] src/renderer/components/CpaConnectorSettings.tsx:85 — 三个 props 被 void 掉，接口保留死成员 — `onRefresh`、`providerLabelMaps`、`selectedProvider` 在 props 接口中声明并在解构后 `void`（:89-91），没有任何消费路径，调用方（CpaCard）仍按接口传参，形成无意义的契约面与调用成本。修复建议：从 `CpaConnectorSettingsProps` 删除这三个字段，并同步清理调用方传参。

- [Low][75] src/renderer/components/token-stats/SessionTable.tsx:113 — 分页块大小硬编码 100，与父组件 SESSION_QUERY_LIMIT 隐式耦合 — `go_to_page` 中 `onPageChange(Math.floor(start / 100) * 100)` 假定父组件（TokenStatsView.tsx:33 `SESSION_QUERY_LIMIT = 100`）按 100 行分块加载；若父组件改 limit（如 50），当 pageSize（最大 50）超过分块大小时目标页会落空：`requestedStart >= loadedEnd` 恒真 → 反复 `onPageChange(0)` 仍无法命中已加载窗口，页面停在「该筛选条件下暂无记录」且无法翻页。修复建议：把分块大小作为 prop 传入（与父组件共享同一常量），或在父组件把 offset 直接传给 onPageChange。

- [Medium][70] src/renderer/components/token-stats/SessionTable.tsx:60 — 客户端排序只作用于已加载窗口，却呈现为全局排序 — `sortSessionRows` 仅对当前已加载的 `rows`（按 ended_at 拉取的最近 100 行，limit 见 TokenStatsView.tsx:33）排序，而表头/分页（totalRows）暗示全局排名；按「tokens」降序排在第一位的是"最近 100 行里 tokens 最多"，不是全库最高，且 maxTokens 进度条分母同样窗口局部。查询层（query_dashboard_sessions）不接收 order_by，无法实现真正全局排序。修复建议：排序条件下沉到查询层（query 增加 order_by），客户端仅做展示；或至少在 UI 标注「排序仅限已加载范围」。

- [Low][70] connectors/exa/connector.ts:6 + connectors/mimo/connector.ts:39 — 连接器脚本内联 helper 重复且状态语义漂移 — `is_record`/`to_number`/`parse_limit` 在 exa 与 mimo 脚本中各实现一份（runtime.ts:66-88 `compile_script` 会剥离 import，脚本无法共享代码，但可经 ctx 注入，已有 `ctx.status` 先例）；因各自独立实现，「无 limit」场景状态语义漂移：exa 用 `"unknown"`（connector.ts:83），mimo 用 `"normal"`（connector.ts:137），同一情形在不同连接器展示不同含义。另 mimo 的 `cycleDurationMs` 硬编码 30 天（connector.ts:118）而 reset_at 取自 API 实际周期，与 exa 按 period 实算（connector.ts:55-58）口径不一致。修复建议：在 `compile_script` 注入共享的数值/状态 helper（如 ctx.util），并统一「无 limit」的状态约定（建议 unknown）。

- [Low][60] src/main/core/token-stats/manager.ts:172 — 熔断器跳闸后 collector 无恢复路径，状态与"已停止"不可区分 — 快速崩溃 5 次后 `current_config = null`（:176）并永久停止自动重启；此后 `update_config` 仅把 config 写入 `current_config` 且只在 `child` 存在时 postMessage（:229-232），IPC 层（token-stats-ipc.ts）也只有 `is_running()` 读取，无任何路径能重启 collector——用户改配置、开关 token stats 之外只能重启应用。熔断状态用 `current_config=null` 表达，与 `stop()` 后的状态（同样 null）无法区分，是状态机建模缺陷。修复建议：引入显式 breaker 状态字段，配置更新或应用重启时复位计数并允许重新 spawn。

## Reviewed files

- connectors/exa/connector.ts, connectors/exa/manifest.json
- connectors/mimo/connector.ts, connectors/mimo/manifest.json
- docs/archive/tasks/t302…t327 共 25 个 handoff.json（root_config_02，结构一致：tid/attempt/execution_id/status/branch/base_sha/tests/blackbox/review/ac_evidence/pending/findings，全部 done，无架构问题）
- src/main/cli/args.ts, src/main/cli/cli-json.ts, src/main/cli/client.ts, src/main/cli/import-config.ts
- src/main/core/logging.ts
- src/main/core/popup/popup-height-controller.ts
- src/main/core/token-stats/{manager,collector,claude-reader,kimi-reader,grok-reader,opencode-reader,paths,reader-utils,scan-state,query-dispatcher,query-worker,token-stats-store}.ts
- src/main/window/window-bounds.ts, src/main/window/window-manager.ts
- src/preload/usageboard-api.ts
- src/renderer/components/Button.tsx, CpaConnectorSettings.tsx, ProviderAccountList.tsx, SecretInput.tsx, UpcomingResetRow.tsx
- src/renderer/components/forms/{CpaMgmtForm,ExaServiceKeyForm,OAuthDeviceForm,WebLoginForm}.tsx
- src/renderer/components/token-stats/{BarChart,Heatmap,MetricDonut,RangePicker,SessionTable}.tsx
- src/renderer/lib/token-stats/{format,query-cache,types}.ts, src/renderer/lib/usage-colors.ts, src/renderer/lib/utils.ts, src/renderer/lib/workspace/{copy-format,pane,selection-store,slots,workspace-storage}.ts
- src/shared/schemas/{auth,manifest,observation,plugin-metadata,plugin-output}.ts

## Cross-traced files（只读验证）

- src/main/core/connector/host-io.ts（ConnectorContext 契约，确认脚本不可共享代码、ctx.status 先例）
- src/main/core/connector/runtime.ts（compile_script 剥离 import/export，确认连接器脚本 standalone 设计）
- src/main/index.ts:400-450、566（token-stats manager start/update_config 接线）
- src/main/ipc/token-stats-ipc.ts（仅 is_running 读取，确认无重启路径）
- src/renderer/views/TokenStatsView.tsx:33、1047-1077（SESSION_QUERY_LIMIT=100、SessionTable 传参）
- src/renderer/components/ui/Button.tsx、tests/unit/renderer/components/button.test.tsx、card.test.tsx（死代码证据）
- src/shared/types/token-stats.ts、src/main/ipc/connector-ipc.ts、config-store.ts:165（usageProviderSchema/cpa 例外）
- docs/specs/window-management.md:33（75% 约束与实现 100% 错位）
- git log/blame：popup-height-controller.ts（60fa5f06 75%→100%）、HEAD 51ea3972

## 执行的只读检查

- `git rev-parse HEAD` / `git log --oneline -3`
- 全仓 Grep：`components/Button` / `components/Card` 生产引用（仅测试引用）
- Grep：`usageProviderSchema` 使用点、`manager.` 在 token-stats-ipc 的调用
- Bash 批量解析 25 个 handoff.json 的 key 集与字段一致性
- python 读取 connectors/cpa/manifest.json provider 字段
