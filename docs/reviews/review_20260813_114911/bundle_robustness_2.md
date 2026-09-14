# Robustness Review — chunk 2

- Perspective: robustness
- Chunk: 2（bundle index % 6 == 1）
- Bundles reviewed: 19 / 111
- Files reviewed: 66
- HEAD SHA: `51ea3972efefea568cc2fba3e530ea5f69296182`

覆盖 bundle：connectors_claude / connectors_getoneapi / connectors_opencode_go / root_config_04 / src_main_core_auth / src_main_core_network / src_main_core_session / src_main_e2e_headless_ts / src_preload_log_throttle_ts / AccountDialog / CollapsibleCard / DeviceLoginSection / ProviderCard / SettingsForm / UsageRows / provider_card_states / src_renderer_components_workspace(12) / src_renderer_views(17) / src_web_main_web_tsx。

审查范围仅 robustness（错误处理、失败回滚、超时、重试、幂等、竞态防护、日志上下文、静默失败、恢复能力）；不含安全。

______________________________________________________________________

- [Medium][70] src/main/core/auth/grok_oauth_manager.ts:392 — OAuth 自动刷新链路无错误处理：vault 读失败 → unhandled rejection + 自动刷新静默中断 — `schedule_auto_refresh_if_enabled` 是 async 函数，其 `await load_tokens(...)`（grok:392、kimi:436）不在任何 try/catch 内，而 `load_tokens` 调 `vault.get` 可抛错（`file-vault-backend.ts` `read_vault` 在 vault 与 .bak 均损坏时 throw、磁盘 IO 错误时 throw）。所有调用方均为 `void schedule_auto_refresh_if_enabled(...)`（grok:218/261/328/370/427/445/471/490）无 catch → rejection 落入主进程 `process.on("unhandledRejection")`（`src/main/index.ts:109`，只打日志）→ 该 instance 的自动刷新链静默中断（timer 未重排），下次刷新只能等 reconcile/start_auto_refresh，期间 token 过期用户无感知。同构缺口：`refresh_now` 的 `load_tokens` 在 try 外（grok:293、kimi:336），`schedule_retry` 的 timer 回调 `void refresh_now(...).then(...)`（grok:377、kimi:421）无 `.catch`，同一触发路径同样 unhandled。 — 修复建议：`schedule_auto_refresh_if_enabled` 整体包 try/catch（失败 log.error 并保留 instance 待下次调度）；`refresh_now` 把 `load_tokens` 移入 try；timer 回调统一 `.catch()` 且 catch 中打含 instance_id 的日志。

- [Medium][65] src/renderer/components/workspace/use-workspace-columns.ts:213 — mount_column 的 query 结果直接覆盖订阅推送的新消息（竞态丢消息） — `mount_column` 并发发起 `sessionHistory.subscribe` 与 `sessionHistory.query`。订阅推送经 `onMessagesUpdated` 以 `merge_tail` 并入 `columns[key].messages`（355-364）；若推送先于 query resolve 到达（新消息已在 cur.messages），query 完成时 `messages: q.messages` 直接替换（213 行，非 merge）→ 已推送的新消息被旧快照覆盖丢失，直到下一次推送或 30s `FALLBACK_MS` interval 兜底（370 行 `refresh_all`）。`refresh_all` 自身用 `merge_tail`（330 行）保留消息，行为不一致，证明这是疏漏而非设计。 — 修复建议：query 完成后用 `merge_tail(cur.messages, q.messages)`（或按时间序 merge）替代直接赋值；与 refresh_all 保持同一合并语义。

- [Medium][60] src/renderer/components/SettingsForm.tsx:179 — perform_save 多步保存部分失败无回滚，UI 误导为「保存失败」而账号实际已保存 — perform_save 顺序执行 `onSave`（账号+secret 持久化）→ `onSaveLabelMap`（标签映射）→ `onForcePercentChange`（统一百分比）。后两步失败时进入 catch → `setSaveError(msg)` 返回 false，UI 显示「保存失败」并要求重试；但 `onSave` 副作用已提交，重试会重复写盘（label/force-percent 步骤幂等性依赖上游实现）。 — 修复建议：catch 中区分已提交阶段，错误文案注明「账号已保存，但 xxx 保存失败」；或对可重试步骤单独重试；至少不要用笼统「保存失败」覆盖已成功的持久化。

- [Medium][55] src/preload/log-throttle.ts:27 — 基于 Date.now() 的限流窗口在系统时钟回拨后永不翻转，日志静默全丢 — `roll_window` 判 `now_ms - window_started_ms < window_ms` 为「未过期」；调用方（`src/preload/index.ts:510`）传 `Date.now()`。系统时钟回拨（NTP 校正、手动改时间）使差值变负 → 窗口永不翻转 → `accepted_count` 停在 limit，`accept` 永久拒绝（drop 无限累积），`flush_notice` 恒返回 null，renderer 日志被静默丢弃且无 notice 输出，直到进程重启。 — 修复建议：改用单调时钟 `performance.now()`（preload 可用），或在 `now_ms < window_started_ms` 时强制重置窗口。

