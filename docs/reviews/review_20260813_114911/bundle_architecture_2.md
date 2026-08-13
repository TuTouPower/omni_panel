# Code Review — architecture / chunk 2

- Perspective: architecture（职责边界、耦合、重复、死代码、错误归位、复杂度、可维护性）
- Chunk: 2（bundle 按 id 排序，index % 6 == 1）
- Bundles reviewed: 19 / 111
- Files reviewed: 65 个 bundle 主文件 + 8 个关联文件（runtime/manifest-loader/host-io/tier1-poll-executor/probe-executor/connector-scheduler/refresh-service/BarChart/slots 等，含 grep 定位）
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

审过 bundle：`connectors_claude`、`connectors_getoneapi`、`connectors_opencode_go`、`root_config_04`、`src_main_core_auth`、`src_main_core_network`、`src_main_core_session`、`src_main_e2e_headless_ts`、`src_preload_log_throttle_ts`、`src_renderer_components_AccountRow_tsx`、`src_renderer_components_CollapsibleCard_tsx`、`src_renderer_components_DeviceLoginSection_tsx`、`src_renderer_components_ProviderCard_tsx`、`src_renderer_components_SettingsForm_tsx`、`src_renderer_components_UsageRows_tsx`、`src_renderer_components_provider_card_states_tsx`、`src_renderer_components_workspace`、`src_renderer_views`、`src_web_main_web_tsx`。

## Findings

