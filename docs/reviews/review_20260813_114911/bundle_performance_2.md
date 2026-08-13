# Code Review Bundle: performance | chunk 2

- perspective: performance
- chunk: 2（bundle index % 6 == 1，index 从 0 起）
- bundles reviewed: 19 / 111
- files reviewed: 65
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`（2026-08-13 11:23:05 +0800）

## Findings

- [Medium][70] src/renderer/lib/workspace/selection-store.ts:29 — selection_store.has() 对 items 数组做线性扫描（items.some），被每条可见消息行的渲染路径调用 — WorkspaceView.tsx:187 `is_selected` 透传给每条可见消息行（SessionPane.tsx:287 `selected={is_selected(m.id)}`），每次消息推送/选中变更重渲染时对每个可见行执行 O(已选数量) 扫描；shift 全选数百条消息后，一次渲染成本为 可见行数×已选数（如 30 可见 × 300 已选 = 9000 次字符串比较），且随每次 live 推送重复。t226 引入（commit 75e6056c6）。修复：store 内额外维护 `Set<key>`（或 `Map<key, index>`）做 O(1) 判重，toggle/set_session/clear_session 同步维护。
- [Medium][65] src/renderer/components/workspace/SessionPane.tsx:74 — outline_items 无条件对整列消息做 summarize()，outline 抽屉关闭时也全量计算 — `outline_items` useMemo 依赖 `column.messages`，在 outline_open 从未打开（绝大多数面板常态）时每次消息推送（live 订阅每几秒一条）仍对全部消息做正则压缩（summarize 内 `\s+` regex）；8 槽位 × 数百消息时每推一条重算 O(消息数)，属于可避免的重复计算（t225 引入）。修复：把 `outline_items` 计算移入 `outline_open &&` 分支（或 useMemo 额外依赖 outline_open，关闭时返回空数组）。
- [Medium][60] src/renderer/lib/workspace/pane.ts:127 — compute_visible_window 每次滚动从 0 线性扫描定位 start/end，且每帧重建 O(n) offsets 数组 — scroll 事件每帧触发（VirtualMessageList.tsx:114-119 set_scroll_top），每次调用 `compute_message_offsets` 重建 n+1 数组再线性扫描（t237 引入，commit 23c0e592a）；消息随 load_older 每页 50 条增长到千级、滚动到底部时每帧 O(n) 扫描+分配。offsets 单调递增，可二分。修复：start 定位改二分查找（offsets 单调）；offsets 数组仅在 messages/heights 变化时重建（如 useMemo + 缓存）。
- [Medium][55] src/renderer/views/PopupView.tsx:910 — 每次渲染同时渲染 live + mirror 两棵完整弹窗树，且 ProviderCard 的 memo 被不稳定回调持续击穿 — mirror（render_body(false,...)）在每次 PopupView 渲染都重建整棵 ProviderCard 树；toggle_expand_provider/toggle_l2open/toggle_account/refreshProvider/handleRefreshAll/handle_re_login 均为组件体内普通函数（每渲染新 identity，非 useCallback），ProviderOverview 透传的 onToggleExpandProvider/onRefreshProvider/onReLogin（内联箭头）随之每渲染变化，ProviderCard.tsx:57 的 memo 永不命中；叠加 useNowTick 30s tick 与快照 rAF 推送，弹窗内容被 2× 全量重建。t196 的 mirror 是刻意设计，但 memo 失效使其成本翻倍且无缓存。修复：上述 handler 包 useCallback（依赖打齐），onReLogin/renderExtraCard 等内联箭头改稳定引用，让 ProviderCard memo 生效。
- [Medium][50] src/renderer/views/SettingsView.tsx:595 — existingLabelMap/onSaveLabelMap 每次渲染新建对象/闭包，导致 SettingsForm 的标签映射 effect 每次渲染重跑 getState IPC — `existingLabelMap={(() => {...})()}`（595-606 行内联 IIFE 每次渲染新对象）、`onSaveLabelMap={async (id, map) => ...}`（607 行内联箭头新闭包）；SettingsForm.tsx:137-160 的 effect 依赖二者，而 SettingsView 在 config 保存、connector.list 回调、onStateChange 快照推送时都会重渲染 → 编辑弹窗打开期间每次快照推送都重发 connector.getState IPC 并重建 label rows。修复：existingLabelMap 用 useMemo、onSaveLabelMap 用 useCallback（依赖 config/pluginInfos 打齐）。
- [Low][40] src/renderer/views/settings-view/sections/general_section.tsx:108 — 代理地址 Input 每次按键触发一次完整 save_config（IPC + 全量写盘） — onChange 内 `Object.fromEntries(Object.entries(config).filter(...))` + save_config 每键击执行；输入 "http://127.0.0.1:7890" 约 20 次全量 config 写。use_config.save 串行队列仅防交错，不减少写次数。修复：Input 改为本地受控 state + 失焦/防抖后保存（复用 config-debounce 模式）。
- [Low][35] src/main/core/auth/kimi_oauth_manager.ts:161 — 每次 token HTTP 请求都异步读 ~/.kimi-code/device_id 文件 — build_headers() → get_device_id()（make_default_get_device_id 每次 fsp.readFile）；设备码轮询期每 ~5s 一次、每次 refresh 一次，文件只会在首次生成后不变。修复：进程内缓存 device_id（首次读取后存变量，仅生成/读失败时重读）。
- [Low][30] src/renderer/components/workspace/use-workspace-columns.ts:370 — FALLBACK_MS(30s) 定时器对全部 ready 列全量 query，与订阅推送重复 — setInterval(refresh_all, 30000)（FALLBACK_MS 见 workspace-view-helpers.ts:5）每 30s 对每个 ready 槽位发起 sessionHistory.query（IPC + 读会话文件 + merge_tail 全量合并），而订阅 onMessagesUpdated 已推送增量；多槽位大会话时每 30s 重复全量文件读。修复：降低频率或仅对最近无推送的列回退刷新；或将 query 限制增量范围。
- [Low][25] src/renderer/views/SettingsView.tsx:309 — 每次 config 变化都重跑 connector.list() 全量拉取 — effect 依赖 [config]，任何设置保存（含防抖合并后的每次写盘）都触发一次全量 connector.list IPC + setConnectorInfos 重建；onStateChange 已维护快照增量，list 只在结构变化时需要。修复：依赖改为结构性签名（如 removedConnectorIds/plugins 长度+instanceId 列表）或由 onConfigChange 事件驱动。
- [Info][20] connectors/opencode_go/connector.ts:54 — subscription_hash_from_query 对每个 createServerReference 变量在整个 JS bundle 上跑一次 usage_regex — 变量数×bundle 长度 的 O(n·m) 正则测试，仅 server-fn fallback 路径（HTML 无内联数据时）执行一次；低频但可加缓存或改用单次正则捕获组。属观察，非热点。
- [Info][15] public/frontend_demo/app/src/components/workspace/format.ts:15 — roleLabel 每次调用 find + 线性计数，segmentHeading/buildGrouped 每段重复 getSessionById + roleLabel — demo 数据量小（mock 会话），O(段数×消息数) 仅在复制/渲染时发生；演示代码，仅提示可预计算 role 序号。属观察。

## Reviewed files（19 bundles, 65 files）

- connectors/claude/connector.ts, connectors/claude/manifest.json
- connectors/getoneapi/connector.ts, connectors/getoneapi/manifest.json
- connectors/opencode_go/connector.ts, connectors/opencode_go/manifest.json
- public/frontend_demo/app/src/components/library/sessionMeta.ts, public/frontend_demo/app/src/components/workspace/format.ts, public/frontend_demo/app/src/hooks/use-mobile.ts, public/frontend_demo/app/src/lib/store.ts, public/frontend_demo/app/src/lib/types.ts, public/frontend_demo/app/src/lib/utils.ts, public/frontend_demo/app/tsconfig.app.json, public/frontend_demo/app/tsconfig.json, public/frontend_demo/app/tsconfig.node.json, public/frontend_demo/app/vite.config.ts, schemas/plugin-metadata.schema.json, schemas/plugin-output.schema.json, tsconfig.json, vite.web.config.ts
- src/main/core/auth/grok_oauth_manager.ts, src/main/core/auth/kimi_oauth_manager.ts, src/main/core/auth/oauth_helpers.ts
- src/main/core/network/effective_proxy.ts, src/main/core/network/proxy-pool.ts
- src/main/core/session/session-manager.ts
- src/main/e2e-headless.ts
- src/preload/log-throttle.ts
- src/renderer/components/AccountRow.tsx, CollapsibleCard.tsx, DeviceLoginSection.tsx, ProviderCard.tsx, SettingsForm.tsx, UsageRows.tsx, provider_card_states.tsx
- src/renderer/components/workspace/MarkdownMessage.tsx, PaneMessageRow.tsx, RecentSessionsModal.tsx, SelectionTray.tsx, SessionPane.tsx, SessionPickerModal.tsx, SessionRail.tsx, VirtualMessageList.tsx, WorkspaceToolbar.tsx, WorkspaceView.tsx, use-workspace-columns.ts, workspace-view-helpers.ts
- src/renderer/views/PopupView.tsx, SettingsView.tsx, TokenStatsView.tsx, TrayMenu.tsx, popup-view/EmptyState.tsx, popup-view/NetBanner.tsx, popup-view/SkeletonCard.tsx, popup-view/TitleBar.tsx, popup-view/UpcomingResetCardSlot.tsx, popup-view/lib.ts, settings-view/lib.ts, settings-view/sections/about_section.tsx, settings-view/sections/accounts_list.tsx, settings-view/sections/accounts_section.tsx, settings-view/sections/appearance_section.tsx, settings-view/sections/data_section.tsx, settings-view/sections/general_section.tsx
- src/web/main-web.tsx

## 执行的只读检查

- `git rev-parse HEAD` / `git log -1`：HEAD 与提交时间
- `git blame`：selection-store.ts:28-32（t226）、pane.ts:124-134（t237）、SessionPane.tsx:74-83（t225）、PopupView.tsx（t332）
- 上游/调用方追踪（跨 bundle 只读）：use_plugins（快照 rAF 批量 + snapshot_equal）、use_popup_derived（memo 链）、use_dnd_handlers（handler 稳定性）、use-config（save 串行队列、onConfigChange JSON.stringify 值比较）、config-debounce、use-now-tick（30s tick）、use-popup-height-report、use-resize-observer、provider-usage.ts（build_provider_usage_groups / build_overview_for_group / collect_upcoming_resets）、utils.ts（relative_time/format_reset_time）、index.ts:554/564/998/1011（reconcile_auto_refresh 调用频率）
- `wc -l` 确认剩余 schema/config 文件（JSON 契约，无 perf 面）
- 调用方 grep：selection_store.has / is_selected / reconcile_auto_refresh / start_auto_refresh