- [Low][70] src/main/core/auth/grok_oauth_manager.ts:347 — logout 不取消进行中的设备登录（kimi 同路径有 cancel） — grok 的 `logout` 仅 `cancel_auto_refresh_timer` + 清 token；kimi 的 `logout`（kimi_oauth_manager.ts:391）额外调 `cancel_device_login(instance_id)`。grok 在设备登录轮询期间 logout：poll 不会停止（cancel 未注册），继续占用网络直到 expires。token 保存被 `generation` 检查（210 行）兜底阻止，无数据损坏，但行为不对称、网络与日志噪音持续，且注销语义「应立即终止登录」未满足。 — 修复建议：grok `logout` 与 kimi 对齐，先 `cancel_device_login(instance_id)`。

- [Low][60] src/main/core/auth/oauth_helpers.ts:142 — store_tokens 部分写失败造成 vault 半更新 — `store_tokens` 顺序写 access → refresh（可选）→ expires_at；任一步 `vault.set` 抛错（磁盘/权限）则调用方整体失败（refresh 返回失败），但已成功的键已落盘：如 access 已更新而 refresh/expires 未更新 → 下次 refresh 用旧 refresh + 新 access 且过期时间未续，vault 处于不一致中间态且无补偿。 — 修复建议：任一步失败时回滚已写键（写前快照旧值，失败恢复）或接受不一致并记录告警日志；至少对三键写入做显式一致性说明。

- [Low][55] src/renderer/views/SettingsView.tsx:183 — 删除/恢复账号的 `void save_config(...)` 无 catch，失败静默 — `restoreOverrideAccount`（183 行）、ConfirmDelete onConfirm（713/740 行）等以 `void save_config({...})` fire-and-forget；`save_config` 底层 `config.save` IPC 失败时 rejection 无人消费（renderer 仅 console 警告），对话框已关闭、UI 无任何失败提示，用户以为操作成功。 — 修复建议：统一走带 catch 的保存 helper（如 settings-view/lib 的 `trigger_background_refresh` 模式），失败时 `log.error` 并在 UI 显示可读错误。

- [Low][50] src/renderer/views/settings-view/sections/accounts_list.tsx:103 — on_refresh 的 `void window.usageboard.connector.refresh(instance_id)` 无 catch — 103-105 与 181-183 两处 fire-and-forget 刷新，IPC 拒绝（实例已删、connector 故障）时 rejection 未消费，仅 renderer console 警告，无用户反馈。 — 修复建议：加 `.catch()` 打日志（复用 `trigger_background_refresh` 已有实现）。

- [Low][60] src/renderer/lib/config-debounce.ts:44 — debounce flush 失败即丢 patch，无重试，偏好静默丢失 — `flush_pending` 在 `await opts.get()` 之前已 `pending = {}`；get 或 save 失败 → `.catch` 只调 `on_error`（PopupView 中仅打日志），本次合并的 UI 偏好（折叠/排序/窗口偏好）不再重试写入，重启后回退。UI 已乐观生效，用户感知不到持久化失败。 — 修复建议：失败时把 patch 合并回 pending 并安排有限次退避重试（或保留到下次 patch 触发时合并重写）。

- [Low][55] src/main/core/session/session-manager.ts:179 — cookie 捕获成功但 vault.set 失败时，用户得到无上下文的错误且 cookie 丢失 — `save_cookie_on_close` 中 `await deps.vault.set(...)` 抛错 → `reject(to_error(error))`（186 行），窗口已关闭、cookie 未保存，调用方（IPC/UI）只能显示原始 vault 错误串，用户无法区分「未捕获」与「保存失败」，且必须重开完整登录流程。 — 修复建议：catch 中包装可读错误（如「登录成功但保存失败，请重试」），并考虑把 captured_cookie 留给重试入口。

- [Info][80] src/main/core/auth/grok_oauth_manager.ts:449 — shutdown 未清 retry_failure_counts（kimi 同路径已清） — kimi 的 `shutdown`（kimi_oauth_manager.ts:497）清 `retry_failure_counts`，grok 只清 enabled 集合/options/timers。当前进程退出即销毁 map，无实际泄漏；两实现漂移，后续若 shutdown 后复用 manager 会残留失败计数。 — 修复建议：与 kimi 对齐，shutdown 补 `retry_failure_counts.clear()`。