- [High][95] src/main/core/auth/grok_oauth_manager.ts:99-469 — grok/kimi 两个 OAuth manager 近全量重复（各 ~300 行），且已出现行为漂移 — `enqueue_token_mutation`/token generation/`await_completion`/`cancel_device_login`/`get_login_status`/`refresh_now`/`schedule_retry`/`schedule_auto_refresh_if_enabled`/`start|stop_auto_refresh`/`reconcile_auto_refresh`/`shutdown` 在两个文件里逐字重复（grok 99-126/169-345/356-469 ↔ kimi 126-153/213-387/400-515）。漂移已实际发生：kimi `logout`（kimi_oauth_manager.ts:389-398）会 `cancel_device_login` 并清 `retry_failure_counts`，grok `logout`（grok_oauth_manager.ts:347-354）两者都不做；kimi `stop_auto_refresh`（:477）清 retry 计数而 grok（:430-434）不清——同一语义在两 provider 上行为不一致。t127 已把纯函数抽进 `oauth_helpers.ts`，但 manager 层仍整体复制。修复建议：把 device-code OAuth manager 参数化（endpoints/client_id/header builder/device-id resolver），grok/kimi 只保留常量与差异配置，删除两份重复实现。
- [Medium][90] connectors/getoneapi/manifest.json:26-33 — manifest 声明 `poll.request`/`poll.map` 是死配置，实际永远走 script — `refresh-service.ts:179-187` 分派顺序为 `manifest.script` 优先、`poll`/`probe` 仅在无 script 时执行；getoneapi 同时带 `script: "connector.ts"`（manifest.json:34），因此 poll 块永不执行，`map: {}` 与硬编码在脚本里的 `POST /back/user/balance` 无任何同步约束，可随服务端协议漂移而失真。修复建议：从 manifest 删除 `poll` 块（保留 `capabilities: ["poll"]` + script），或反方向去掉 script 纯用 poll 配置。
- [Medium][70] src/renderer/views/TokenStatsView.tsx:181-1082 — 单一组件混合查询编排、LRU 缓存、分页、偏好持久化、别名解析、5 组过滤与全部渲染，且每个持久化偏好字段手工维护 prev-ref 写回范式 — 1082 行内 12 个 useState + 5 个 useRef + 8 组 config/事件 effect，`loadData` 同时承担加载/缓存命中/兜底刷新/错误归位；同类范式（apply_config + prev ref + 函数式 setter）在 PopupView.tsx（936 行，17 state + 12 ref）与 SettingsForm.tsx（716 行）里各自再实现一遍，t153/t222/t250/t261 注释表明该范式反复踩坑。实际风险：任何新偏好字段都要手工复制整套同步/回显抑制逻辑，改动面大且无复用。修复建议：抽出通用「受控 config 偏好」hook（apply + prev-ref + 值相等保留 + 防抖写回），三处统一接入。
- [Medium][75] src/main/core/scheduler/connector-scheduler.ts:98-104 — `refreshNow` 与 `start` 的 immediate 刷新都不做 in-flight 去重，与 refresh-service 的 per-instance 锁存在两层并发控制 — 用户连点「刷新全部」/「刷新」时每个实例的 refresh 并发触发，靠 `refresh-service.ts:207` 的 locks 兜底（超时 5min）；但 `refreshNow` 返回 void，调用方无法感知被锁跳过，UI spinner 状态（PopupView t196 f003 逻辑）与真实执行可能短暂错位。修复建议：`refreshNow` 返回是否已受理（或被锁），spinner 绑定受理结果。
- [Low][95] src/renderer/components/workspace/SessionPane.tsx:364-368 — 本地 `format_tokens` 逐字复制 `src/renderer/lib/workspace/slots.ts:151-155` — 同一文件顶部已 `import { agent_accent, vendor_id_for_source, type SlotSession } from "../../lib/workspace/slots"`（SessionPane.tsx:4），却另写一份相同实现；两处后续改动可能不同步（如切千分位格式）。修复建议：删除本地定义，直接 import slots 的 `format_tokens`（SessionPickerModal 已是此用法）。
- [Low][90] public/frontend_demo/app/src/components/library/sessionMeta.ts:6-12 与 public/frontend_demo/app/src/components/workspace/format.ts:6-12 — 同名 `formatTokens` 行为分叉 — 前者阈值 `>=1000`（`v.toFixed(1)` 再去 `.0`），后者阈值 `>=10000`（`toLocaleString` 兜底）；同一 demo app 内卡片行与 meta 行对同一 token 数渲染出不同格式（如 12,345 → `12.3k` vs `12k`）。修复建议：抽共享 `lib/format.ts` 单一实现。
- [Low][85] src/renderer/views/settings-view/sections/about_section.tsx:178-194 — 「检查更新」卡片是无操作死按钮 — `ABOUT_URLS` 无 `update` 键（about_section.tsx:13-21），`onClick` 内 `if (url)` 恒不成立；桌面与 web 端均渲染成点了没反应的 Button，而 TrayMenu.tsx:131-133 已有可用 `tray.check_update()`。修复建议：接 `window.usageboard.tray.check_update()`，或去掉该卡片（sub 文案「当前已是最新」不反映真实状态）。
- [Low][85] src/renderer/components/DeviceLoginSection.tsx:194-198 — `user_code` 假分支 — 三元 `device_code.user_code ? <a href=url> : <code>{device_code.user_code}</code>`：有 code 时显示验证 URL，无 code（空串，`DeviceCodeStart.user_code` 为必填 string）时却在 `<code>` 里渲染空串，else 分支意图与实现相反且不可达有效内容。修复建议：else 分支显示 `device_code.verification_uri`（或移除分支）。
- [Low][80] src/renderer/views/SettingsView.tsx:705-757 — 两个近重复 ConfirmDelete 处理块 — `deleteConfirmId`（705-727）与 `removeCpaConfirmId`（728-757）除 title/confirmLabel 与 `set_editing_cpa_id` 清理外逐行相同（同样的 `with_removed_connector` + filter plugins + save_config）。修复建议：合并为单一 confirm 状态 `{ id, title?, confirmLabel? }`，onConfirm 共用 handler。
- [Low][80] src/renderer/components/ProviderCard.tsx:17 — `is_auth_error` 经两层再导出间接取用 — ProviderCard 从 `./provider_card_states`（其第 6 行 `export { is_auth_error }`）导入，ProviderAccountRow.tsx:5 却直接从 `../../shared/lib/auth-error` 导入，refresh-service.ts:14-17 也再导出同一函数；同仓库 3 处口径。修复建议：统一直接从 `shared/lib/auth-error` 导入，删除 provider_card_states 与 refresh-service 的再导出。
- [Low][75] src/renderer/views/TokenStatsView.tsx:593-596 — 遗留空数组参数线 — `currentRecords/currentBuckets/hourBuckets/rollup` 声明为 `never[]` 恒为空并透传给 BarChart（:1023-1037）；全仓唯一调用方（TokenStatsView.tsx:11 导入）始终带 `chartData`，BarChart.tsx:138-157 的 records/buckets/hourBuckets/rollup 分支对该调用方不可达，属无消费方的遗留数据路径。修复建议：删 BarChart 遗留 props 与本地 4 个常量，仅保留 chartData 路径（或保留时加注释说明测试用途）。
- [Low][65] src/renderer/components/workspace/use-workspace-columns.ts:370 — 30s 兜底轮询与订阅推送双通道重复拉取 — `setInterval(refresh_all, FALLBACK_MS)` 每 30s 对全部 ready 槽位无条件 `query`（:314-339），与 `onMessagesUpdated` 推送并存；8 槽 × 大会话时每 30s 全量重拉（每次 HISTORY_PAGE_SIZE 条），即使订阅一直健康。修复建议：以订阅心跳/最近事件时间戳跳过无变化的轮询，或把 FALLBACK_MS 拉长并只在订阅缺失窗口启用。
- [Low][60] src/renderer/views/settings-view/sections/accounts_section.tsx:198-211 — 状态 setter 三层透传 — SettingsView 向 AccountsSection 传 ~20 个 props，AccountsSection 再原样转传 11 个 setter 给 AccountsList；任一对话框状态增减需同步改 3 处签名。修复建议：把 dialog/confirm/rename 状态族收敛为单一 context（或单一 state 对象 + 一个 dispatch），按需解构。

