# correctness | chunk 2 审查报告

- Perspective: correctness
- Chunk: 2（bundle `index % 6 == 1`）
- 审查 bundle 数：19 / 111
- 审查文件数：65
- HEAD SHA：`51ea3972efefea568cc2fba3e530ea5f69296182`
- 报告时间：2026-08-13

审查范围（按 bundle id）：`connectors_claude`、`connectors_getoneapi`、`connectors_opencode_go`、`root_config_04`、`src_main_core_auth`、`src_main_core_network`、`src_main_core_session`、`src_main_e2e_headless_ts`、`src_preload_log_throttle_ts`、`src_renderer_components_AccountDialog_tsx`、`src_renderer_components_CollapsibleCard_tsx`、`src_renderer_components_DeviceLoginSection_tsx`、`src_renderer_components_ProviderCard_tsx`、`src_renderer_components_SettingsForm_tsx`、`src_renderer_components_UsageRows_tsx`、`src_renderer_components_provider_card_states_tsx`、`src_renderer_components_workspace`、`src_renderer_views`、`src_web_main_web_tsx`。

## Findings

- [Medium][60] src/main/core/auth/grok_oauth_manager.ts:161-191 — 设备码登录取消在 HTTP 轮询窗口内丢失，取消后仍可能落库 token — `active_login_cancels` 只在 `sleep()` 内注册取消闭包；用户关闭登录对话框触发 `login_cancel` → `cancel_device_login` 时，若正处 `poll_once` HTTP 请求在途（含首个立即轮询），Map 中无条目，取消为 no-op，`cancelled_ref.current` 永不被置位，循环继续轮询直至用户授权或 30 分钟过期，`enqueue_token_mutation` 仍会把 token 写入 vault（kimi_oauth_manager.ts:223-236 同构同 bug；IPC 层 kimi_auth_ipc.ts:60 直接转发该 no-op）。单测 kimi_oauth_manager.test.ts:535 只覆盖 sleep 期间的取消，未覆盖轮询窗口。修复：await_completion 生命周期内注册单例取消闭包（或按 instance 维护 `cancel_requested` 标志，循环顶部与 mutation 内检查）。

- [Medium][55] connectors/opencode_go/connector.ts:397-400 — 任一 bundle 请求失败即整体中止 server-fn fallback，与尾部 allSettled 语义矛盾 — 并发窗内 `await Promise.race(executing)` 在任一 in-flight `get_raw` reject 时直接抛错，`server_fn_fallback` 整体失败（原始网络错误透出为账号级失败），即使其余 bundle 仍能产出 `nearest_subscription_hash`；而收尾用 `Promise.allSettled`（容忍失败），语义不一致。修复：每批用 settle 容忍方式等待（如 `Promise.allSettled` 限并发，或对每个 promise catch 后继续），失败 bundle 仅跳过。

- [Low][45] connectors/opencode_go/connector.ts:423-425 — fallback 要求 rolling/weekly/monthly 三窗口齐全，部分数据直接抛错，与 HTML 主路径的容错不一致 — HTML 路径 `parse_usage_from_html` 返回部分 payload（能找到几个窗口就返回几个），而 legacy fallback 任一窗口缺失即 throw「OpenCode Go usage response invalid」，账号丢失全部窗口数据而非展示可用部分。修复：与 HTML 路径一致，仅返回已解析窗口。

- [Low][50] src/preload/log-throttle.ts:26-31 — 墙钟回拨导致节流窗口永久冻结，渲染进程日志被静默丢弃 — `roll_window` 用 `now_ms - window_started_ms < window_ms` 判定；系统时钟回拨（NTP 校正/手动改时）使差值为负且持续 `< window_ms`，`accept()` 永远返回 `{accepted:false}`、`flush_notice()` 恒返回 null，直到墙钟追回旧 `window_started_ms`，期间日志静默丢弃。修复：改用单调时钟（`performance.now()`），或检测 `now_ms < window_started_ms` 时强制滚窗。

- [Low][45] src/main/core/auth/grok_oauth_manager.ts:430-434 — `stop_auto_refresh` 未清理 `retry_failure_counts`（kimi 版清理）— kimi 版 `stop_auto_refresh` 有 `retry_failure_counts.delete(instance_id)`（kimi_oauth_manager.ts:477），grok 版缺省；停/启循环后陈旧失败计数保留，后续单次非终止刷新失败即可越过 `MAX_REFRESH_RETRIES`(10)，该实例的自动刷新重试被静默停摆（直到一次手动刷新成功才清除）。修复：grok 版 stop 时同步清理计数。

- [Low][40] src/renderer/components/SettingsForm.tsx:202-206 — 1.5s 内连续两次保存时，旧 saved 定时器提前清除「已保存」状态 — `saved_timeout_ref.current` 赋值前未 clearTimeout；第一次保存的 timer 在第二次保存成功后触发 `setSaved(false)`，指示器提前熄灭（纯 UI 状态，无数据影响）。修复：设置新 timer 前先 `clearTimeout(saved_timeout_ref.current)`。

- [Info][35] src/renderer/components/DeviceLoginSection.tsx:194-198 — `device_code.user_code` 为 falsy 时 else 分支渲染空 `<code>` — 三元 else 分支输出「输入代码：」+ 空字符串，属不可达死分支（`start_device_login` 校验 user_code 必为 string，use-device-login.ts:95 无条件写入 display）。修复：删除该分支或渲染兜底文案。