- [Info][45] connectors/opencode_go/connector.ts:397 — fallback 并发拉 bundle 用 `Promise.race(executing)`，任一 bundle 请求失败即中止整个链 — `server_fn_fallback` 中 race 的 rejection 直接传播 → fallback 整体 throw，尽管其余 bundle 可能正常；最终行为与后续 `hash 缺失 throw "页面协议可能已变更"` 相似（都是失败），但错误信息误导（网络瞬断报「协议变更」）。get_raw 有 15s 默认超时（net-client.ts:238），不会无限挂起。 — 修复建议：race 改用 `Promise.allSettled` 逐个收集，或 catch 后跳过失败 bundle 继续拉剩余。

______________________________________________________________________

No Critical/High findings. 最高级别 Medium。

## Reviewed files（66）

connectors/claude/connector.ts, connectors/claude/manifest.json, connectors/getoneapi/connector.ts, connectors/getoneapi/manifest.json, connectors/opencode_go/connector.ts, connectors/opencode_go/manifest.json; public/frontend_demo/app/src/components/library/sessionMeta.ts, public/frontend_demo/app/src/components/workspace/format.ts, public/frontend_demo/app/src/hooks/use-mobile.ts, public/frontend_demo/app/src/lib/store.ts, public/frontend_demo/app/src/lib/types.ts, public/frontend_demo/app/src/lib/utils.ts, public/frontend_demo/app/tsconfig.app.json, public/frontend_demo/app/tsconfig.json, public/frontend_demo/app/tsconfig.node.json, public/frontend_demo/app/vite.config.ts, schemas/plugin-metadata.schema.json, schemas/plugin-output.schema.json, tsconfig.json, vite.web.config.ts; src/main/core/auth/grok_oauth_manager.ts, src/main/core/auth/kimi_oauth_manager.ts, src/main/core/auth/oauth_helpers.ts; src/main/core/network/effective_proxy.ts, src/main/core/network/proxy-pool.ts; src/main/core/session/session-manager.ts; src/main/e2e-headless.ts; src/preload/log-throttle.ts; src/renderer/components/AccountDialog.tsx, CollapsibleCard.tsx, DeviceLoginSection.tsx, ProviderCard.tsx, SettingsForm.tsx, UsageRows.tsx, provider_card_states.tsx; src/renderer/components/workspace/{MarkdownMessage,PaneMessageRow,RecentSessionsModal,SelectionTray,SessionPane,SessionPickerModal,SessionRail,VirtualMessageList,WorkspaceToolbar,WorkspaceView,use-workspace-columns,workspace-view-helpers}.\*; src/renderer/views/{PopupView,SettingsView,TokenStatsView,TrayMenu}.tsx; src/renderer/views/popup-view/{EmptyState,NetBanner,SkeletonCard,TitleBar,UpcomingResetCardSlot,lib}.tsx; src/renderer/views/settings-view/lib.ts; src/renderer/views/settings-view/sections/{about_section,accounts_list,accounts_section,appearance_section,data_section,general_section}.tsx; src/web/main-web.tsx.

## 执行过的只读检查

- 读取 `docs/reviews/review_20260813_114911/_meta/bundle.json`，按 id 排序后取 `index % 6 == 1` 的 19 个 bundle，全文件读取 66 个文件当前 HEAD 内容。
- 追踪上游/关联实现：`src/main/ipc/grok_auth_ipc.ts`、`src/main/ipc/kimi_auth_ipc.ts`（IPC 层错误处理）、`src/main/core/vault/file-vault-backend.ts` + `vault-backend.ts`（vault.get/set 抛错路径、.bak 恢复）、`src/main/core/connector/host-io.ts` + `net-client.ts` + `runtime.ts`（http 15s 默认超时、脚本执行超时）、`src/main/index.ts`（unhandledRejection handler 行为）、`src/renderer/hooks/use-device-login.ts`（cancel 语义）、`src/renderer/hooks/use_popup_derived.ts` + `src/shared/types/ipc.ts`（ProviderError.error/instanceIds 类型，确认非空）、`src/shared/lib/auth-error.ts`、`src/renderer/lib/cookie_login_poll.ts`、`src/renderer/lib/config-debounce.ts`、`src/renderer/hooks/use-plugins.ts`、`src/renderer/lib/workspace/workspace-storage.ts`、`src/renderer/lib/workspace/pane.ts` + ipc timestamp 类型、`src/preload/index.ts:495-520`（log-throttle 调用与时钟）、`src/web/usageboard-web.ts`（grok/kimi namespace 存在性）、`src/renderer/components/ProviderOverview.tsx`（ProviderError 定义）。
- git 检查：HEAD `51ea3972`；`git log` 查看 oauth/session 相关提交（t127/t109/A16、t337/t278）；确认测试存在性（tests/unit/auth/grok_oauth_manager.test.ts 964 行、kimi 869 行，覆盖 refresh 合并/terminal 错误等；未发现 vault.get 抛错路径的覆盖）。