## Reviewed files

Primary（按 bundle）：

- connectors_claude: connector.ts, manifest.json
- connectors_getoneapi: connector.ts, manifest.json
- connectors_opencode_go: connector.ts, manifest.json
- root_config_04: public/frontend_demo/app/src/components/library/sessionMeta.ts, public/frontend_demo/app/src/components/workspace/format.ts, public/frontend_demo/app/src/hooks/use-mobile.ts, public/frontend_demo/app/src/lib/store.ts, public/frontend_demo/app/src/lib/types.ts, public/frontend_demo/app/src/lib/utils.ts, public/frontend_demo/app/tsconfig.app.json, public/frontend_demo/app/tsconfig.json, public/frontend_demo/app/tsconfig.node.json, public/frontend_demo/app/vite.config.ts, schemas/plugin-metadata.schema.json, schemas/plugin-output.schema.json, tsconfig.json, vite.web.config.ts
- src_main_core_auth: grok_oauth_manager.ts, kimi_oauth_manager.ts, oauth_helpers.ts
- src_main_core_network: effective_proxy.ts, proxy-pool.ts
- src_main_core_session: session-manager.ts
- src_main_e2e_headless_ts: e2e-headless.ts
- src_preload_log_throttle_ts: log-throttle.ts
- 单文件组件 7 个: AccountRow.tsx, CollapsibleCard.tsx, DeviceLoginSection.tsx, ProviderCard.tsx, SettingsForm.tsx, UsageRows.tsx, provider_card_states.tsx
- src_renderer_components_workspace（12）: MarkdownMessage.tsx, PaneMessageRow.tsx, RecentSessionsModal.tsx, SelectionTray.tsx, SessionPane.tsx, SessionPickerModal.tsx, SessionRail.tsx, VirtualMessageList.tsx, WorkspaceToolbar.tsx, WorkspaceView.tsx, use-workspace-columns.ts, workspace-view-helpers.ts
- src_renderer_views（17）: PopupView.tsx, SettingsView.tsx, TokenStatsView.tsx, TrayMenu.tsx, popup-view/{EmptyState,NetBanner,SkeletonCard,TitleBar,UpcomingResetCardSlot,lib}.tsx, settings-view/lib.ts, settings-view/sections/{about_section,accounts_list,accounts_section,appearance_section,data_section,general_section}.tsx
- src_web_main_web_tsx: main-web.tsx

Supporting（只读追踪）: src/main/core/connector/{manifest-loader,runtime,host-io,tier1-poll-executor,probe-executor,script-cache}.ts、src/main/core/scheduler/{refresh-service,connector-scheduler}.ts、src/renderer/components/token-stats/BarChart.tsx、src/renderer/lib/workspace/slots.ts（grep）、src/renderer/hooks/use-echarts.ts（grep）。

## Read-only checks performed

- 读取 `docs/reviews/review_20260813_114911/_meta/bundle.json`，按 id 排序取 index % 6 == 1 的 19 个 bundle。
- `git rev-parse HEAD` 确认审查基线 `51ea3972`。
- `git log`/`git blame`：验证 grok/kimi manager 重复的历史来源（t127 抽 oauth_helpers 后 manager 仍复制）、getoneapi manifest 自 t050 起即带 poll+script 双配置、SessionPane format_tokens 引入时间。
- grep 验证 refresh-service.ts:179-187 的 script>poll>probe 分派顺序（确认 getoneapi poll 为死配置）。
- grep 验证 `is_auth_error` 的三处导入/再导出路径与 BarChart 唯一调用方（确认 TokenStatsView 空数组 props 无其他消费方）。
- 对比 slots.format_tokens 与 SessionPane 本地实现（逐字相同）。