- [Low][30] connectors/getoneapi/connector.ts:51 — `code !== 200` 严格比较，字符串型 code 会误判为 API 错误 — 若网关返回 `code: "200"`（字符串）或缺失 code，`"200" !== 200` 成立 → 抛「GetOneAPI API 错误」并吞掉正常 balance；code 缺失时消息为 `GetOneAPI API 错误: undefined`（JSON.stringify(undefined)）。修复：`Number(code) !== 200` 或显式容错。

## Reviewed files

- connectors/claude/connector.ts、connectors/claude/manifest.json
- connectors/getoneapi/connector.ts、connectors/getoneapi/manifest.json
- connectors/opencode_go/connector.ts、connectors/opencode_go/manifest.json
- public/frontend_demo/app/src/components/library/sessionMeta.ts、public/frontend_demo/app/src/components/workspace/format.ts、public/frontend_demo/app/src/hooks/use-mobile.ts、public/frontend_demo/app/src/lib/store.ts、public/frontend_demo/app/src/lib/types.ts、public/frontend_demo/app/src/lib/utils.ts、public/frontend_demo/app/tsconfig.app.json、public/frontend_demo/app/tsconfig.json、public/frontend_demo/app/tsconfig.node.json、public/frontend_demo/app/vite.config.ts、public/frontend_demo/app/components.json、public/frontend_demo/app/package.json、public/frontend_demo/app/pnpm-workspace.yaml、schemas/plugin-metadata.schema.json、schemas/plugin-output.schema.json、tsconfig.json、vite.web.config.ts
- src/main/core/auth/grok_oauth_manager.ts、src/main/core/auth/kimi_oauth_manager.ts、src/main/core/auth/oauth_helpers.ts
- src/main/core/network/effective_proxy.ts、src/main/core/network/proxy-pool.ts
- src/main/core/session/session-manager.ts
- src/main/e2e-headless.ts
- src/preload/log-throttle.ts
- src/renderer/components/AccountDialog.tsx、CollapsibleCard.tsx、DeviceLoginSection.tsx、ProviderCard.tsx、SettingsForm.tsx、UsageRows.tsx、provider_card_states.tsx
- src/renderer/components/workspace/（MarkdownMessage.tsx、PaneMessageRow.tsx、RecentSessionsModal.tsx、SelectionTray.tsx、SessionPane.tsx、SessionPickerModal.tsx、SessionRail.tsx、VirtualMessageList.tsx、WorkspaceToolbar.tsx、WorkspaceView.tsx、use-workspace-columns.ts、workspace-view-helpers.ts）
- src/renderer/views/（PopupView.tsx、SettingsView.tsx、TokenStatsView.tsx、TrayMenu.tsx、popup-view/EmptyState.tsx、popup-view/NetBanner.tsx、popup-view/SkeletonCard.tsx、popup-view/TitleBar.tsx、popup-view/UpcomingResetCardSlot.tsx、popup-view/lib.ts、settings-view/lib.ts、settings-view/sections/about_section.tsx、settings-view/sections/accounts_list.tsx、settings-view/sections/accounts_section.tsx、settings-view/sections/appearance_section.tsx、settings-view/sections/data_section.tsx、settings-view/sections/general_section.tsx）
- src/web/main-web.tsx

## 执行的只读检查

- 读取 `docs/reviews/review_20260813_114911/_meta/bundle.json` 全量 111 bundle 元数据，按 `index % 6 == 1` 选出 19 个 bundle（index 1/7/13/19/25/31/37/43/49/55/61/67/73/79/85/91/97/103/109）。
- `git rev-parse HEAD`（51ea3972）、`git status --short`、`git log --oneline` 检查 grok_oauth_manager/opencode_go 连接器/log-throttle 的历史（t109/t115/t127/t175、11ada107）。
- 追踪 ctx.params 契约：`src/main/core/connector/host-io.ts:45`（`Record<string,string>`）+ `src/main/core/scheduler/refresh-service.ts:118-153`（`String()` 统一强转、secret 走 vault）——确认 getoneapi `parse_limit` 无 `.trim()` 崩溃风险。
- 追踪 `connector.refresh` 参数：`src/main/ipc/connector-ipc.ts:128-129`（`sourceInstanceId === instanceId`），确认 PopupView 用 `sourceInstanceId` 无错配。
- 追踪 sessionHistory 推送语义：`src/main/ipc/session-history-ipc.ts:146-156` + `subscription-service.ts:65`（on_update 仅含新增消息），确认 use-workspace-columns `merge_tail` 追加语义正确。
- 追踪 `await_completion`/`logout` IPC 调用方：`src/main/ipc/kimi_auth_ipc.ts:40-95`（try/catch 包住，无 unhandled rejection）。
- 检查阈值契约：`src/shared/lib/connector-thresholds.ts`（`for_pct` 对 100 依然 critical，claude 连接器 pct 截断不掩盖状态）。
- 检查单测覆盖：`tests/unit/auth/kimi_oauth_manager.test.ts:535-551`（cancel 仅覆盖 sleep 窗口）、`tests/unit/auth/grok_oauth_manager.test.ts`、`tests/unit/preload/oauth_api.test.ts`。
- 校验 JSON 配置可解析（schemas/plugin-\*.schema.json、demo components.json/package.json）；pnpm-workspace.yaml 为 YAML 非 JSON。
- 追踪 renderer 侧辅助：`use-device-login.ts`、`refresh-intervals.ts`、`utils.ts`（relative_time/format_reset_time）、`use-plugins.ts`（snapshot 深比较/值相等保引用）、`workspace/slots.ts`、`workspace/workspace-storage.ts`、`workspace/pane.ts`、`device-login-url.ts`。
